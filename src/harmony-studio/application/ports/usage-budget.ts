export interface UsageBudget {
  reserve(idempotencyKey: string, maximumUsd: number): Promise<void>;
  record(idempotencyKey: string, usage: Record<string, unknown>): Promise<void>;
}
