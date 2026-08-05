import type { AgentRole } from "../intelligence/agent-knowledge.ts";

export const STAGE_KEYS = ["triage", "visual-analysis", "strategy", "copy", "art-direction", "visual-production-1", "visual-production-2", "visual-production-3", "visual-production-4", "visual-production-5", "compliance-review", "quality-gate"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];
export type StageStatus = "pending" | "running" | "succeeded" | "failed" | "blocked" | "cancelled";

export type StageDefinition = {
  key: StageKey;
  agentRole: AgentRole;
  dependencies: StageKey[];
  allowedInputs: string[];
  usesExcellence: boolean;
};

export const STANDARD_WORKFLOW: readonly StageDefinition[] = [
  { key: "triage", agentRole: "triage", dependencies: [], allowedInputs: ["product", "assetMetadata"], usesExcellence: false },
  { key: "visual-analysis", agentRole: "visual-analyst", dependencies: ["triage"], allowedInputs: ["product.declaredFacts", "assets", "triage"], usesExcellence: false },
  { key: "strategy", agentRole: "marketplace-strategist", dependencies: ["visual-analysis"], allowedInputs: ["product.approvedFacts", "marketplacePolicy", "visual-analysis.observations"], usesExcellence: true },
  { key: "copy", agentRole: "copywriter", dependencies: ["strategy"], allowedInputs: ["product.approvedFacts", "brandRules", "strategy"], usesExcellence: true },
  { key: "art-direction", agentRole: "art-director", dependencies: ["strategy", "visual-analysis"], allowedInputs: ["brandRules", "strategy", "visual-analysis.observations"], usesExcellence: true },
  { key: "visual-production-1", agentRole: "virtual-photographer", dependencies: ["art-direction"], allowedInputs: ["art-direction.briefs.0", "assets"], usesExcellence: true },
  { key: "visual-production-2", agentRole: "virtual-photographer", dependencies: ["visual-production-1"], allowedInputs: ["art-direction.briefs.1", "assets"], usesExcellence: true },
  { key: "visual-production-3", agentRole: "virtual-photographer", dependencies: ["visual-production-2"], allowedInputs: ["art-direction.briefs.2", "assets"], usesExcellence: true },
  { key: "visual-production-4", agentRole: "virtual-photographer", dependencies: ["visual-production-3"], allowedInputs: ["art-direction.briefs.3", "assets"], usesExcellence: true },
  { key: "visual-production-5", agentRole: "virtual-photographer", dependencies: ["visual-production-4"], allowedInputs: ["art-direction.briefs.4", "assets"], usesExcellence: true },
  { key: "compliance-review", agentRole: "compliance-reviewer", dependencies: ["copy", "visual-production-1", "visual-production-2", "visual-production-3", "visual-production-4", "visual-production-5"], allowedInputs: ["product", "marketplacePolicy", "copy", "visual-production-1", "visual-production-2", "visual-production-3", "visual-production-4", "visual-production-5"], usesExcellence: false },
  { key: "quality-gate", agentRole: "quality-director", dependencies: ["compliance-review"], allowedInputs: ["compliance-review", "artifactMetadata"], usesExcellence: false },
] as const;

export type StageRun = { id: string; workflowRunId: string; stageKey: StageKey; attempt: number; status: StageStatus; idempotencyKey: string; agentRole: AgentRole; knowledgeVersionId: string | null; inputHash: string | null; output: Record<string, unknown> | null; error: { code: string; message: string; retryable: boolean } | null; usage: Record<string, unknown> | null; startedAt: string | null; completedAt: string | null; createdAt: string; updatedAt: string };

export function createStageRun(workflowRunId: string, definition: StageDefinition, attempt: number, now = new Date().toISOString()): StageRun {
  return { id: crypto.randomUUID(), workflowRunId, stageKey: definition.key, attempt, status: "pending", idempotencyKey: `${workflowRunId}:${definition.key}:${attempt}`, agentRole: definition.agentRole, knowledgeVersionId: null, inputHash: null, output: null, error: null, usage: null, startedAt: null, completedAt: null, createdAt: now, updatedAt: now };
}
