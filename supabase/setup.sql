-- Emek Sermaye · Supabase kurulum dosyası
-- Bu dosya scripts/build-setup-sql.mjs ile üretilir, doğrudan düzenlemeyin.
-- Kullanım: Supabase panelinde SQL Editor > New query > bu dosyanın tamamını yapıştırın > Run.
-- Boş bir projede yalnızca bir kez çalıştırın.

-- >>> 20261026120000_sema.sql
-- Emek Sermaye · 1/4 · Temel şema ve referans verileri
-- Supabase üzerinde çalışır; auth.users ve auth.uid() Supabase Auth'tan gelir.

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- Uygulama ayarları (anahtar/değer)
create table public.app_settings (
  key   text primary key,
  value jsonb not null
);
comment on table public.app_settings is 'Uygulama ayarları. simulate_jobs: yeni makineler için demo iş takvimi üretilsin mi. max_open_orders: bir yatırımcının aynı anda bekleyebileceği en fazla sipariş.';

-- Tesisler ve slotlar
create table public.factories (
  id                  text primary key check (id ~ '^[a-z0-9_-]{2,20}$'),
  code                text not null unique check (code ~ '^[A-Z]{2,5}$'),
  name                text not null,
  short_name          text not null,
  city                text not null,
  lead                text not null default '',
  area_m2             integer not null check (area_m2 > 0),
  power_kva           integer not null check (power_kva > 0),
  operators_per_shift integer not null default 0 check (operators_per_shift >= 0),
  status              text not null check (status in ('active', 'building')),
  open_at             timestamptz,
  since_label         text,
  sort                integer not null default 0
);

create table public.slots (
  factory_id text not null references public.factories(id) on delete cascade,
  code       text not null check (code ~ '^[A-Z][0-9]{2}$'),
  primary key (factory_id, code)
);

-- Makine tipleri ve dakika başı işletme ücreti kalemleri
create table public.machine_types (
  axes             smallint primary key check (axes in (3, 4, 5)),
  code             text not null,
  family           text not null,
  price            numeric(12,2) not null check (price > 0),
  install_fee      numeric(12,2) not null check (install_fee >= 0),
  rate_per_min     numeric(8,4) not null check (rate_per_min > 0),
  cost_operator    numeric(8,4) not null,
  cost_electricity numeric(8,4) not null,
  cost_maintenance numeric(8,4) not null,
  cost_tooling     numeric(8,4) not null,
  cost_facility    numeric(8,4) not null,
  cost_insurance   numeric(8,4) not null,
  op_rate          numeric(8,4) generated always as
                   (cost_operator + cost_electricity + cost_maintenance + cost_tooling + cost_facility + cost_insurance) stored,
  power_kw         numeric(6,2) not null,
  specs            jsonb not null default '[]'::jsonb,
  uses             text[] not null default '{}',
  blurb            text not null default ''
);

-- Platform payı: kendi bulduğu işte düşük, platformun bulduğu işte yüksek
create table public.fee_rates (
  source text primary key check (source in ('own', 'platform')),
  rate   numeric(5,4) not null check (rate >= 0 and rate < 1),
  label  text not null
);

-- Satın alma sonrası tedarik ve kurulum adımları
create table public.procurement_steps (
  key         text primary key,
  sort        smallint not null unique,
  label       text not null,
  days        integer not null check (days >= 0),
  description text not null
);

-- Yatırımcılar (bir giriş hesabına bağlı olabilir ya da olmayabilir)
create table public.investors (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid unique references auth.users(id) on delete set null,
  code         text not null unique check (code ~ '^INV-[0-9]{4}$'),
  display_name text not null,
  created_at   timestamptz not null default now()
);

-- Tesis personeli: iş girebilir, makineleri yönetebilir
create table public.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('operator', 'admin')),
  created_at timestamptz not null default now()
);

