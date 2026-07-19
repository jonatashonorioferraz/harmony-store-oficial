import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const emailFor = (username: string) => `${username.trim().toLowerCase()}@auth.harmonylembrancinhas.com.br`;
const digits = (value = "") => value.replace(/\D/g, "");
const safeRole = (value: unknown) => value === "admin" ? "admin" : value === "receiver" ? "receiver" : "collaborator";
const passwordIssue = (value: unknown) => {
  const password = String(value || "");
  if (password.length < 10) return "A nova senha deve ter pelo menos 10 caracteres.";
  if (password.length > 72) return "A nova senha deve ter no máximo 72 caracteres.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return "Use letra maiúscula, letra minúscula, número e símbolo na nova senha.";
  }
  return "";
};
async function cpfHash(cpf?: string) {
  const clean = digits(cpf);
  if (!clean) return { cpf_hash: null, cpf_last4: null };
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clean));
  return { cpf_hash: [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2,"0")).join(""), cpf_last4: clean.slice(-4) };
}

const operationalHistoryReferences = [
  ["requests", "requested_by"],
  ["finished_production_receipts", "worker_id"],
  ["finished_production_receipts", "received_by"],
  ["production_weekly_closings", "worker_id"],
  ["production_weekly_closings", "closed_by"],
  ["production_weekly_closings", "paid_by"],
  ["purchase_orders", "created_by"],
  ["stock_movements", "created_by"],
] as const;

async function hasOperationalHistory(admin: ReturnType<typeof createClient>, id: string) {
  const checks = await Promise.all(operationalHistoryReferences.map(async ([table, column]) => {
    const { count, error } = await admin.from(table).select(column, { count: "exact", head: true }).eq(column, id);
    if (error) throw error;
    return (count || 0) > 0;
  }));
  return checks.some(Boolean);
}

