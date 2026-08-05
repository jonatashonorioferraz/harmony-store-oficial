import assert from "node:assert/strict";
import test from "node:test";

import { WorkflowOrchestrator } from "../src/harmony-studio/application/orchestration/workflow-orchestrator.ts";
import { DEFAULT_AGENT_KNOWLEDGE } from "../src/harmony-studio/intelligence/catalog/default-agents.ts";
import { STANDARD_WORKFLOW } from "../src/harmony-studio/domain/orchestration/workflow-plan.ts";

function fixture({ failStageOnce } = {}) {
  const workflows = new Map(); const stages = []; const calls = []; const events = []; let failed = false;
  const repository = {
    async saveWorkflow(run) { workflows.set(run.id, structuredClone(run)); },
    async findWorkflow(id) { return structuredClone(workflows.get(id) ?? null); },
    async saveStages(items) { for (const item of items) { const index = stages.findIndex((row) => row.id === item.id); if (index >= 0) stages[index] = structuredClone(item); else stages.push(structuredClone(item)); } },
    async listStages(id) { return structuredClone(stages.filter((row) => row.workflowRunId === id)); },
  };
  const knowledge = { async findPublished(role) { return { id: `knowledge-${role}-1`, agentRole: role, version: 1, status: "published", content: DEFAULT_AGENT_KNOWLEDGE[role], changeReason: "test", createdBy: "test", createdAt: "2026-08-05T00:00:00.000Z", publishedAt: "2026-08-05T00:00:00.000Z", archivedAt: null }; } };
  const excellence = { async searchActive(filters) { return filters.agentRole === "copywriter" ? [{ id: "reference-1", projectId: "old-project", candidateId: "old-candidate", reviewDecisionId: "old-review", artifactType: "title", marketplace: "Shopee", productCategory: "mini-sabonetes", agentRole: "copywriter", context: { objective: "lembrancinhas" }, decisions: ["clareza"], approvalReason: "aprovado", tags: [], status: "active", createdBy: "owner", createdAt: "2026-08-01T00:00:00.000Z", retiredAt: null }] : []; }, async save() {}, async findById() { return null; }, async findByCandidateId() { return null; } };
  const executor = { async execute(context, idempotencyKey) { calls.push({ context: structuredClone(context), idempotencyKey }); if (context.stageKey === failStageOnce && !failed) { failed = true; throw new Error("simulated failure"); } return { output: outputFor(context.stageKey) }; } };
  const audit = { async append(event) { events.push(event); }, async listByProject() { return events; } };
  return { orchestrator: new WorkflowOrchestrator({ repository, knowledge, excellence, executor, audit }), workflows, stages, calls, events };
}

function outputFor(stage) {
  if (stage === "triage") return { readiness: "ready" };
  if (stage === "visual-analysis") return { observations: ["rosas"] };
  if (stage === "strategy") return { intent: "lembrancinhas" };
  if (stage === "copy") return { title: "Mini Sabonetes Rosinhas", description: "Descrição" };
  if (stage === "art-direction") return { brief: { style: "premium" } };
  if (stage.startsWith("visual-production-")) return { candidateId: `image-${stage.at(-1)}` };
  if (stage === "compliance-review") return { decision: "approved" };
  return { release: "approved" };
}

const initialData = { marketplace: "Shopee", productCategory: "mini-sabonetes", product: { declaredFacts: { quantity: 100 }, approvedFacts: { quantity: 100 } }, assetMetadata: [{ id: "a1" }], assets: [{ id: "a1" }], marketplacePolicy: { titleLimit: 120 }, brandRules: { name: "Harmony Store Oficial" }, artifactMetadata: {}, privateTranscript: "must never leak" };

test("workflow plan assigns twelve isolated stages across eight specialists", () => {
  assert.equal(STANDARD_WORKFLOW.length, 12);
  assert.equal(new Set(STANDARD_WORKFLOW.map((stage) => stage.agentRole)).size, 8);
  assert.ok(STANDARD_WORKFLOW.every((stage) => !stage.allowedInputs.includes("privateTranscript")));
});

