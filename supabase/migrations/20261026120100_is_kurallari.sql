-- Emek Sermaye · 2/4 · İş kuralları (fonksiyonlar)
-- Para hesabı: brüt = dakika × dakika ücreti; işletme = dakika × işletme ücreti;
-- platform payı = brüt × kaynak oranı; net = brüt − işletme − platform payı.

/* ---------- yardımcılar ---------- */

-- Bir işte t anına kadar tamamlanan parça sayısı (ayar süresinden sonra her çevrimde bir parça)
create or replace function public.parts_done(p_start timestamptz, p_setup_min integer, p_cycle_min numeric, p_qty integer, p_t timestamptz)
returns integer
language sql immutable
set search_path = ''
as $$
  select case
    when p_cycle_min is null or p_qty is null then 0
    when p_t <= p_start + make_interval(mins => coalesce(p_setup_min, 0)) then 0
    else least(p_qty, floor(extract(epoch from (p_t - p_start - make_interval(mins => coalesce(p_setup_min, 0)))) / (p_cycle_min * 60) + 0.000000001)::integer)
  end
$$;

create or replace function public.procurement_total_days()
returns integer
language sql stable
set search_path = ''
as $$ select coalesce(sum(days), 0)::integer from public.procurement_steps $$;

create or replace function public.current_investor_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$ select i.id from public.investors i where i.user_id = auth.uid() $$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.staff s where s.user_id = auth.uid()) $$;

create or replace function public.owns_machine(p_machine text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.machines m join public.investors i on i.id = m.investor_id
    where m.id = p_machine and i.user_id = auth.uid()
  )
$$;

create or replace function public.new_investor_code()
returns text
language plpgsql volatile
set search_path = ''
as $$
declare v text;
begin
  loop
    v := 'INV-' || lpad((1000 + floor(random() * 9000))::integer::text, 4, '0');
    exit when not exists (select 1 from public.investors where code = v);
  end loop;
  return v;
end $$;

-- Giriş yapan kullanıcının yatırımcı kaydı yoksa oluşturur
create or replace function public.ensure_investor()
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid; v_name text;
begin
  if auth.uid() is null then return null; end if;
  select id into v_id from public.investors where user_id = auth.uid();
  if v_id is not null then return v_id; end if;
  select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1))
    into v_name from auth.users u where u.id = auth.uid();
  insert into public.investors (user_id, code, display_name)
  values (auth.uid(), public.new_investor_code(), coalesce(v_name, 'Yatırımcı'))
  returning id into v_id;
  return v_id;
end $$;

-- Yeni kayıt olan her kullanıcıya bir yatırımcı kaydı açılır
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.investors (user_id, code, display_name)
  values (new.id, public.new_investor_code(),
          coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1), 'Yatırımcı'))
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* ---------- zemin planı ve takvim ---------- */

create or replace function public.machine_status(p_machine text, p_at timestamptz default now())
returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when m.status = 'procurement' then 'proc'
    when j.id is null then 'idle'
    when j.kind = 'maint' then 'maint'
    when p_at < j.starts_at + make_interval(mins => coalesce(j.setup_min, 0)) then 'setup'
    else 'running'
  end
  from public.machines m
  left join lateral (
    select x.id, x.kind, x.starts_at, x.setup_min from public.jobs x
    where x.machine_id = m.id and x.starts_at <= p_at and x.ends_at > p_at
    limit 1
  ) j on true
  where m.id = p_machine
$$;

-- Tüm tesislerdeki makineler (sahibinin yalnızca kodu görünür)
create or replace function public.list_machines()
returns table (
  id text, factory_id text, slot_code text, axes smallint, status text,
  ordered_at timestamptz, commissioned_at timestamptz, own_share_target numeric,
  owner_code text, is_mine boolean, live_status text
)
language sql stable security definer
set search_path = ''
as $$
  select m.id, m.factory_id, m.slot_code, m.axes, m.status, m.ordered_at, m.commissioned_at, m.own_share_target,
         i.code, coalesce(i.user_id = auth.uid(), false), public.machine_status(m.id, now())
  from public.machines m
  join public.investors i on i.id = m.investor_id
  order by m.factory_id, m.slot_code
$$;