-- Makineler: her slotta en fazla bir makine
create table public.machines (
  id               text primary key,
  factory_id       text not null,
  slot_code        text not null,
  axes             smallint not null references public.machine_types(axes),
  investor_id      uuid not null references public.investors(id),
  status           text not null check (status in ('procurement', 'active')),
  ordered_at       timestamptz not null,
  commissioned_at  timestamptz,
  own_share_target numeric(4,3) not null default 0.5 check (own_share_target between 0 and 1),
  expected_util    numeric(4,3) check (expected_util between 0 and 1),
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  foreign key (factory_id, slot_code) references public.slots(factory_id, code),
  unique (factory_id, slot_code),
  check (status = 'procurement' or commissioned_at is not null)
);
create index machines_investor_idx on public.machines (investor_id);

-- İşler ve bakımlar: aynı makinede zaman çakışması veritabanı seviyesinde engellenir
create table public.jobs (
  id            bigint generated always as identity primary key,
  machine_id    text not null references public.machines(id) on delete cascade,
  kind          text not null check (kind in ('job', 'maint')),
  title         text not null,
  material      text,
  cycle_min     numeric(8,2),
  qty           integer,
  setup_min     integer,
  source        text references public.fee_rates(source),
  customer_name text,
  order_no      text,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  check (ends_at > starts_at),
  check (kind = 'maint' or (cycle_min > 0 and qty > 0 and setup_min >= 0 and source is not null)),
  constraint jobs_no_overlap exclude using gist (machine_id with =, tstzrange(starts_at, ends_at) with &&)
);
create index jobs_machine_time_idx on public.jobs (machine_id, starts_at);

-- Satın alma siparişleri
create table public.purchase_orders (
  id               bigint generated always as identity primary key,
  machine_id       text not null unique references public.machines(id) on delete cascade,
  investor_id      uuid not null references public.investors(id),
  axes             smallint not null,
  price            numeric(12,2) not null,
  install_fee      numeric(12,2) not null,
  deposit          numeric(12,2) not null,
  own_share_target numeric(4,3) not null,
  expected_util    numeric(4,3),
  created_at       timestamptz not null default now()
);

/* ---------- referans verileri ---------- */
insert into public.app_settings (key, value) values ('simulate_jobs', 'true'::jsonb), ('max_open_orders', '3'::jsonb);

insert into public.fee_rates (source, rate, label) values
  ('own', 0.05, 'Kendi işim'),
  ('platform', 0.20, 'Platform işi');

insert into public.procurement_steps (key, sort, label, days, description) values
  ('order',   1, 'Sipariş & ön ödeme', 2, 'Sözleşme imzalanır, %30 ön ödeme alınır ve slot sizin adınıza rezerve edilir.'),
  ('supply',  2, 'Üretim & tedarik', 90, 'Makine üreticide üretilir, fabrika kabul testi (FAT) yapılır. Ortalama 3 ay sürer.'),
  ('ship',    3, 'Sevkiyat & teslimat', 7, 'Nakliye, sigorta ve gümrük işlemleri tamamlanır, makine tesise indirilir.'),
  ('install', 4, 'Kurulum', 5, 'Temel, enerji ve basınçlı hava bağlantıları yapılır, makine terazilenir.'),
  ('calib',   5, 'Kalibrasyon & deneme üretimi', 3, 'Lazer ve ballbar ölçümü yapılır, ilk parça onayı alınır.'),
  ('live',    6, 'Üretime hazır', 0, 'Makine takvime açılır ve iş almaya başlar.');

insert into public.machine_types
  (axes, code, family, price, install_fee, rate_per_min, cost_operator, cost_electricity, cost_maintenance, cost_tooling, cost_facility, cost_insurance, power_kw, specs, uses, blurb)
