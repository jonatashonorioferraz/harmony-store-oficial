const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const appUrl = process.env.APP_URL || 'https://app.harmonylembrancinhas.com.br/';
if (!supabaseUrl || !secretKey) throw new Error('Configuração protegida do monitor ausente.');

const startedAt = Date.now();
const safeFetch = async (name, url, options = {}, validate = response => response.ok) => {
  let lastError = 'unavailable';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const began = Date.now();
    try {
      const response = await fetch(url, { ...options, cache: 'no-store', signal: controller.signal });
      const latency_ms = Date.now() - began;
      if (await validate(response)) return { name, ok: true, status: response.status, latency_ms };
      lastError = `http_${response.status}`;
    } catch (error) {
      lastError = error?.name === 'AbortError' ? 'timeout' : 'network_error';
    } finally {
      clearTimeout(timeout);
    }
  }
  return { name, ok: false, error_code: lastError };
};

const authHeaders = { apikey: secretKey, Authorization: `Bearer ${secretKey}` };
const checks = await Promise.all([
  safeFetch('application', `${appUrl}?external-health=${Date.now()}`, { method: 'HEAD' }),
  safeFetch('manifest', new URL('manifest.webmanifest', appUrl), {}, async response => {
    if (!response.ok) return false;
    const manifest = await response.clone().json();
    return manifest.name === 'Harmony Store Oficial' && manifest.display === 'standalone';
  }),
  safeFetch('database', `${supabaseUrl}/rest/v1/profiles?select=id&limit=1`, { headers: authHeaders }),
  safeFetch('auth', `${supabaseUrl}/auth/v1/health`, { headers: { apikey: secretKey } }),
  safeFetch('storage', `${supabaseUrl}/storage/v1/bucket`, { headers: authHeaders }),
]);

const ok = checks.every(check => check.ok);
const details = {
  duration_ms: Date.now() - startedAt,
  checks: Object.fromEntries(checks.map(check => [check.name, {
    ok: check.ok,
    status: check.status || null,
    latency_ms: check.latency_ms || null,
    error_code: check.error_code || null,
  }])),
};

const recorded = await fetch(`${supabaseUrl}/rest/v1/system_events`, {
  method: 'POST',
  headers: { ...authHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({ source: 'system', level: ok ? 'info' : 'error', code: ok ? 'availability_ok' : 'availability_failed', details }),
});
if (!recorded.ok) throw new Error(`Falha ao registrar monitor: HTTP ${recorded.status}`);
console.log(JSON.stringify({ ok, duration_ms: details.duration_ms, checks: details.checks }));
if (!ok) process.exitCode = 1;
