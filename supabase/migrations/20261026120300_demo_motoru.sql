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
