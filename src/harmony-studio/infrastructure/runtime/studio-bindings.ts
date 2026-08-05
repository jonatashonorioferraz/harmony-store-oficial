import { env } from "cloudflare:workers";
import type { D1DatabasePort } from "../persistence/d1-types.ts";

export type StudioBindings = { DB: D1DatabasePort; STUDIO_ASSETS: unknown };
export function getStudioBindings(): StudioBindings {
  if (!env.DB) throw new Error("Studio D1 binding DB is unavailable");
  if (!env.STUDIO_ASSETS) throw new Error("Studio R2 binding STUDIO_ASSETS is unavailable");
  return { DB: env.DB as unknown as D1DatabasePort, STUDIO_ASSETS: env.STUDIO_ASSETS };
}