-- Takvim: herkes doluluğu görür; müşteri ve sipariş no yalnızca sahibine ve personele açıktır
create or replace function public.public_jobs(p_from timestamptz, p_to timestamptz, p_machine text default null)
returns table (
  id bigint, machine_id text, kind text, title text, material text, cycle_min numeric, qty integer,
  setup_min integer, source text, customer_name text, order_no text, starts_at timestamptz, ends_at timestamptz, is_mine boolean
)
language plpgsql stable security definer
set search_path = ''
as $$
declare v_staff boolean := public.is_staff();
begin
  if p_to <= p_from then
    raise exception 'Bitiş zamanı başlangıçtan sonra olmalı.' using errcode = '22023';
  end if;
  if p_to - p_from > interval '120 days' then
    raise exception 'En fazla 120 günlük aralık istenebilir.' using errcode = '22023';
  end if;
  return query
    select j.id, j.machine_id, j.kind, j.title, j.material, j.cycle_min, j.qty, j.setup_min, j.source,
           case when v.mine then j.customer_name end,
           case when v.mine then j.order_no end,
           j.starts_at, j.ends_at, v.mine
    from public.jobs j
    join public.machines m on m.id = j.machine_id
    join public.investors i on i.id = m.investor_id
    cross join lateral (select coalesce(i.user_id = auth.uid(), false) or v_staff as mine) v
    where j.starts_at < p_to and j.ends_at > p_from
      and (p_machine is null or j.machine_id = p_machine)
    order by j.machine_id, j.starts_at;
end $$;

/* ---------- satın alma ---------- */

create or replace function public.purchase_machine(
  p_factory text, p_slot text, p_axes smallint,
  p_own_share numeric default 0.5, p_expected_util numeric default 0.7
)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_f   public.factories%rowtype;
  v_t   public.machine_types%rowtype;
  v_inv uuid;
  v_id  text;
  v_sim boolean;
  v_max integer;
begin
  if auth.uid() is null then
    raise exception 'Satın almak için giriş yapmalısınız.' using errcode = '42501';
  end if;
  select * into v_f from public.factories where id = p_factory;
  if not found then
    raise exception 'Tesis bulunamadı: %', p_factory using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.slots s where s.factory_id = p_factory and s.code = p_slot) then
    raise exception 'Slot bulunamadı: %', p_slot using errcode = 'P0002';
  end if;
  select * into v_t from public.machine_types where axes = p_axes;
  if not found then
    raise exception 'Geçersiz makine tipi: % eksen', p_axes using errcode = '22023';
  end if;
  if p_own_share is null or p_own_share < 0 or p_own_share > 1
     or p_expected_util is null or p_expected_util < 0 or p_expected_util > 1 then
    raise exception 'Kendi iş payı ve doluluk 0 ile 1 arasında olmalı.' using errcode = '22023';
  end if;

  v_inv := public.ensure_investor();
  -- Ödeme bağlanana kadar kötüye kullanımı sınırla: bekleyen sipariş sayısı
  perform 1 from public.investors where id = v_inv for update;
  select coalesce((s.value)::integer, 3) into v_max from public.app_settings s where s.key = 'max_open_orders';
  v_max := coalesce(v_max, 3);
  if (select count(*) from public.machines where investor_id = v_inv and status = 'procurement') >= v_max then
    raise exception 'Aynı anda en fazla % bekleyen siparişiniz olabilir.', v_max using errcode = 'P0001';
  end if;
  v_id  := v_f.code || '-' || p_slot;
  select coalesce((s.value)::boolean, false) into v_sim from public.app_settings s where s.key = 'simulate_jobs';

  begin
    insert into public.machines (id, factory_id, slot_code, axes, investor_id, status, ordered_at, own_share_target, expected_util, is_demo)
    values (v_id, p_factory, p_slot, p_axes, v_inv, 'procurement', now(), p_own_share, p_expected_util, coalesce(v_sim, false));
  exception when unique_violation then
    raise exception 'Bu slot dolu: % %', v_f.short_name, p_slot using errcode = '23505';
  end;

  insert into public.purchase_orders (machine_id, investor_id, axes, price, install_fee, deposit, own_share_target, expected_util)
  values (v_id, v_inv, p_axes, v_t.price, v_t.install_fee, round((v_t.price + v_t.install_fee) * 0.30, 2), p_own_share, p_expected_util);

  return v_id;
end $$;

/* ---------- yatırımcı kâr hesapları ---------- */

