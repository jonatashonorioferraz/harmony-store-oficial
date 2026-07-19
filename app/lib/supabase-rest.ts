export type HarmonySession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string; email?: string };
};

export type Profile = {
  id: string;
  role: "admin" | "collaborator";
  full_name: string;
  username: string;
  harmony_id: string;
  department?: string | null;
  phone?: string | null;
  status: "active" | "inactive";
  is_primary_admin: boolean;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
const sessionKey = "harmony.official.session.v1";

export const isSupabaseConfigured = Boolean(url && key);

function authEmail(login: string) {
  const normalized = login.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@auth.harmonylembrancinhas.com.br`;
}

async function parseResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.msg || body?.message || body?.error_description || body?.error || "Não foi possível concluir a operação.");
  }
  return body;
}

export async function signIn(login: string, password: string): Promise<HarmonySession> {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email: authEmail(login), password }),
  });
  const data = await parseResponse(response);
  const session = { ...data, expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600) } as HarmonySession;
  localStorage.setItem(sessionKey, JSON.stringify(session));
  return session;
}

export async function getStoredSession(): Promise<HarmonySession | null> {
  const raw = localStorage.getItem(sessionKey);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as HarmonySession;
    if ((session.expires_at || 0) > Math.floor(Date.now() / 1000) + 60) return session;
    const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const data = await parseResponse(response);
    const refreshed = { ...data, expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600) } as HarmonySession;
    localStorage.setItem(sessionKey, JSON.stringify(refreshed));
    return refreshed;
  } catch {
    localStorage.removeItem(sessionKey);
    return null;
  }
}

export async function signOut(session?: HarmonySession | null) {
  if (session?.access_token) {
    await fetch(`${url}/auth/v1/logout`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${session.access_token}` } }).catch(() => undefined);
  }
  localStorage.removeItem(sessionKey);
}

export async function dbRequest<T>(session: HarmonySession, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  return parseResponse(response) as Promise<T>;
}

export function productImageUrl(path?: string | null) {
  return path ? `${url}/storage/v1/object/public/product-images/${path}` : "";
}