values
  (3, 'VMC-850', 'Dikey işleme merkezi', 105000, 4500, 0.75, 0.14, 0.05, 0.04, 0.05, 0.03, 0.02, 9,
   '[["Eksen yolları X/Y/Z","850 × 510 × 560 mm"],["İş mili","12.000 dev/dk · BT40 · 18,5 kW"],["Tabla","1.000 × 500 mm · 600 kg"],["Takım magazini","24 takım"],["Hızlı hareket","36 m/dk"],["Konumlama hassasiyeti","±0,005 mm"]]',
   array['Kalıp ve plaka işleri', 'Flanş, kapak, braket', 'Fikstür ve aparatlar'],
   'Seri plaka ve prizmatik parçalar için ekonomik başlangıç.'),
  (4, 'HMC-500', 'Yatay işleme merkezi · B ekseni', 210000, 6500, 1.00, 0.17, 0.07, 0.05, 0.07, 0.04, 0.02, 14,
   '[["Eksen yolları X/Y/Z","730 × 730 × 800 mm"],["4. eksen","B döner tabla · 0,001° indeks"],["İş mili","15.000 dev/dk · BT40 · 22 kW"],["Palet","2 × 500 × 500 mm"],["Takım magazini","60 takım"],["Konumlama hassasiyeti","±0,004 mm"]]',
   array['Gövde ve blok parçalar', 'Valf blokları, pompa gövdeleri', 'Otomotiv seri üretim'],
   'Çift paletle duruşsuz seri üretim, tek bağlamada 4 yüzey.'),
  (5, 'UMC-650', '5 eksen simultane · Trunnion', 360000, 9500, 1.50, 0.22, 0.10, 0.08, 0.10, 0.05, 0.03, 18,
   '[["Eksen yolları X/Y/Z","650 × 520 × 475 mm"],["A / C eksenleri","−120°…+30° · 360° sürekli"],["İş mili","20.000 dev/dk · HSK-A63 · 25 kW"],["Tabla","Ø500 mm · 300 kg"],["Takım magazini","40 takım"],["Konumlama hassasiyeti","±0,003 mm"]]',
   array['Medikal implantlar', 'Havacılık ve türbin parçaları', 'Karmaşık serbest yüzeyler'],
   'Tek bağlamada karmaşık geometri, en yüksek dakika ücreti.');

-- >>> 20261026120100_is_kurallari.sql
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

-- >>> 20261026120200_guvenlik.sql
-- Emek Sermaye · 3/4 · Güvenlik: satır bazlı erişim (RLS) ve açık yetkiler
-- Supabase, 30 Mayıs 2026'dan sonra açılan projelerde (mevcut projelerde 30 Ekim 2026'dan itibaren)
-- tabloları Data API'ye otomatik açmıyor. Bu yüzden her yetki burada açıkça veriliyor.

alter table public.app_settings      enable row level security;
alter table public.factories         enable row level security;
alter table public.slots             enable row level security;
alter table public.machine_types     enable row level security;
alter table public.fee_rates         enable row level security;
alter table public.procurement_steps enable row level security;
alter table public.investors         enable row level security;
alter table public.staff             enable row level security;
alter table public.machines          enable row level security;
alter table public.jobs              enable row level security;
alter table public.purchase_orders   enable row level security;

/* ---------- katalog: herkes okur ---------- */
create policy "herkes okur" on public.app_settings      for select to anon, authenticated using (true);
create policy "herkes okur" on public.factories         for select to anon, authenticated using (true);
create policy "herkes okur" on public.slots             for select to anon, authenticated using (true);
create policy "herkes okur" on public.machine_types     for select to anon, authenticated using (true);
create policy "herkes okur" on public.fee_rates         for select to anon, authenticated using (true);
create policy "herkes okur" on public.procurement_steps for select to anon, authenticated using (true);

/* ---------- yatırımcılar ---------- */
create policy "kendi kaydını okur" on public.investors
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy "kendi adını günceller" on public.investors
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

/* ---------- personel ---------- */
create policy "kendi personel kaydını okur" on public.staff
  for select to authenticated using (user_id = (select auth.uid()));

/* ---------- makineler: sahibi ve personel okur, personel yönetir ----------
   Zemin planı herkese public.list_machines() ile açılır; o fonksiyon sahibin yalnızca kodunu verir. */
create policy "sahibi veya personel okur" on public.machines
  for select to authenticated using (investor_id = (select public.current_investor_id()) or (select public.is_staff()));
create policy "personel ekler" on public.machines
  for insert to authenticated with check ((select public.is_staff()));
create policy "personel günceller" on public.machines
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "personel siler" on public.machines
  for delete to authenticated using ((select public.is_staff()));

/* ---------- işler: sahibi tüm ayrıntıyı okur, personel yazar ----------
   Diğer makinelerin takvimi public.public_jobs() ile müşteri bilgisi gizlenerek açılır. */