test("context contains only explicitly allowed paths and curated references", async () => {
  const { orchestrator, calls } = fixture();
  await orchestrator.start({ id: "workflow-1", projectId: "project-1", initialData, actorId: "owner", auditId: "audit-start" });
  await orchestrator.runNext("workflow-1");
  const triage = calls[0].context;
  assert.deepEqual(Object.keys(triage.inputs).sort(), ["assetMetadata", "product"]);
  assert.equal(JSON.stringify(triage).includes("must never leak"), false);
  assert.equal(triage.excellenceReferences.length, 0);
  for (let i = 0; i < 3; i++) await orchestrator.runNext("workflow-1");
  const copy = calls.find((call) => call.context.stageKey === "copy").context;
  assert.equal(copy.excellenceReferences.length, 1);
  assert.equal("assets" in copy.inputs, false);
});

test("failure retries only the failed stage with a new idempotency key", async () => {
  const { orchestrator, stages, calls } = fixture({ failStageOnce: "strategy" });
  await orchestrator.start({ id: "workflow-2", projectId: "project-1", initialData, actorId: "owner", auditId: "audit-start" });
  await orchestrator.runNext("workflow-2"); await orchestrator.runNext("workflow-2");
  const failure = await orchestrator.runNext("workflow-2");
  assert.equal(failure.status, "failed");
  const retry = await orchestrator.retryFailed("workflow-2", "strategy");
  assert.equal(retry.attempt, 2);
  assert.notEqual(retry.idempotencyKey, failure.idempotencyKey);
  const success = await orchestrator.runNext("workflow-2");
  assert.equal(success.stageKey, "strategy"); assert.equal(success.status, "succeeded");
  assert.equal(stages.filter((stage) => stage.stageKey === "triage").length, 1);
  assert.equal(stages.filter((stage) => stage.stageKey === "visual-analysis").length, 1);
  assert.equal(calls.filter((call) => call.context.stageKey === "strategy").length, 2);
});

test("completed workflow can resume from persisted state without repeating successful stages", async () => {
  const { orchestrator, workflows, calls } = fixture();
  await orchestrator.start({ id: "workflow-3", projectId: "project-1", initialData, actorId: "owner", auditId: "audit-start" });
  for (let i = 0; i < 13; i++) await orchestrator.runNext("workflow-3");
  assert.equal(workflows.get("workflow-3").status, "succeeded");
  assert.equal(calls.length, 12);
  await orchestrator.runNext("workflow-3");
  assert.equal(calls.length, 12);
});

test("quality rejection requires review and directed reprocessing repeats only the affected tail", async () => {
  const { orchestrator, workflows, stages } = fixture();
  await orchestrator.start({ id: "workflow-4", projectId: "project-1", initialData, actorId: "owner", auditId: "audit-start" });
  for (let i = 0; i < 12; i++) await orchestrator.runNext("workflow-4");
  const quality = stages.find((stage) => stage.workflowRunId === "workflow-4" && stage.stageKey === "quality-gate");
  quality.output = { release: "reprocess", reprocessStage: "visual-production-3", reasons: ["corrigir cenário"] };
  await orchestrator.runNext("workflow-4");
  assert.equal(workflows.get("workflow-4").status, "review_required");
  const scheduled = await orchestrator.reprocessFrom("workflow-4", "visual-production-3", "owner");
  assert.deepEqual(scheduled.map((stage) => stage.stageKey), ["visual-production-3", "visual-production-4", "visual-production-5", "compliance-review", "quality-gate"]);
  assert.equal(stages.filter((stage) => stage.stageKey === "copy").length, 1);
  assert.equal(stages.filter((stage) => stage.stageKey === "visual-production-3").length, 2);
});
