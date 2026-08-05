import type { ContextBundle } from "../../domain/orchestration/context-bundle.ts";

export type StageExecutionResult = { output: Record<string, unknown>; usage?: Record<string, unknown> };
export interface StageExecutor { execute(context: ContextBundle, idempotencyKey: string): Promise<StageExecutionResult>; }
