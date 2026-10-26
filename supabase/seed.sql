-- SanalFabrika · Başlangıç verisi (demo)
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
