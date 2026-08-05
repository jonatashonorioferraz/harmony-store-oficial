import type { AgentKnowledgeVersion, AgentRole } from "../intelligence/agent-knowledge.ts";
import type { ExcellenceItem } from "../excellence/excellence-item.ts";
import type { StageKey } from "./workflow-plan.ts";
import type { VisualReference } from "../../application/ports/visual-reference-repository.ts";

export type ContextBundle = { stageKey: StageKey; agentRole: AgentRole; knowledgeVersionId: string; instructions: { mission: string; mandatoryRules: string[]; bestPractices: string[]; neverDo: string[]; qualityChecklist: string[]; outputContract: Record<string, string> }; inputs: Record<string, unknown>; excellenceReferences: Array<{ id: string; context: Record<string, unknown>; decisions: string[]; approvalReason: string }>; visualReferences?: VisualReference[] };

function readPath(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, source);
}
function writePath(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split("."); let cursor = target;
  for (const key of keys.slice(0, -1)) cursor = (cursor[key] ??= {}) as Record<string, unknown>;
  cursor[keys.at(-1)!] = structuredClone(value);
}

export function buildContextBundle(input: { stageKey: StageKey; agentRole: AgentRole; allowedInputs: string[]; availableData: Record<string, unknown>; knowledge: AgentKnowledgeVersion; excellence: ExcellenceItem[]; visualReferences?: VisualReference[] }): ContextBundle {
  if (input.knowledge.agentRole !== input.agentRole || input.knowledge.status !== "published") throw new Error("Published knowledge must match the stage agent");
  const selected: Record<string, unknown> = {};
  for (const path of input.allowedInputs) { const value = readPath(input.availableData, path); if (value !== undefined) writePath(selected, path, value); }
  return { stageKey: input.stageKey, agentRole: input.agentRole, knowledgeVersionId: input.knowledge.id, instructions: { mission: input.knowledge.content.mission, mandatoryRules: [...input.knowledge.content.mandatoryRules], bestPractices: [...input.knowledge.content.bestPractices], neverDo: [...input.knowledge.content.neverDo], qualityChecklist: [...input.knowledge.content.qualityChecklist], outputContract: structuredClone(input.knowledge.content.outputContract) }, inputs: selected, excellenceReferences: input.excellence.map((item) => ({ id: item.id, context: structuredClone(item.context), decisions: [...item.decisions], approvalReason: item.approvalReason })), visualReferences: structuredClone(input.visualReferences ?? []) };
}