create policy "sahibi veya personel okur" on public.jobs
  for select to authenticated using ((select public.is_staff()) or public.owns_machine(machine_id));
create policy "personel ekler" on public.jobs
  for insert to authenticated with check ((select public.is_staff()));
create policy "personel günceller" on public.jobs
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "personel siler" on public.jobs
  for delete to authenticated using ((select public.is_staff()));

/* ---------- siparişler ---------- */
create policy "kendi siparişini okur" on public.purchase_orders
  for select to authenticated using (investor_id = (select public.current_investor_id()) or (select public.is_staff()));

/* ---------- tablo yetkileri ----------
   Eski projelerde varsayılan yetkiler anon/authenticated rollerine her şeyi açabiliyor.
   Önce hepsini kaldırıp yalnızca gerekenleri veriyoruz. */
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

grant select on public.app_settings, public.factories, public.slots, public.machine_types,
                public.fee_rates, public.procurement_steps
  to anon, authenticated;
grant select on public.investors, public.staff, public.machines, public.jobs, public.purchase_orders to authenticated;
grant update (display_name) on public.investors to authenticated;
grant insert, update, delete on public.machines, public.jobs to authenticated;   -- RLS yalnızca personele izin verir
grant usage on all sequences in schema public to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

/* ---------- fonksiyon yetkileri ---------- */
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.parts_done(timestamptz, integer, numeric, integer, timestamptz),
  public.procurement_total_days(),
  public.machine_status(text, timestamptz),
  public.list_machines(),
  public.public_jobs(timestamptz, timestamptz, text),
  public.is_staff(),
  public.current_investor_id()
  to anon, authenticated;

grant execute on function
  public.owns_machine(text),
  public.ensure_investor(),
  public.purchase_machine(text, text, smallint, numeric, numeric),
  public.investor_stats(timestamptz, timestamptz, timestamptz),
  public.investor_daily_stats(date, date, text, timestamptz, text)
  to authenticated;

grant execute on all functions in schema public to service_role;
-- public.link_demo_portfolio ve public.handle_new_user bilerek anon ve authenticated rollerine açılmadı.

-- >>> 20261026120300_demo_motoru.sql
-- Emek Sermaye · 4/4 · Demo veri motoru
-- Gerçek makine bağlantısı gelene kadar iş takvimini simüle eder.
-- "demo" şeması Data API'ye açık değildir; yalnızca veritabanı içinden çalışır.

create schema if not exists demo;
revoke all on schema demo from public;

create table demo.part_catalog (
  axes     smallint not null,
  name     text not null,
  material text not null,
  cyc_min  integer not null,
  cyc_max  integer not null,
  qty_min  integer not null,
  qty_max  integer not null,
  primary key (axes, name)
);

create table demo.customers (
  source text not null check (source in ('own', 'platform')),
  name   text not null,
  primary key (source, name)
);

create table demo.maint_titles (title text primary key);

-- Makine başına yoğunluk: kısa ara verme olasılığı (yüksek = daha dolu takvim)
create table demo.machine_profile (
  machine_id text primary key references public.machines(id) on delete cascade,
  busy       numeric(4,3) not null default 0.5 check (busy between 0 and 1)
);

insert into demo.part_catalog values
  (3, 'Montaj Braketi', 'Al 6082', 4, 8, 120, 300),
  (3, 'Bağlantı Flanşı DN80', 'S355 çelik', 7, 12, 60, 160),
  (3, 'Elektronik Kutu Kapağı', 'Al 5083', 5, 9, 90, 220),
  (3, 'Kalıp Göbeği', '1.2738 takım çeliği', 22, 38, 10, 36),
  (3, 'Fikstür Plakası', 'Al 6061', 26, 44, 8, 24),
  (4, 'Hidrolik Valf Bloğu', 'Al 7075', 14, 26, 30, 100),
  (4, 'Şanzıman Kapağı', 'AlSi9Cu3 döküm', 9, 16, 60, 180),
  (4, 'Pompa Gövdesi', 'GGG40 döküm', 18, 32, 24, 80),
  (4, 'Motor Bağlantı Braketi', 'Al 6082', 7, 12, 90, 220),
  (4, 'Eksantrik Mil Yatağı', 'C45 çelik', 11, 20, 40, 130),
  (5, 'Spinal Füzyon Kafesi', 'Ti6Al4V', 16, 26, 30, 90),
  (5, 'Kalça Protezi Femoral Stem', 'Ti6Al4V', 28, 45, 16, 50),
  (5, 'Diz İmplantı Tibial Plato', 'CoCrMo', 30, 50, 12, 40),
  (5, 'Türbin Kanadı', 'Inconel 718', 45, 80, 8, 22),
  (5, 'Pervane Göbeği', 'Al 7075-T6', 35, 60, 10, 28),
  (5, 'Havacılık Montaj Braketi', 'Al 7075-T6', 18, 30, 24, 70);

