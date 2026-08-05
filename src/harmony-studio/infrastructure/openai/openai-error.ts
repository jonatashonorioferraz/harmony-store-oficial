export type OpenAIErrorKind = "authentication" | "rate_limit" | "credits" | "spend_limit" | "invalid_request" | "safety" | "timeout" | "upstream" | "invalid_response" | "budget";
export class OpenAIIntegrationError extends Error {
  readonly kind: OpenAIErrorKind; readonly status: number | null; readonly code: string | null; readonly requestId: string | null; readonly retryable: boolean;
  constructor(input: { kind: OpenAIErrorKind; message: string; status?: number | null; code?: string | null; requestId?: string | null; retryable?: boolean }) { super(input.message); this.name = "OpenAIIntegrationError"; this.kind = input.kind; this.status = input.status ?? null; this.code = input.code ?? null; this.requestId = input.requestId ?? null; this.retryable = input.retryable ?? false; }
}

export function normalizeOpenAIError(status: number, payload: any, requestId: string | null): OpenAIIntegrationError {
  const code = payload?.error?.code ?? payload?.error?.type ?? null; const message = payload?.error?.message ?? `OpenAI request failed (${status})`;
  if (status === 401 || status === 403) return new OpenAIIntegrationError({ kind: "authentication", message, status, code, requestId });
  if (code === "credit_balance_exhausted") return new OpenAIIntegrationError({ kind: "credits", message, status, code, requestId });
  if (code === "organization_spend_limit_exceeded" || code === "project_spend_limit_exceeded") return new OpenAIIntegrationError({ kind: "spend_limit", message, status, code, requestId });
  if (status === 429) return new OpenAIIntegrationError({ kind: "rate_limit", message, status, code, requestId, retryable: true });
  if (status === 400) return new OpenAIIntegrationError({ kind: "invalid_request", message, status, code, requestId });
  if (status >= 500 || status === 408) return new OpenAIIntegrationError({ kind: "upstream", message, status, code, requestId, retryable: true });
  return new OpenAIIntegrationError({ kind: "upstream", message, status, code, requestId });
}
