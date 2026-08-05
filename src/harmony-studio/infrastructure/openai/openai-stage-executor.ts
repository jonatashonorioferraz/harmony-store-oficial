import type { GeneratedAssetSink } from "../../application/ports/generated-asset-sink.ts";
import type { StageExecutor, StageExecutionResult } from "../../application/ports/stage-executor.ts";
import type { UsageBudget } from "../../application/ports/usage-budget.ts";
import type { SourceAssetReader } from "../../application/ports/source-asset-reader.ts";
import type { ContextBundle } from "../../domain/orchestration/context-bundle.ts";
import { IMAGE_MODEL_POLICY, STAGE_MODEL_POLICY } from "./model-policy.ts";
import { OpenAIIntegrationError } from "./openai-error.ts";
import { OpenAIHttpClient } from "./openai-http-client.ts";
import { STAGE_OUTPUT_SCHEMAS } from "./stage-output-schemas.ts";

function instructions(context: ContextBundle) { const i = context.instructions; return [i.mission, "Regras obrigatórias:", ...i.mandatoryRules.map((v) => `- ${v}`), "Nunca faça:", ...i.neverDo.map((v) => `- ${v}`), "Checklist:", ...i.qualityChecklist.map((v) => `- ${v}`), "Use apenas os dados fornecidos. Diferencie fatos de inferências. Não exponha raciocínio interno."].join("\n"); }
function outputText(payload: any) { return payload.output_text ?? payload.output?.flatMap((item: any) => item.content ?? []).find((item: any) => item.type === "output_text")?.text ?? ""; }

export class OpenAIStageExecutor implements StageExecutor {
  private readonly client: OpenAIHttpClient; private readonly budget: UsageBudget; private readonly assets: GeneratedAssetSink; private readonly sourceAssets?: SourceAssetReader;
  constructor(input: { client: OpenAIHttpClient; budget: UsageBudget; assets: GeneratedAssetSink; sourceAssets?: SourceAssetReader }) { this.client = input.client; this.budget = input.budget; this.assets = input.assets; this.sourceAssets = input.sourceAssets; }
  async execute(context: ContextBundle, idempotencyKey: string): Promise<StageExecutionResult> { return context.stageKey.startsWith("visual-production-") ? this.image(context, idempotencyKey) : this.structured(context, idempotencyKey); }
  private async structured(context: ContextBundle, idempotencyKey: string) {
    const policy = STAGE_MODEL_POLICY[context.stageKey]; if (!policy) throw new OpenAIIntegrationError({ kind: "invalid_request", message: `No text model policy for ${context.stageKey}` }); await this.budget.reserve(idempotencyKey, policy.maxEstimatedCostUsd);
    const input = context.stageKey === "visual-analysis" || context.stageKey === "compliance-review" ? await this.visionInput(context) : JSON.stringify({ inputs: context.inputs, approvedReferences: context.excellenceReferences });
    const { payload, requestId } = await this.client.request("responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: policy.model, instructions: instructions(context), input, reasoning: { effort: policy.reasoningEffort }, max_output_tokens: policy.maxOutputTokens, text: { verbosity: "medium", format: { type: "json_schema", name: `${context.stageKey.replaceAll("-", "_")}_output`, strict: true, schema: STAGE_OUTPUT_SCHEMAS[context.stageKey]! } }, store: false }) }, idempotencyKey);
    const text = outputText(payload); let output: Record<string, unknown>; try { output = JSON.parse(text); } catch { throw new OpenAIIntegrationError({ kind: "invalid_response", message: "OpenAI returned an invalid structured response", requestId }); }
    const usage = { provider: "openai", model: policy.model, requestId, inputTokens: payload.usage?.input_tokens ?? 0, outputTokens: payload.usage?.output_tokens ?? 0, totalTokens: payload.usage?.total_tokens ?? 0 };
    await this.budget.record(idempotencyKey, usage); return { output, usage };
  }
  private async image(context: ContextBundle, idempotencyKey: string) {
    await this.budget.reserve(idempotencyKey, IMAGE_MODEL_POLICY.maxEstimatedCostUsd); const images = await this.resolveImages(context);
    const form = new FormData(); form.append("model", IMAGE_MODEL_POLICY.model); form.append("quality", IMAGE_MODEL_POLICY.quality); form.append("size", IMAGE_MODEL_POLICY.size); form.append("output_format", "png"); form.append("n", "1"); form.append("prompt", instructions(context) + `\nBriefing e referências autorizadas: ${JSON.stringify(context.inputs)}`); images.forEach((item, index) => form.append("image[]", item.blob!, item.name ?? `reference-${index + 1}.png`));
    const { payload, requestId } = await this.client.request("images/edits", { method: "POST", body: form }, idempotencyKey); const base64 = payload.data?.[0]?.b64_json; if (!base64) throw new OpenAIIntegrationError({ kind: "invalid_response", message: "OpenAI did not return the generated image", requestId });
    const stored = await this.assets.store({ idempotencyKey, base64, contentType: "image/png" }); const usage = { provider: "openai", model: IMAGE_MODEL_POLICY.model, requestId, images: 1, quality: IMAGE_MODEL_POLICY.quality, size: IMAGE_MODEL_POLICY.size, inputTokens: payload.usage?.input_tokens ?? null, outputTokens: payload.usage?.output_tokens ?? null };
    await this.budget.record(idempotencyKey, usage); return { output: { candidateAssetId: stored.assetId }, usage };
  }
  private async resolveImages(context: ContextBundle) { const refs = (context.inputs.assets ?? []) as Array<{ id?: string; blob?: Blob; name?: string }>; if (!Array.isArray(refs) || refs.length !== 4) throw new OpenAIIntegrationError({ kind: "invalid_request", message: "Exactly four image references are required" }); return Promise.all(refs.map(async (item, index) => item.blob instanceof Blob ? { blob: item.blob, name: item.name ?? `reference-${index + 1}.png` } : item.id && this.sourceAssets ? this.sourceAssets.read(item.id) : Promise.reject(new OpenAIIntegrationError({ kind: "invalid_request", message: "Image reference is unavailable" })))); }
  private async visionInput(context: ContextBundle) { let images; if (context.stageKey === "visual-analysis") images = await this.resolveImages(context); else { if (!this.sourceAssets) throw new OpenAIIntegrationError({ kind: "invalid_request", message: "Asset reader is unavailable" }); const ids = Object.entries(context.inputs).filter(([key]) => key.startsWith("visual-production-")).map(([, value]: any) => value?.candidateAssetId).filter(Boolean); images = await Promise.all(ids.map((id) => this.sourceAssets!.read(id))); } const content: any[] = [{ type: "input_text", text: JSON.stringify({ inputs: context.inputs, approvedReferences: context.excellenceReferences }) }]; for (const image of images) { const bytes = new Uint8Array(await image.blob.arrayBuffer()); let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); content.push({ type: "input_image", detail: "high", image_url: `data:${image.blob.type || "image/png"};base64,${btoa(binary)}` }); } return [{ role: "user", content }]; }
}