insert into demo.customers values
  ('own', 'Kartal Hidrolik'), ('own', 'Arda Medikal'), ('own', 'Nova Havacılık'), ('own', 'Selin Kalıp'),
  ('own', 'Pusula Otomotiv'), ('own', 'Mavi Enerji Sistemleri'), ('own', 'Ufuk Makina'),
  ('platform', 'Atlas Otomotiv'), ('platform', 'Doruk Medikal'), ('platform', 'Kule Makina'), ('platform', 'Sarp Havacılık'),
  ('platform', 'Ege Pompa'), ('platform', 'Lider Hidrolik'), ('platform', 'Orion Savunma');

insert into demo.maint_titles values
  ('Periyodik bakım'), ('İş mili titreşim kontrolü'), ('Lazer kalibrasyonu'), ('Soğutma sıvısı değişimi'), ('Eksen yağlama ve kontrol');

-- Bir makinenin takvimini, son işin bittiği yerden p_until'e kadar doldurur.
-- Takvim boşsa p_history_from ile devreye alma tarihinden hangisi geç ise oradan başlar.
create or replace function demo.fill_schedule(p_machine text, p_until timestamptz, p_history_from timestamptz default '-infinity')
returns integer
language plpgsql
set search_path = ''
as $$
declare
  m            record;
  p            record;
  t            timestamptz;
  v_last_maint timestamptz;
  v_every      interval;
  v_gap        double precision;
  v_cycle      integer;
  v_qty        integer;
  v_setup      integer;
  v_dur        integer;
  v_src        text;
  v_cust       text;
  n            integer := 0;
begin
  select mc.id, mc.axes, mc.status, mc.commissioned_at, mc.own_share_target, coalesce(dp.busy, 0.5) as busy
    into m
  from public.machines mc
  left join demo.machine_profile dp on dp.machine_id = mc.id
  where mc.id = p_machine;
  if not found or m.status <> 'active' or m.commissioned_at is null then
    return 0;
  end if;

  select max(ends_at) into t from public.jobs where machine_id = p_machine;
  t := coalesce(t, greatest(m.commissioned_at, p_history_from));
  select max(ends_at) into v_last_maint from public.jobs where machine_id = p_machine and kind = 'maint';
  v_last_maint := coalesce(v_last_maint, t);
  v_every := make_interval(days => 12 + floor(random() * 6)::integer);

  while t < p_until loop
    v_gap := case when random() < m.busy then 15 + random() * 75 else 300 + random() * 900 end;
    if t - m.commissioned_at < interval '50 days' then
      v_gap := v_gap * 2.4;   -- devreye alma döneminde iş daha seyrek
    end if;
    t := date_trunc('minute', t + make_interval(mins => v_gap::integer));

    if t - v_last_maint > v_every then
      v_dur := (180 + floor(random() * 120))::integer;
      insert into public.jobs (machine_id, kind, title, starts_at, ends_at)
      values (p_machine, 'maint', (select title from demo.maint_titles order by random() limit 1),
              t, t + make_interval(mins => v_dur));
      t := t + make_interval(mins => v_dur);
      v_last_maint := t;
      v_every := make_interval(days => 12 + floor(random() * 6)::integer);
      n := n + 1;
      continue;
    end if;

    select * into p from demo.part_catalog where axes = m.axes order by random() limit 1;
    v_cycle := greatest(3, round(p.cyc_min + random() * (p.cyc_max - p.cyc_min)))::integer;
    v_qty   := (p.qty_min + floor(random() * (p.qty_max - p.qty_min + 1)))::integer;
    v_setup := (5 * (6 + floor(random() * 13)))::integer;
    if v_setup + v_qty * v_cycle > 1920 then
      v_qty := greatest(4, floor((1920 - v_setup) / v_cycle::numeric))::integer;
    end if;
    if v_qty > 30 then v_qty := (floor(v_qty / 5.0) * 5)::integer; end if;
    v_dur  := v_setup + v_qty * v_cycle;
    v_src  := case when random() < m.own_share_target then 'own' else 'platform' end;
    v_cust := (select c.name from demo.customers c where c.source = v_src order by random() limit 1);

    insert into public.jobs (machine_id, kind, title, material, cycle_min, qty, setup_min, source, customer_name, order_no, starts_at, ends_at)
    values (p_machine, 'job', p.name, p.material, v_cycle, v_qty, v_setup, v_src, v_cust,
            (case when v_src = 'own' then 'SİP-' else 'PLT-' end) || (24000 + floor(random() * 9000))::integer,
            t, t + make_interval(mins => v_dur));
    t := t + make_interval(mins => v_dur);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Tedarik süresi dolan makineleri üretime alır
