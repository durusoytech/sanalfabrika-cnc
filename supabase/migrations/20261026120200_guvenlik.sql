-- SanalFabrika · 3/4 · Güvenlik: satır bazlı erişim (RLS) ve açık yetkiler
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