async function setAccessStatus(admin: ReturnType<typeof createClient>, id: string, status: "active" | "inactive") {
  const { error: authError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: status === "inactive" ? "876000h" : "none",
  });
  if (authError) throw authError;
  const { error: profileError } = await admin.from("profiles").update({ status }).eq("id", id);
  if (profileError) throw profileError;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método não permitido." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "Sessão ausente." }, 401);
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return reply({ error: "Sessão inválida." }, 401);
    const { data: caller } = await admin.from("profiles").select("role,status,is_primary_admin,must_change_password").eq("id", authData.user.id).single();
    if (!caller || caller.status !== "active") return reply({ error: "Acesso negado." }, 403);
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "change-own-password") {
      const password = String(body.password || "");
      const issue = passwordIssue(password);
      if (issue) return reply({ error: issue }, 400);

      const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
      const passwordResponse = await fetch(`${url}/auth/v1/user`, {
        method: "PUT",
        headers: {
          apikey: anon,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      if (!passwordResponse.ok) {
        const detail = await passwordResponse.json().catch(() => ({}));
        return reply({ error: detail.msg || detail.message || "Não foi possível alterar a senha." }, passwordResponse.status);
      }

      const { error: profileError } = await admin.from("profiles")
        .update({ must_change_password: false })
        .eq("id", authData.user.id)
        .eq("status", "active");
      if (profileError) throw profileError;
      await admin.from("audit_logs").insert({
        actor_id: authData.user.id,
        action: "password.self_update",
        entity_type: "profile",
        entity_id: authData.user.id,
      });
      return reply({ ok: true });
    }

    if (caller.role !== "admin") return reply({ error: "Acesso negado." }, 403);

    if (action === "create") {
      if (!body.username || !body.password || !body.full_name) return reply({ error: "Nome, login e senha são obrigatórios." }, 400);
      const issue = passwordIssue(body.password);
      if (issue) return reply({ error: issue }, 400);
      const requestedRole = safeRole(body.role);
      if (requestedRole === "admin" && !caller.is_primary_admin) {
        return reply({ error: "Somente a administradora principal pode criar outro ADM." }, 403);
      }
      const { data, error } = await admin.auth.admin.createUser({
        email: emailFor(body.username), password: body.password, email_confirm: true,
        user_metadata: { full_name: body.full_name },
      });
      if (error) throw error;
      const cpf = await cpfHash(body.cpf);
      const { error: profileError } = await admin.from("profiles").update({
        full_name: body.full_name.trim(), username: body.username.trim().toLowerCase(),
        role: requestedRole, department: body.department || null,
        phone: body.phone || null, status: body.status === "inactive" ? "inactive" : "active",
        must_change_password: true, ...cpf,
      }).eq("id", data.user.id);
      if (profileError) { await admin.auth.admin.deleteUser(data.user.id); throw profileError; }
      await admin.from("audit_logs").insert({ actor_id: authData.user.id, action: "profile.created", entity_type: "profile", entity_id: data.user.id });
      return reply({ id: data.user.id });
    }

    const id = String(body.id || "");
    if (!id) return reply({ error: "Usuário inválido." }, 400);
    const { data: target } = await admin.from("profiles").select("role,status,is_primary_admin").eq("id", id).single();
    if (!target) return reply({ error: "Usuário não localizado." }, 404);

    if (action === "delete") {
      if (!caller.is_primary_admin) return reply({ error: "Somente a administradora principal pode excluir acessos." }, 403);
      if (target.is_primary_admin) return reply({ error: "A administradora principal não pode ser excluída." }, 400);
      if (await hasOperationalHistory(admin, id)) {
        await setAccessStatus(admin, id, "inactive");
        await admin.from("push_subscriptions").delete().eq("user_id", id);
        await admin.from("audit_logs").insert({ actor_id: authData.user.id, action: "profile.deactivated", entity_type: "profile", entity_id: id });
        return reply({ ok: true, mode: "deactivated" });
      }
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
      await admin.from("audit_logs").insert({ actor_id: authData.user.id, action: "profile.deleted", entity_type: "profile", entity_id: id });
      return reply({ ok: true, mode: "deleted" });
    }

    if (action === "update") {
      const isSelf = id === authData.user.id;
      const requestedRole = safeRole(body.role);
      if (target.is_primary_admin && !isSelf) {
        return reply({ error: "As credenciais da administradora principal só podem ser alteradas por ela mesma." }, 403);
      }
      if (target.role === "admin" && !caller.is_primary_admin && !isSelf) {
        return reply({ error: "Somente a administradora principal pode alterar outro ADM." }, 403);
      }
      if (target.role !== "admin" && requestedRole === "admin" && !caller.is_primary_admin) {
        return reply({ error: "Somente a administradora principal pode promover uma pessoa para ADM." }, 403);
      }
      if (body.password) {
        const issue = passwordIssue(body.password);
        if (issue) return reply({ error: issue }, 400);
      }
      const protectedRole = target.is_primary_admin
        ? "admin"
        : target.role === "admin" && !caller.is_primary_admin
          ? "admin"
          : requestedRole;
      const protectedStatus = target.is_primary_admin || isSelf
        ? "active"
        : body.status === "inactive" ? "inactive" : "active";
      const authUpdate: Record<string, unknown> = {};
      if (body.username) { authUpdate.email = emailFor(body.username); authUpdate.email_confirm = true; }
      if (body.password) authUpdate.password = body.password;
      if (body.status && !target.is_primary_admin && !isSelf) {
        authUpdate.ban_duration = protectedStatus === "inactive" ? "876000h" : "none";
      }
      if (Object.keys(authUpdate).length) {
        const { error } = await admin.auth.admin.updateUserById(id, authUpdate);
        if (error) throw error;
      }
      const cpf = body.cpf ? await cpfHash(body.cpf) : {};
      const patch: Record<string, unknown> = {
        full_name: body.full_name?.trim(), username: body.username?.trim().toLowerCase(),
        role: protectedRole,
        department: body.department || null, phone: body.phone || null,
        status: protectedStatus, ...cpf,
      };
      if (body.password) patch.must_change_password = !isSelf;
      Object.keys(patch).forEach(k => patch[k] === undefined && delete patch[k]);
      const { error } = await admin.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
      await admin.from("audit_logs").insert({ actor_id: authData.user.id, action: "profile.updated", entity_type: "profile", entity_id: id });
      return reply({ ok: true });
    }
    return reply({ error: "Ação inválida." }, 400);
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Falha interna." }, 400);
  }
});
