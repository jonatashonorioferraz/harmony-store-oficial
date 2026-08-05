import type { StageKey } from "../../domain/orchestration/workflow-plan.ts";

export type StageModelPolicy = { model: "gpt-5.6-sol"; reasoningEffort: "low" | "medium"; maxOutputTokens: number; maxEstimatedCostUsd: number };
const professional = (reasoningEffort: "low" | "medium", maxOutputTokens: number, maxEstimatedCostUsd: number): StageModelPolicy => ({ model: "gpt-5.6-sol", reasoningEffort, maxOutputTokens, maxEstimatedCostUsd });
export const STAGE_MODEL_POLICY: Partial<Record<StageKey, StageModelPolicy>> & Record<"triage" | "visual-analysis" | "strategy" | "copy" | "art-direction" | "compliance-review" | "quality-gate", StageModelPolicy> = {
  "triage": professional("low", 1200, 0.08), "visual-analysis": professional("medium", 2200, 0.20), "strategy": professional("medium", 2200, 0.20),
  "copy": professional("medium", 3000, 0.25), "art-direction": professional("medium", 2400, 0.22), "compliance-review": professional("medium", 2400, 0.22), "quality-gate": professional("medium", 1600, 0.15),
};
export const IMAGE_MODEL_POLICY = { model: "gpt-image-2" as const, quality: "high" as const, size: "1024x1024" as const, maxImagesPerAttempt: 1, maxEstimatedCostUsd: 0.30 };
