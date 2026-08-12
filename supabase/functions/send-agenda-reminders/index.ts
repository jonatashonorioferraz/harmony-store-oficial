import { createClient } from "npm:@supabase/supabase-js@2.110.7";
// @ts-expect-error CommonJS package supported by the Supabase Edge Runtime.
import webpush from "npm:web-push@3.6.7";

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const trustedSecretKeys = () => {
  const keys = new Set<string>();
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if (legacy) keys.add(legacy);
  try {
    const configured = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as Record<string, unknown>;
    for (const value of Object.values(configured)) {
      if (typeof value === "string") keys.add(value);
      else if (value && typeof value === "object") for (const nested of Object.values(value as Record<string, unknown>)) if (typeof nested === "string") keys.add(nested);
    }
  } catch { /* fallback legado */ }
  return keys;
};

Deno.serve(async request => {
  if (request.method !== "POST") return reply({ error: "Método não permitido." }, 405);
  const apiKey = request.headers.get("apikey") || "";
  if (!trustedSecretKeys().has(apiKey)) return reply({ error: "Acesso negado." }, 403);
  try {
    const url = Deno.env.get("SUPABASE_URL")!,serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")!,privateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const subject = Deno.env.get("VAPID_SUBJECT") || "https://harmonylembrancinhas.com.br";
    if (!publicKey || !privateKey) return reply({ error: "Notificações ainda não configuradas." }, 503);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const now = new Date().toISOString();
    const { data: tasks, error: taskError } = await admin.from("admin_agenda_tasks")
      .select("id,protocol,title,description,priority,reminder_at,due_at")
      .in("status", ["pending", "in_progress"]).not("reminder_at", "is", null).lte("reminder_at", now).limit(100);
    if (taskError) throw taskError;
    const { data: admins, error: adminError } = await admin.from("profiles").select("id").eq("role", "admin").eq("status", "active");
    if (adminError) throw adminError;
    if (!tasks?.length || !admins?.length) return reply({ sent: 0, tasks: tasks?.length || 0 });

    webpush.setVapidDetails(subject, publicKey, privateKey);
    let sent = 0, failed = 0;
    for (const task of tasks) for (const recipient of admins) {
      const { data: existing } = await admin.from("admin_agenda_reminder_deliveries").select("status,attempts")
        .eq("task_id", task.id).eq("recipient_id", recipient.id).eq("scheduled_for", task.reminder_at).maybeSingle();
      if (existing?.status === "sent" || Number(existing?.attempts || 0) >= 5) continue;
      const { data: subscriptions } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", recipient.id);
      let recipientSent = false, lastError = "Sem dispositivo com notificação ativa.";
      for (const subscription of subscriptions || []) try {
        const due = task.due_at ? ` Prazo: ${new Date(task.due_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.` : "";
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({
          title: `${task.priority === "urgent" ? "🚨" : "📅"} Agenda Harmony · #${String(task.protocol).padStart(4, "0")}`,
          body: `${task.title}.${due}`,
          tag: `agenda-task-${task.id}`,
          url: "./?view=agenda-harmony",
          icon: "./icon-192-v2.png", badge: "./notification-badge.svg", event: "agenda_reminder",
          priority: task.priority === "urgent" ? "urgent" : "important",
        }), { TTL: 86400, urgency: task.priority === "urgent" ? "high" : "normal" });
        recipientSent = true; sent++;
      } catch (error) {
        failed++;lastError = error instanceof Error ? error.message.slice(0, 160) : "Falha no serviço push.";
        const status = Number((error as { statusCode?: number }).statusCode || 0);
        if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", subscription.id);
      }
      await admin.from("admin_agenda_reminder_deliveries").upsert({
        task_id: task.id, recipient_id: recipient.id, scheduled_for: task.reminder_at,
        status: recipientSent ? "sent" : "failed",
        attempts: Number(existing?.attempts || 0) + 1, last_error: recipientSent ? null : lastError,
        sent_at: recipientSent ? new Date().toISOString() : null,
      }, { onConflict: "task_id,recipient_id,scheduled_for" });
    }
    await admin.from("system_events").insert({ source: "agenda", level: failed ? "warning" : "info", code: failed ? "agenda_reminder_partial" : "agenda_reminder_sent", details: { tasks: tasks.length, sent, failed } });
    return reply({ sent, failed, tasks: tasks.length });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(JSON.stringify({ event: "agenda_reminder_error", error_id: errorId, name: error instanceof Error ? error.message : "Unknown" }));
    return reply({ error: "Não foi possível processar os lembretes da Agenda.", error_id: errorId }, 500);
  }
});
