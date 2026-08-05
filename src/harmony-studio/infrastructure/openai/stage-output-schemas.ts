import type { StageKey } from "../../domain/orchestration/workflow-plan.ts";
const strings = { type: "array", items: { type: "string" } };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
export const STAGE_OUTPUT_SCHEMAS: Partial<Record<StageKey, Record<string, unknown>>> & Record<"triage" | "visual-analysis" | "strategy" | "copy" | "art-direction" | "compliance-review" | "quality-gate", Record<string, unknown>> = {
  "triage": object({ readiness: { type: "string", enum: ["ready", "blocked"] }, issues: strings }),
  "visual-analysis": object({ summary: { type: "string" }, observations: strings, inconsistencies: strings, confidence: { type: "number", minimum: 0, maximum: 100 } }),
  "strategy": object({ primaryKeyword: { type: "string" }, secondaryKeywords: strings, searchIntent: { type: "string" }, titleBlueprint: { type: "string" }, descriptionOutline: strings }),
  "copy": object({ title: { type: "string" }, description: { type: "string" } }),
  "art-direction": object({ briefs: { type: "array", minItems: 5, maxItems: 5, items: object({ objective: { type: "string" }, composition: { type: "string" }, lighting: { type: "string" }, restrictions: strings }) } }),
  "compliance-review": object({ decision: { type: "string", enum: ["approved", "rejected", "changes_requested"] }, score: { type: "number", minimum: 0, maximum: 100 }, issues: strings, corrections: strings }),
  "quality-gate": object({ release: { type: "string", enum: ["approved", "reprocess", "rejected"] }, reprocessStage: { anyOf: [{ type: "string", enum: ["triage", "visual-analysis", "strategy", "copy", "art-direction", "visual-production-1", "visual-production-2", "visual-production-3", "visual-production-4", "visual-production-5", "compliance-review"] }, { type: "null" }] }, reasons: strings }),
};
