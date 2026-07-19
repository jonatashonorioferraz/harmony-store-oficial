const API = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SECRET = String(process.env.SUPABASE_SECRET_KEY || '');
if (!API || !SECRET.startsWith('sb_secret_')) {
  console.log(JSON.stringify({ recorded: false, reason: 'protected_configuration_unavailable' }));
  process.exit(0);
}
const response = await fetch(`${API}/rest/v1/rpc/service_record_backup_result`, {
  method: 'POST',
  headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_status: 'failed', p_error_code: 'github_backup_failed', p_stats: {} }),
});
if (!response.ok) throw new Error(`Falha ao registrar estado: HTTP ${response.status}`);
console.log(JSON.stringify({ recorded: true, status: 'failed' }));
