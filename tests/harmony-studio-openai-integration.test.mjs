import assert from "node:assert/strict";
import test from "node:test";

import { OpenAIHttpClient } from "../src/harmony-studio/infrastructure/openai/openai-http-client.ts";
import { OpenAIStageExecutor } from "../src/harmony-studio/infrastructure/openai/openai-stage-executor.ts";
import { normalizeOpenAIError } from "../src/harmony-studio/infrastructure/openai/openai-error.ts";
import { IMAGE_MODEL_POLICY, STAGE_MODEL_POLICY } from "../src/harmony-studio/infrastructure/openai/model-policy.ts";

const context = (stageKey) => ({ stageKey, agentRole: stageKey === "copy" ? "copywriter" : "virtual-photographer", knowledgeVersionId: "knowledge-1", instructions: { mission: "Produza com fidelidade", mandatoryRules: ["Não inventar"], bestPractices: [], neverDo: ["Expor raciocínio"], qualityChecklist: ["Fidelidade"], outputContract: {} }, inputs: stageKey === "copy" ? { product: { quantity: 100 } } : { "art-direction": { brief: "catálogo" }, assets: [1, 2, 3, 4].map((n) => ({ name: `${n}.png`, blob: new Blob([String(n)], { type: "image/png" }) })) }, excellenceReferences: [] });

test("current model policy separates professional text and direct image generation", () => {
  assert.equal(STAGE_MODEL_POLICY.copy.model, "gpt-5.6-sol");
  assert.equal(IMAGE_MODEL_POLICY.model, "gpt-image-2");
  assert.equal(IMAGE_MODEL_POLICY.maxImagesPerAttempt, 1);
});

test("structured executor uses strict JSON Schema, usage and idempotency", async () => {
  const requests = []; const reservations = []; const records = [];
  const fetcher = async (url, init) => { requests.push({ url, init }); return new Response(JSON.stringify({ output_text: JSON.stringify({ title: "Mini Sabonetes", description: "Descrição" }), usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } }), { status: 200, headers: { "x-request-id": "req-1" } }); };
  const executor = new OpenAIStageExecutor({ client: new OpenAIHttpClient({ apiKey: "test", fetcher, maxRetries: 0 }), budget: { reserve: async (...args) => reservations.push(args), record: async (...args) => records.push(args) }, assets: { store: async () => ({ assetId: "asset-1" }) } });
  const result = await executor.execute(context("copy"), "workflow:copy:1"); const body = JSON.parse(requests[0].init.body);
  assert.equal(body.model, "gpt-5.6-sol"); assert.equal(body.text.format.type, "json_schema"); assert.equal(body.text.format.strict, true); assert.equal(body.store, false);
  assert.equal(requests[0].init.headers["Idempotency-Key"], "workflow:copy:1"); assert.equal(result.usage.totalTokens, 30); assert.equal(reservations.length, 1); assert.equal(records.length, 1);
});

test("transient failure retries with the same idempotency key", async () => {
  const keys = []; let count = 0; const fetcher = async (_url, init) => { keys.push(init.headers["Idempotency-Key"]); count++; return count === 1 ? new Response(JSON.stringify({ error: { message: "busy" } }), { status: 500 }) : new Response(JSON.stringify({ ok: true }), { status: 200 }); };
  const client = new OpenAIHttpClient({ apiKey: "test", fetcher, maxRetries: 1 }); await client.request("responses", { method: "POST" }, "workflow:stage:1"); assert.deepEqual(keys, ["workflow:stage:1", "workflow:stage:1"]);
});

test("billing and rate-limit errors are distinguishable", () => {
  assert.equal(normalizeOpenAIError(429, { error: { code: "credit_balance_exhausted" } }, "req").kind, "credits");
  assert.equal(normalizeOpenAIError(429, { error: { code: "rate_limit_exceeded" } }, "req").kind, "rate_limit");
  assert.equal(normalizeOpenAIError(429, { error: { code: "project_spend_limit_exceeded" } }, "req").kind, "spend_limit");
});

test("image executor requests one edit and persists paid output immediately", async () => {
  const requests = []; const stored = [];
  const fetcher = async (url, init) => { requests.push({ url, init }); return new Response(JSON.stringify({ data: [{ b64_json: "aW1hZ2U=" }], usage: { output_tokens: 5 } }), { status: 200, headers: { "x-request-id": "req-image" } }); };
  const executor = new OpenAIStageExecutor({ client: new OpenAIHttpClient({ apiKey: "test", fetcher, maxRetries: 0 }), budget: { reserve: async () => {}, record: async () => {} }, assets: { store: async (item) => { stored.push(item); return { assetId: "asset-paid" }; } } });
  const result = await executor.execute(context("visual-production"), "workflow:visual-production:1"); const form = requests[0].init.body;
  assert.match(requests[0].url, /images\/edits$/); assert.equal(form.get("model"), "gpt-image-2"); assert.equal(form.get("n"), "1"); assert.equal(form.getAll("image[]").length, 4); assert.equal(stored.length, 1); assert.equal(result.output.candidateAssetId, "asset-paid");
});
