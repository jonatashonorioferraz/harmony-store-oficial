import { normalizeOpenAIError, OpenAIIntegrationError } from "./openai-error.ts";

type FetchLike = typeof fetch;
export class OpenAIHttpClient {
  private readonly apiKey: string; private readonly fetcher: FetchLike; private readonly maxRetries: number;
  constructor(input: { apiKey: string; fetcher?: FetchLike; maxRetries?: number }) { if (!input.apiKey) throw new OpenAIIntegrationError({ kind: "authentication", message: "OPENAI_API_KEY is unavailable" }); this.apiKey = input.apiKey; this.fetcher = input.fetcher ?? fetch; this.maxRetries = input.maxRetries ?? 2; }
  async request(path: string, init: RequestInit, idempotencyKey: string) {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try { response = await this.fetcher(`https://api.openai.com/v1/${path}`, { ...init, headers: { Authorization: `Bearer ${this.apiKey}`, "Idempotency-Key": idempotencyKey, ...(init.headers ?? {}) } }); }
      catch (error) { if (attempt < this.maxRetries) continue; throw new OpenAIIntegrationError({ kind: "timeout", message: error instanceof Error ? error.message : "OpenAI network failure", retryable: true }); }
      const requestId = response.headers.get("x-request-id"); const payload = await response.json().catch(() => ({}));
      if (response.ok) return { payload, requestId };
      const normalized = normalizeOpenAIError(response.status, payload, requestId);
      if (!normalized.retryable || attempt >= this.maxRetries) throw normalized;
    }
  }
}
