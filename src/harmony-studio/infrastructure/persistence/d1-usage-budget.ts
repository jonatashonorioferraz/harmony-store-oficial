import type { UsageBudget } from "../../application/ports/usage-budget.ts";
import { OpenAIIntegrationError } from "../openai/openai-error.ts";
import type { D1DatabasePort } from "./d1-types.ts";

export class D1UsageBudget implements UsageBudget {
  private readonly db: D1DatabasePort; private readonly projectLimitMicros: number;
  constructor(db: D1DatabasePort, projectLimitUsd = 3) { this.db = db; this.projectLimitMicros = Math.round(projectLimitUsd * 1_000_000); }
  async reserve(idempotencyKey: string, maximumUsd: number) {
    if (await this.db.prepare("SELECT id FROM studio_usage_ledger WHERE idempotency_key = ?").bind(idempotencyKey).first()) return;
    const workflowRunId = idempotencyKey.split(":")[0]; const workflow = await this.db.prepare("SELECT project_id FROM studio_workflow_runs WHERE id = ?").bind(workflowRunId).first<{ project_id: string }>(); if (!workflow) throw new Error("Workflow not found for usage reservation");
    const total = await this.db.prepare("SELECT COALESCE(SUM(reserved_usd_micros), 0) AS total FROM studio_usage_ledger WHERE project_id = ? AND status != 'released'").bind(workflow.project_id).first<{ total: number }>(); const configured = await this.db.prepare("SELECT value_json FROM studio_configuration_versions WHERE key = 'maxProjectBudgetUsd' AND status = 'active' ORDER BY version DESC LIMIT 1").first<{ value_json: string }>(); const configuredUsd = configured ? Number(JSON.parse(configured.value_json)) : NaN; const limit = Number.isFinite(configuredUsd) && configuredUsd > 0 ? Math.round(configuredUsd * 1_000_000) : this.projectLimitMicros; const requested = Math.round(maximumUsd * 1_000_000);
    if ((total?.total ?? 0) + requested > limit) throw new OpenAIIntegrationError({ kind: "budget", message: "Project AI budget would be exceeded" });
    const timestamp = new Date().toISOString(); await this.db.prepare("INSERT INTO studio_usage_ledger (id, project_id, workflow_run_id, idempotency_key, reserved_usd_micros, actual_usd_micros, usage_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), workflow.project_id, workflowRunId, idempotencyKey, requested, null, null, "reserved", timestamp, timestamp).run();
  }
  async record(idempotencyKey: string, usage: Record<string, unknown>) { await this.db.prepare("UPDATE studio_usage_ledger SET usage_json = ?, status = 'recorded', updated_at = ? WHERE idempotency_key = ?").bind(JSON.stringify(usage), new Date().toISOString(), idempotencyKey).run(); }
}
