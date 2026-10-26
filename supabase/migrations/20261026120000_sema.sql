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
