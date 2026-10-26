/* SanalFabrika · Supabase bağlantı katmanı
   SF_CONFIG doluysa veriyi veritabanından okur, giriş/kayıt ve satın almayı yönetir.
   Boşsa hiçbir şey yapmaz ve site demo modunda kalır. */
(function () {
  'use strict';
  const SF = window.SF;
  const cfg = window.SF_CONFIG || {};
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js';
  const DAY = 864e5;
  const PAGE = 1000;   // Supabase Data API'nin varsayılan satır sınırı
  const iso = t => new Date(t).toISOString();

  const B = {
    enabled: !!(cfg.supabaseUrl && cfg.supabaseKey),
    client: null,
    user: null,
    loadedAt: 0,
    onChange: null
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.supabase && window.supabase.createClient) return resolve();
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Supabase kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin.'));
      document.head.appendChild(s);
    });
  }

  // Hata mesajlarını kullanıcıya gösterilecek Türkçe metne çevirir
  function friendly(err) {
    const msg = (err && (err.message || err.error_description || err.msg)) || String(err);
    const map = [
      [/Invalid login credentials/i, 'E-posta veya şifre hatalı.'],
      [/Email not confirmed/i, 'E-posta adresinizi henüz onaylamadınız. Gelen kutunuzdaki bağlantıya tıklayın.'],
      [/User already registered/i, 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı deneyin.'],
      [/Password should be at least (\d+)/i, m => `Şifre en az ${m[1]} karakter olmalı.`],
      [/rate limit/i, 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.'],
      [/Failed to fetch|NetworkError|Load failed/i, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.'],
      [/permission denied/i, 'Bu işlem için yetkiniz yok.']
    ];
    for (const [re, out] of map) { const m = msg.match(re); if (m) return typeof out === 'function' ? out(m) : out; }
    return msg;
  }
  B.friendly = friendly;

  async function must(promise) {
    const { data, error } = await promise;
    if (error) throw new Error(friendly(error));
    return data;
  }
  async function fetchAll(build) {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const rows = await must(build().range(from, from + PAGE - 1));
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  }

  B.init = async function () {
    if (!B.enabled) return false;
    await loadScript(LIB);
    B.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const { data } = await B.client.auth.getSession();
    B.user = data.session ? data.session.user : null;
    B.client.auth.onAuthStateChange((event, session) => {
      const next = session ? session.user : null;
      const changed = (next && next.id) !== (B.user && B.user.id);
      B.user = next;
      if (changed && B.onChange) B.onChange(event);
    });
    await B.load();
    return true;
  };

  B.load = async function () {
    const c = B.client;
    const now = Date.now();
    const publicFrom = now - 35 * DAY, publicTo = now + 36 * DAY;
    const [types, fees, steps, factories, slots, machines, publicJobs] = await Promise.all([
      must(c.from('machine_types').select('*').order('axes')),
      must(c.from('fee_rates').select('*')),
      must(c.from('procurement_steps').select('*').order('sort')),
      must(c.from('factories').select('*').order('sort')),
      must(c.from('slots').select('*').order('code')),
      must(c.rpc('list_machines')),
      fetchAll(() => c.rpc('public_jobs', { p_from: iso(publicFrom), p_to: iso(publicTo) }))
    ]);
    let investor = null, ownJobs = [];
    if (B.user) {
      [investor, ownJobs] = await Promise.all([
        must(c.from('investors').select('*').eq('user_id', B.user.id).maybeSingle()),
        fetchAll(() => c.from('jobs').select('*').order('starts_at').order('id'))
      ]);
    }
    SF.hydrate({ types, fees, steps, factories, slots, machines, publicJobs, ownJobs, investor, publicFrom, publicTo });
    B.loadedAt = Date.now();
  };

  // Başka yatırımcının makinesinde yüklü aralığın dışına çıkılınca o haftayı getirir
  B.ensureRange = async function (machineId, from, to) {
    const m = SF.machine(machineId);
    if (!m || m.mine || (from >= m.jobsFrom && to <= m.jobsTo)) return false;
    const rows = await must(B.client.rpc('public_jobs', { p_from: iso(from), p_to: iso(to), p_machine: machineId }));
    SF.mergeJobs(machineId, rows, from, to);
    return true;
  };

  B.purchase = async function ({ factory, slot, axes, ownShare, util }) {
    const id = await must(B.client.rpc('purchase_machine', {
      p_factory: factory, p_slot: slot, p_axes: axes, p_own_share: ownShare, p_expected_util: util
    }));
    await B.load();
    return id;
  };

  B.signIn = async function (email, password) {
    await must(B.client.auth.signInWithPassword({ email, password }));
  };
  B.signUp = async function (email, password, fullName) {
    const data = await must(B.client.auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, emailRedirectTo: location.origin + location.pathname }
    }));
    return { needsConfirm: !data.session };
  };
  B.signOut = async function () {
    await B.client.auth.signOut();
  };

  window.Backend = B;
})();