-- Makine başına özet: [p_from, min(p_to, p_as_of)) aralığında gerçekleşen değerler.
-- Planlanan değerler için p_as_of => 'infinity' verilebilir.
create or replace function public.investor_stats(p_from timestamptz, p_to timestamptz, p_as_of timestamptz default now())
returns table (
  machine_id text, window_minutes numeric, minutes numeric, own_minutes numeric, platform_minutes numeric, maint_minutes numeric,
  parts integer, own_parts integer, platform_parts integer,
  gross numeric, op_cost numeric, fee numeric, net numeric,
  own_gross numeric, own_fee numeric, own_net numeric, platform_gross numeric, platform_fee numeric, platform_net numeric,
  cost_operator numeric, cost_electricity numeric, cost_maintenance numeric, cost_tooling numeric, cost_facility numeric, cost_insurance numeric,
  util numeric
)
language sql stable security definer
set search_path = ''
as $$
  with my as (
    select m.id, t.rate_per_min, t.op_rate,
           t.cost_operator c_op, t.cost_electricity c_el, t.cost_maintenance c_ma, t.cost_tooling c_to, t.cost_facility c_fa, t.cost_insurance c_in,
           greatest(p_from, m.commissioned_at) as a,
           least(p_to, p_as_of) as b
    from public.machines m
    join public.investors i on i.id = m.investor_id
    join public.machine_types t on t.axes = m.axes
    where i.user_id = auth.uid() and m.status = 'active' and m.commissioned_at is not null
  ),
  seg as (
    select my.id, j.kind, j.source, coalesce(f.rate, 0) as fee_rate,
           extract(epoch from (least(j.ends_at, my.b) - greatest(j.starts_at, my.a))) / 60.0 as mins,
           case when j.kind = 'job'
             then public.parts_done(j.starts_at, j.setup_min, j.cycle_min, j.qty, least(j.ends_at, my.b))
                - public.parts_done(j.starts_at, j.setup_min, j.cycle_min, j.qty, greatest(j.starts_at, my.a))
             else 0 end as parts
    from my
    join public.jobs j on j.machine_id = my.id and j.starts_at < my.b and j.ends_at > my.a
    left join public.fee_rates f on f.source = j.source
  ),
  agg as (
    select my.id, my.a, my.b, my.rate_per_min r, my.op_rate o, my.c_op, my.c_el, my.c_ma, my.c_to, my.c_fa, my.c_in,
      coalesce(sum(s.mins) filter (where s.kind = 'job'), 0) as mins,
      coalesce(sum(s.mins) filter (where s.kind = 'job' and s.source = 'own'), 0) as own_mins,
      coalesce(sum(s.mins) filter (where s.kind = 'job' and s.source = 'platform'), 0) as plat_mins,
      coalesce(sum(s.mins) filter (where s.kind = 'maint'), 0) as maint_mins,
      coalesce(sum(s.parts), 0)::integer as parts,
      coalesce(sum(s.parts) filter (where s.source = 'own'), 0)::integer as own_parts,
      coalesce(sum(s.parts) filter (where s.source = 'platform'), 0)::integer as plat_parts,
      coalesce(sum(s.mins * s.fee_rate) filter (where s.kind = 'job' and s.source = 'own'), 0) as own_fee_mins,
      coalesce(sum(s.mins * s.fee_rate) filter (where s.kind = 'job' and s.source = 'platform'), 0) as plat_fee_mins
    from my left join seg s on s.id = my.id
    group by my.id, my.a, my.b, my.rate_per_min, my.op_rate, my.c_op, my.c_el, my.c_ma, my.c_to, my.c_fa, my.c_in
  )
  select id,
    greatest(0, extract(epoch from (b - a)) / 60.0),
    mins, own_mins, plat_mins, maint_mins,
    parts, own_parts, plat_parts,
    mins * r, mins * o, (own_fee_mins + plat_fee_mins) * r,
    mins * r - mins * o - (own_fee_mins + plat_fee_mins) * r,
    own_mins * r, own_fee_mins * r, own_mins * r - own_mins * o - own_fee_mins * r,
    plat_mins * r, plat_fee_mins * r, plat_mins * r - plat_mins * o - plat_fee_mins * r,
    mins * c_op, mins * c_el, mins * c_ma, mins * c_to, mins * c_fa, mins * c_in,
    case when b > a then mins / (extract(epoch from (b - a)) / 60.0) else 0 end
  from agg
  order by id
$$;