create or replace function demo.advance_procurement()
returns integer
language plpgsql
set search_path = ''
as $$
declare v_days integer := public.procurement_total_days(); n integer;
begin
  update public.machines
     set status = 'active', commissioned_at = ordered_at + make_interval(days => v_days)
   where status = 'procurement' and ordered_at + make_interval(days => v_days) <= now();
  get diagnostics n = row_count;
  insert into demo.machine_profile (machine_id, busy)
    select id, 0.5 from public.machines where status = 'active'
    on conflict (machine_id) do nothing;
  return n;
end $$;

-- Saatlik görev: tedariki tamamla, demo makinelerin takvimini 21 gün ileriye kadar doldur
create or replace function demo.fill_all(p_horizon interval default '21 days')
returns integer
language plpgsql
set search_path = ''
as $$
declare r record; n integer := 0;
begin
  perform demo.advance_procurement();
  for r in select id from public.machines where status = 'active' and is_demo order by id loop
    n := n + demo.fill_schedule(r.id, now() + p_horizon, now() - interval '90 days');
  end loop;
  return n;
end $$;

-- Supabase'de pg_cron varsa saatlik görevi kurar (yerel testlerde atlanır)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.unschedule(jobid) from cron.job where jobname = 'emeksermaye-demo';
    perform cron.schedule('emeksermaye-demo', '7 * * * *', 'select demo.fill_all()');
  end if;
end $$;

-- >>> seed.sql
-- Emek Sermaye · Başlangıç verisi (demo)
-- Migration'lardan sonra bir kez çalıştırılır. Tüm tarihler çalıştırıldığı ana göre hesaplanır.

insert into public.factories (id, code, name, short_name, city, lead, area_m2, power_kva, operators_per_shift, status, open_at, since_label, sort) values
  ('gbz', 'GBZ', 'Gebze OSB Tesisi', 'Gebze', 'Gebze, Kocaeli', 'Havacılık ve medikal ağırlıklı 4 ve 5 eksen tesis', 2400, 630, 4, 'active', null, 'Mart 2024', 1),
  ('brs', 'BRS', 'Bursa NOSAB Tesisi', 'Bursa', 'Nilüfer, Bursa', 'Otomotiv yan sanayi odaklı karma tesis', 1800, 500, 3, 'active', null, 'Ocak 2025', 2),
  ('izm', 'IZM', 'İzmir Kemalpaşa Tesisi', 'İzmir', 'Kemalpaşa, İzmir', 'Kurulum aşamasında, ön sipariş açık', 2600, 800, 0, 'building', now() + interval '38 days', null, 3);

insert into public.slots (factory_id, code)
select f.id, s.code
from public.factories f
cross join (values ('A01'), ('A02'), ('A03'), ('A04'), ('A05'), ('B01'), ('B02'), ('B03'), ('B04'), ('B05')) s(code);

