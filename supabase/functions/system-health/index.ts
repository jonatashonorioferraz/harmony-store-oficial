import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
const ageHours = (value?: string | null) => value ? (Date.now() - new Date(value).getTime()) / 3600000 : Infinity;
const worst = (items: Array<{ status: string }>) => items.some(item => item.status === "red") ? "red" : items.some(item => item.status === "yellow") ? "yellow" : "green";
const quantityLabel = (quantity: number, singular: string, plural: string) => quantity === 1 ? `1 ${singular}` : `${quantity} ${plural}`;
const elapsedLabel = (hours: number) => hours < 1 ? "há menos de 1 hora" : `há ${Math.floor(hours)} ${Math.floor(hours) === 1 ? "hora" : "horas"}`;
const OFFICIAL_APP_URL = "https://app.harmonylembrancinhas.com.br";
const fetchWithTimeout = async (input: string, init: RequestInit = {}, timeoutMs = 5000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};
const publishedVersionLabel = (value: unknown) => {
  const match = String(value || "").trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  return `v${match[1]}.${match[2]}${match[3] && match[3] !== "0" ? `.${match[3]}` : ""}`;
};
const notificationCodeLabel = (code?: string | null) => ({
  push_sent: "envio concluído",
  push_partial: "envio parcialmente concluído",
  push_failed: "falha no envio",
}[String(code || "")] || "atividade registrada");

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply({ error: "Método não permitido." }, 405);
  const checkedAt = new Date().toISOString();
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "Sessão ausente." }, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return reply({ error: "Sessão inválida." }, 401);
    const { data: caller } = await admin.from("profiles").select("role,status,is_ecommerce_manager").eq("id", authData.user.id).single();
    if (!caller || caller.status !== "active" || (caller.role !== "admin" && caller.is_ecommerce_manager !== true)) return reply({ error: "Acesso negado." }, 403);

    const items: Array<Record<string, unknown> & { status: string }> = [];
    const dbStart = performance.now();
    const { count: profileCount, error: dbError } = await admin.from("profiles").select("id", { count: "exact", head: true });
    const dbLatency = Math.round(performance.now() - dbStart);
    items.push({ key: "database", label: "Supabase e banco", status: dbError ? "red" : dbLatency > 1500 ? "yellow" : "green", value: dbError ? "Sem resposta" : `${dbLatency} ms`, detail: dbError ? "A leitura segura não respondeu." : `${profileCount || 0} perfis verificados; API e banco responderam.`, checked_at: checkedAt });

    let appStatus = "red", appValue = "Sem resposta", appDetail = "O domínio oficial não respondeu.";
    try {
      const start = performance.now();
      const response = await fetchWithTimeout(`${OFFICIAL_APP_URL}/?health=${Date.now()}`, { method: "HEAD" });
      const latency = Math.round(performance.now() - start);
      appStatus = response.ok ? latency > 2500 ? "yellow" : "green" : "red";
      appValue = response.ok ? `${latency} ms` : `HTTP ${response.status}`;
      appDetail = response.ok ? "O aplicativo oficial está acessível." : "O domínio respondeu com erro.";
    } catch { /* resposta saneada abaixo */ }
    items.push({ key: "application", label: "Aplicativo oficial", status: appStatus, value: appValue, detail: appDetail, checked_at: checkedAt });

    items.push({ key: "edge", label: "Diagnóstico do servidor", status: "green", value: "Operacional", detail: "A função segura respondeu e validou o perfil autorizado.", checked_at: checkedAt });
    const { data: buckets, error: storageError } = await admin.storage.listBuckets();
    const bucketCount = buckets?.length || 0;
    items.push({ key: "storage", label: "Arquivos e fotos", status: storageError ? "red" : "green", value: storageError ? "Sem resposta" : quantityLabel(bucketCount, "área de arquivos", "áreas de arquivos"), detail: storageError ? "O serviço de arquivos não respondeu ao diagnóstico." : "Fotos e documentos estão acessíveis.", checked_at: checkedAt });

    const [backupResult, backupAttemptResult] = await Promise.all([
      admin.from("system_backup_runs").select("status,completed_at,byte_size,stats").eq("status", "success").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("system_backup_runs").select("status,completed_at,error_code").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const backup = backupResult.data;
    const backupAttempt = backupAttemptResult.data;
    const backupQueryError = backupResult.error || backupAttemptResult.error;
    const backupAge = ageHours(backup?.completed_at);
    const latestBackupFailed = backupAttempt?.status === "failed";
    const backupStatus = backupQueryError ? "red" : !backup ? "red" : latestBackupFailed ? "yellow" : backupAge > 48 ? "red" : backupAge > 30 ? "yellow" : "green";
    const backupValue = backupQueryError ? "Sem resposta" : !backup ? "Aguardando primeiro backup" : latestBackupFailed ? "Falha na última tentativa" : `Concluído ${elapsedLabel(backupAge)}`;
    const backupDetail = backupQueryError ? "O histórico de backups não respondeu ao diagnóstico." : !backup ? "A rotina de backup ainda não produziu uma cópia válida." : latestBackupFailed ? `O último backup válido foi concluído ${elapsedLabel(backupAge)}. A rotina automática precisa ser executada novamente.` : "Cópia criptografada, verificada por hash e pronta para recuperação.";
    items.push({ key: "backup", label: "Backup externo", status: backupStatus, value: backupValue, detail: backupDetail, checked_at: backupAttempt?.completed_at || backup?.completed_at || null });

    const since = new Date(Date.now() - 86400000).toISOString();
    const { count: errorCount, error: errorCountError } = await admin.from("system_events").select("id", { count: "exact", head: true }).eq("level", "error").neq("source", "backup").gte("created_at", since);
    const operationalErrors = errorCount || 0;
    items.push({ key: "errors", label: "Erros registrados nas últimas 24 horas", status: errorCountError ? "red" : operationalErrors > 10 ? "red" : operationalErrors > 0 ? "yellow" : "green", value: errorCountError ? "Sem resposta" : operationalErrors === 0 ? "Nenhum erro registrado" : quantityLabel(operationalErrors, "erro", "erros"), detail: errorCountError ? "O histórico de erros não respondeu ao diagnóstico." : "Inclui falhas registradas pelo aplicativo e pelas automações monitoradas. Falhas de backup aparecem separadamente.", checked_at: checkedAt });

    const { data: agendaAutomation, error: agendaAutomationError } = await admin.from("system_events")
      .select("level,code,created_at,details")
      .eq("source", "edge")
      .like("code", "agenda_reminder_%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const agendaAge = ageHours(agendaAutomation?.created_at);
    const agendaStatus = agendaAutomationError ? "red" : !agendaAutomation ? "yellow" : agendaAutomation.level === "error" || agendaAge > 1 ? "red" : agendaAutomation.level === "warning" || agendaAge > 0.5 ? "yellow" : "green";
    const agendaValue = agendaAutomationError ? "Sem resposta" : !agendaAutomation ? "Aguardando verificação" : agendaAutomation.level === "error" ? "Falha detectada" : agendaAutomation.level === "warning" ? "Envio parcial" : "Operacional";
    const agendaDetail = agendaAutomationError ? "O histórico da automação não respondeu ao diagnóstico." : !agendaAutomation ? "A rotina ainda não registrou sua primeira execução monitorada." : agendaAutomation.code === "agenda_reminder_idle" ? "A rotina está em dia; não havia lembretes pendentes na última verificação." : agendaAutomation.level === "error" ? "A rotina encontrou uma falha e exige verificação administrativa." : agendaAutomation.level === "warning" ? "Parte dos lembretes foi processada; há aparelhos ou entregas que precisam de acompanhamento." : "Os lembretes administrativos foram processados na última execução.";
    items.push({ key: "agenda_automation", label: "Automação da Agenda", status: agendaStatus, value: agendaValue, detail: agendaDetail, checked_at: agendaAutomation?.created_at || null });

    const [pushResult, subscriptionResult] = await Promise.all([
      admin.from("system_events").select("level,code,created_at,details").eq("source", "notification").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("push_subscriptions").select("id", { count: "exact", head: true }),
    ]);
    const push = pushResult.data;
    const registeredSubscriptions = subscriptionResult.count || 0;
    const notificationQueryError = pushResult.error || subscriptionResult.error;
    const notificationStatus = notificationQueryError ? "red" : push?.level === "error" || push?.level === "warning" || registeredSubscriptions === 0 ? "yellow" : "green";
    const notificationValue = notificationQueryError ? "Sem resposta" : registeredSubscriptions === 0 ? "Nenhum aparelho cadastrado" : quantityLabel(registeredSubscriptions, "aparelho cadastrado", "aparelhos cadastrados");
    const notificationDetail = notificationQueryError ? "O cadastro de notificações não respondeu ao diagnóstico." : registeredSubscriptions === 0 ? "Nenhum aparelho está inscrito para receber avisos push. As mensagens internas continuam funcionando." : `Última atividade: ${notificationCodeLabel(push?.code)}.`;
    items.push({ key: "notifications", label: "Notificações", status: notificationStatus, value: notificationValue, detail: notificationDetail, checked_at: push?.created_at || null });

    const { data: monitor, error: monitorQueryError } = await admin.from("system_events").select("level,code,created_at,details").eq("source", "system").in("code", ["availability_ok", "availability_failed"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const monitorAge = ageHours(monitor?.created_at);
    const monitorStatus = monitorQueryError || !monitor || monitorAge > 12 || monitor.level === "error" ? "red" : monitorAge > 8 ? "yellow" : "green";
    items.push({ key: "external_monitor", label: "Monitor externo", status: monitorStatus, value: monitorQueryError ? "Sem resposta" : !monitor ? "Aguardando primeira verificação" : monitor.level === "error" ? "Falha detectada" : "Disponível", detail: monitorQueryError ? "O histórico do monitor externo não respondeu ao diagnóstico." : "Verifica automaticamente aplicativo, banco, autenticação e arquivos a cada 6 horas.", checked_at: monitor?.created_at || null });

    let versionStatus = "yellow", versionValue = "Não identificada", versionDetail = "Não foi possível confirmar automaticamente a versão publicada.";
    try {
      const versionResponse = await fetchWithTimeout(`${OFFICIAL_APP_URL}/package.json?health_version=${Date.now()}`, { headers: { Accept: "application/json" } });
      if (versionResponse.ok) {
        const packageData = await versionResponse.json();
        const detectedVersion = publishedVersionLabel(packageData?.version);
        if (detectedVersion) {
          versionStatus = "green";
          versionValue = detectedVersion;
          versionDetail = "Versão lida automaticamente dos metadados do aplicativo publicado.";
        }
      }
    } catch { /* indicador amarelo e resposta saneada acima */ }
    items.push({ key: "version", label: "Versão publicada", status: versionStatus, value: versionValue, detail: versionDetail, checked_at: checkedAt });
    const overall = worst(items);
    return reply({ checked_at: checkedAt, mode: "live", overall, message: overall === "green" ? "Todos os componentes monitorados estão normais." : overall === "yellow" ? "Há itens que precisam de acompanhamento." : "Existe pelo menos um item que exige ação administrativa.", items });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(JSON.stringify({ event: "system_health_error", error_id: errorId, name: error instanceof Error ? error.name : "Unknown" }));
    return reply({ error: "Não foi possível concluir o diagnóstico.", error_id: errorId }, 500);
  }
});

