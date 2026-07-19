import { createClient } from "npm:@supabase/supabase-js@2.110.7";
// @ts-ignore CommonJS package supported by the Supabase Edge Runtime.
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const subject = Deno.env.get("VAPID_SUBJECT") || "https://harmonylembrancinhas.com.br";
    if (!publicKey || !privateKey) return reply({ error: "Notificações ainda não configuradas." }, 503);

    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "Sessão ausente." }, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return reply({ error: "Sessão inválida." }, 401);

    const { data: caller } = await admin.from("profiles").select("id,role,status,full_name,is_primary_admin").eq("id", authData.user.id).single();
    if (!caller || caller.status !== "active") return reply({ error: "Acesso negado." }, 403);

    const body = await request.json();
    const event = String(body.event || "");
    if (event === "admin_message") {
      if (caller.role !== "admin" || !caller.is_primary_admin) return reply({ error: "Somente o ADM principal pode enviar notificações." }, 403);
      const notificationId = String(body.notification_id || "");
      const { data: notification } = await admin.from("app_notifications")
        .select("id,title,body,priority,due_at")
        .eq("id", notificationId).single();
      if (!notification) return reply({ error: "Notificação não localizada." }, 404);
      const { data: recipientRows } = await admin.from("app_notification_recipients")
        .select("recipient_id").eq("notification_id", notificationId);
      const recipients = (recipientRows || []).map(row => row.recipient_id);
      if (!recipients.length) return reply({ sent: 0, recipients: 0 });
      const { data: subscriptions } = await admin.from("push_subscriptions")
        .select("id,endpoint,p256dh,auth").in("user_id", recipients);
      webpush.setVapidDetails(subject, publicKey, privateKey);
      const due = notification.due_at
        ? ` Prazo: ${new Date(notification.due_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`
        : "";
      const payload = JSON.stringify({
        title: `${notification.priority === "urgent" ? "🚨 " : "🔔 "}${notification.title}`,
        body: `${notification.body}${due}`,
        tag: `admin-message-${notification.id}`,
        url: "./?view=notifications",
        icon: "./icon-192-v2.png",
        badge: "./notification-badge.svg",
        event,
        priority: notification.priority,
      });
      let sent = 0, failed = 0;
      await Promise.all((subscriptions || []).map(async subscription => {
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          }, payload, { TTL: notification.priority === "urgent" ? 172800 : 86400, urgency: notification.priority === "urgent" ? "high" : "normal" });
          sent++;
        } catch (error) {
          failed++;
          const status = Number((error as { statusCode?: number }).statusCode || 0);
          if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", subscription.id);
        }
      }));
      await admin.from("system_events").insert({
        source: "notification", level: failed ? "warning" : "info",
        code: failed ? "admin_push_partial" : "admin_push_sent", actor_id: caller.id,
        details: { event, notification_id: notification.id, sent, failed, recipients: recipients.length },
      });
      return reply({ sent, failed, recipients: recipients.length });
    }

    const requestId = String(body.request_id || "");
    const { data: materialRequest } = await admin.from("requests")
      .select("id,protocol,status,requested_by,scheduled_for")
      .eq("id", requestId).single();
    if (!materialRequest) return reply({ error: "Solicitação não localizada." }, 404);

    let recipients: string[] = [];
    let title = "Harmony Store";
    let message = "Há uma atualização no sistema.";
    if (event === "request_created" || event === "request_updated") {
      if (materialRequest.requested_by !== caller.id || !["collaborator", "receiver"].includes(caller.role)) return reply({ error: "Acesso negado." }, 403);
      const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin").eq("status", "active");
      recipients = (admins || []).map(person => person.id);
      title = event === "request_created" ? "Harmony Store • Nova solicitação" : "Harmony Store • Solicitação atualizada";
      message = `${caller.full_name} ${event === "request_created" ? "enviou" : "alterou"} a solicitação #${String(materialRequest.protocol).padStart(4, "0")}.`;
    } else if (event === "status_changed") {
      if (caller.role !== "admin") return reply({ error: "Acesso negado." }, 403);
      recipients = [materialRequest.requested_by];
      const protocol = String(materialRequest.protocol).padStart(4, "0");
      const messages: Record<string, string> = {
        separating: `A solicitação #${protocol} está em separação.`,
        scheduled: `A solicitação #${protocol} foi agendada.`,
        delivered: `A solicitação #${protocol} foi concluída e entregue.`,
        cancelled: `A solicitação #${protocol} foi cancelada.`,
      };
      title = "Harmony Store • Atualização do pedido";
      message = messages[materialRequest.status] || `A solicitação #${protocol} foi atualizada.`;
    } else {
      return reply({ error: "Evento inválido." }, 400);
    }

    if (!recipients.length) return reply({ sent: 0 });
    const { data: subscriptions } = await admin.from("push_subscriptions")
      .select("id,endpoint,p256dh,auth").in("user_id", recipients);
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const payload = JSON.stringify({
      title,
      body: message,
      tag: `request-${materialRequest.id}-${materialRequest.status}`,
      url: "./",
      icon: "./icon-192-v2.png",
      badge: "./notification-badge.svg",
      event,
    });

    let sent = 0, failed = 0;
    await Promise.all((subscriptions || []).map(async subscription => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, payload, { TTL: 86400 });
        sent++;
      } catch (error) {
        failed++;
        const status = Number((error as { statusCode?: number }).statusCode || 0);
        if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", subscription.id);
      }
    }));
    await admin.from("system_events").insert({
      source: "notification", level: failed ? "warning" : "info",
      code: failed ? "push_partial" : "push_sent",
      actor_id: caller.id, details: { event, sent, failed, recipients: recipients.length },
    });
    return reply({ sent });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(JSON.stringify({ event: "send_push_error", error_id: errorId, name: error instanceof Error ? error.name : "Unknown" }));
    return reply({ error: "Não foi possível enviar as notificações.", error_id: errorId }, 500);
  }
});