-- Gün × makine kırılımı (ısı haritası ve günlük grafik için). Günler p_tz saat dilimine göre bölünür.
create or replace function public.investor_daily_stats(
  p_from_day date, p_to_day date, p_tz text default 'Europe/Istanbul',
  p_as_of timestamptz default now(), p_machine text default null
)
returns table (
  day date, machine_id text, window_minutes numeric, minutes numeric, parts integer,
  gross numeric, op_cost numeric, fee numeric, net numeric, own_net numeric, platform_net numeric, util numeric
)
language sql stable security definer
set search_path = ''
as $$
  with my as (
    select m.id, m.commissioned_at, t.rate_per_min r, t.op_rate o
    from public.machines m
    join public.investors i on i.id = m.investor_id
    join public.machine_types t on t.axes = m.axes
    where i.user_id = auth.uid() and m.status = 'active' and m.commissioned_at is not null
      and (p_machine is null or m.id = p_machine)
  ),
  days as (
    select g::date as day,
           (g::date::timestamp at time zone p_tz) as ds,
           ((g::date + 1)::timestamp at time zone p_tz) as de
    from generate_series(p_from_day::timestamp, p_to_day::timestamp, interval '1 day') g
  ),
  win as (
    select d.day, my.id, my.r, my.o,
           greatest(d.ds, my.commissioned_at) as a,
           least(d.de, p_as_of) as b
    from days d cross join my
  ),
  seg as (
    select w.day, w.id, j.source, coalesce(f.rate, 0) as fee_rate,
           extract(epoch from (least(j.ends_at, w.b) - greatest(j.starts_at, w.a))) / 60.0 as mins,
           public.parts_done(j.starts_at, j.setup_min, j.cycle_min, j.qty, least(j.ends_at, w.b))
             - public.parts_done(j.starts_at, j.setup_min, j.cycle_min, j.qty, greatest(j.starts_at, w.a)) as parts
    from win w
    join public.jobs j on j.machine_id = w.id and j.kind = 'job' and j.starts_at < w.b and j.ends_at > w.a
    left join public.fee_rates f on f.source = j.source
  )
  select w.day, w.id,
    greatest(0, extract(epoch from (w.b - w.a)) / 60.0),
    coalesce(sum(s.mins), 0),
    coalesce(sum(s.parts), 0)::integer,
    coalesce(sum(s.mins), 0) * w.r,
    coalesce(sum(s.mins), 0) * w.o,
    coalesce(sum(s.mins * s.fee_rate), 0) * w.r,
    coalesce(sum(s.mins), 0) * (w.r - w.o) - coalesce(sum(s.mins * s.fee_rate), 0) * w.r,
    coalesce(sum(s.mins * (w.r - w.o) - s.mins * s.fee_rate * w.r) filter (where s.source = 'own'), 0),
    coalesce(sum(s.mins * (w.r - w.o) - s.mins * s.fee_rate * w.r) filter (where s.source = 'platform'), 0),
    case when w.b > w.a then coalesce(sum(s.mins), 0) / (extract(epoch from (w.b - w.a)) / 60.0) else 0 end
  from win w
  left join seg s on s.day = w.day and s.id = w.id
  group by w.day, w.id, w.a, w.b, w.r, w.o
  order by w.day, w.id
$$;

/* ---------- yönetim ---------- */

-- Demo portföyünü (INV-1000) bir giriş hesabına bağlar. Yalnızca SQL Editor'den (postgres rolüyle) çalıştırılır.
create or replace function public.link_demo_portfolio(p_email text, p_demo_code text default 'INV-1000')
returns text
language plpgsql security definer
set search_path = ''
as $$
declare v_uid uuid; v_demo uuid; v_own uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(p_email);
  if v_uid is null then raise exception 'Bu e-posta ile kayıtlı kullanıcı yok: %', p_email; end if;
  select id into v_demo from public.investors where code = p_demo_code;
  if v_demo is null then raise exception 'Demo yatırımcı bulunamadı: %', p_demo_code; end if;
  select id into v_own from public.investors where user_id = v_uid and id <> v_demo;
  if v_own is not null then
    update public.machines set investor_id = v_demo where investor_id = v_own;
    update public.purchase_orders set investor_id = v_demo where investor_id = v_own;
    delete from public.investors where id = v_own;
  end if;
  update public.investors set user_id = null where id = v_demo and user_id is distinct from v_uid;
  update public.investors set user_id = v_uid where id = v_demo;
  return p_demo_code || ' portföyü ' || p_email || ' hesabına bağlandı';
end $$;