-- Demo yatırımcılar. INV-1000, link_demo_portfolio() ile bir giriş hesabına bağlanacak portföydür.
insert into public.investors (code, display_name) values
  ('INV-1000', 'Deniz Aksoy'),
  ('INV-2041', 'Yatırımcı 2041'), ('INV-1187', 'Yatırımcı 1187'), ('INV-3310', 'Yatırımcı 3310'),
  ('INV-0954', 'Yatırımcı 0954'), ('INV-4402', 'Yatırımcı 4402'), ('INV-5120', 'Yatırımcı 5120'),
  ('INV-2214', 'Yatırımcı 2214'), ('INV-6630', 'Yatırımcı 6630'), ('INV-7781', 'Yatırımcı 7781');

-- Makineler: (tesis, slot, eksen, yatırımcı, durum, kaç gün önce, kendi iş payı, yoğunluk)
-- Üretimdekiler için "gün" devreye alma; tedariktekiler için sipariş tarihidir.
with defs (f, slot, axes, inv, st, days_ago, own_share, busy) as (values
  ('gbz','A01',5,'INV-2041','active',540,0.45,0.55), ('gbz','A02',4,'INV-1187','active',610,0.40,0.52),
  ('gbz','A03',5,'INV-1000','active',428,0.62,0.56), ('gbz','A04',4,'INV-3310','active',480,0.50,0.58),
  ('gbz','A05',4,'INV-2041','active',520,0.35,0.60), ('gbz','B01',5,'INV-0954','active',395,0.55,0.48),
  ('gbz','B02',4,'INV-1187','active',600,0.30,0.57), ('gbz','B03',4,'INV-1000','active',342,0.34,0.50),
  ('gbz','B04',5,'INV-4402','active',450,0.60,0.53), ('gbz','B05',4,'INV-3310','active',470,0.45,0.55),
  ('brs','A01',3,'INV-5120','active',300,0.50,0.47), ('brs','A02',4,'INV-1000','active',256,0.50,0.46),
  ('brs','A03',3,'INV-5120','active',290,0.40,0.50), ('brs','A04',5,'INV-2214','active',270,0.55,0.52),
  ('brs','B01',4,'INV-0954','active',280,0.45,0.54), ('brs','B02',3,'INV-1000','active',158,0.24,0.42),
  ('brs','B04',5,'INV-6630','active',240,0.50,0.60),
  ('izm','A01',5,'INV-2041','procurement',41,0.50,0.50), ('izm','A02',5,'INV-1000','procurement',70,0.50,0.50),
  ('izm','B01',4,'INV-7781','procurement',24,0.50,0.50), ('izm','B02',3,'INV-5120','procurement',12,0.50,0.50)
)
insert into public.machines (id, factory_id, slot_code, axes, investor_id, status, ordered_at, commissioned_at, own_share_target, is_demo)
select f.code || '-' || d.slot, d.f, d.slot, d.axes, i.id, d.st,
       case when d.st = 'active'
            then date_trunc('day', now()) - make_interval(days => d.days_ago + public.procurement_total_days())
            else date_trunc('minute', now()) - make_interval(days => d.days_ago) end,
       case when d.st = 'active' then date_trunc('day', now()) - make_interval(days => d.days_ago) end,
       d.own_share, true
from defs d
join public.factories f on f.id = d.f
join public.investors i on i.code = d.inv;

with defs (id, busy) as (values
  ('GBZ-A01',0.55),('GBZ-A02',0.52),('GBZ-A03',0.56),('GBZ-A04',0.58),('GBZ-A05',0.60),('GBZ-B01',0.48),('GBZ-B02',0.57),
  ('GBZ-B03',0.50),('GBZ-B04',0.53),('GBZ-B05',0.55),('BRS-A01',0.47),('BRS-A02',0.46),('BRS-A03',0.50),('BRS-A04',0.52),
  ('BRS-B01',0.54),('BRS-B02',0.42),('BRS-B04',0.60))
insert into demo.machine_profile (machine_id, busy) select id, busy from defs;

-- Demo portföyünün tam geçmişi (analiz ekranı için), diğer makinelerin son 90 günü
select demo.fill_schedule(m.id, now() + interval '21 days')
from public.machines m join public.investors i on i.id = m.investor_id
where i.code = 'INV-1000' and m.status = 'active';

select demo.fill_all();
