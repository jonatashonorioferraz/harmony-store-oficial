import type { GlobalConfigurationReader } from "../../application/ports/global-configuration-reader.ts";
import type { D1DatabasePort } from "./d1-types.ts";
export class D1GlobalConfigurationReader implements GlobalConfigurationReader {
  constructor(private readonly db: D1DatabasePort) {}
  async getActive<T>(key: string, fallback: T): Promise<T> { const row = await this.db.prepare("SELECT value_json FROM studio_configuration_versions WHERE key = ? AND status = 'active' ORDER BY version DESC LIMIT 1").bind(key).first<{ value_json: string }>(); if (!row) return fallback; try { return JSON.parse(row.value_json) as T; } catch { return fallback; } }
}
