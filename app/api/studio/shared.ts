import { getStudioBindings } from "../../../src/harmony-studio/infrastructure/runtime/studio-bindings.ts";
import type { D1DatabasePort } from "../../../src/harmony-studio/infrastructure/persistence/d1-types.ts";
import type { R2BucketPort } from "../../../src/harmony-studio/infrastructure/storage/r2-asset-storage.ts";
import { createStudioRuntime } from "../../../src/harmony-studio/infrastructure/runtime/create-studio-runtime.ts";

export function bindings() { const value = getStudioBindings(); return { db: value.DB, bucket: value.STUDIO_ASSETS as R2BucketPort }; }
export function createRequestStudioRuntime() { const value = bindings(); const apiKey = process.env.OPENAI_API_KEY; if (!apiKey) throw new Error("OPENAI_API_KEY não configurada"); return { ...value, ...createStudioRuntime({ ...value, apiKey }) }; }
export async function assertWorkflowOwner(db: D1DatabasePort, workflowId: string, ownerId: string) { const row = await db.prepare("SELECT w.id FROM studio_workflow_runs w JOIN studio_ad_projects p ON p.id = w.project_id WHERE w.id = ? AND p.owner_id = ?").bind(workflowId, ownerId).first(); if (!row) throw new Error("Trabalho não encontrado"); }
export async function workflowStatus(db: D1DatabasePort, workflowId: string) {
  const run = await db.prepare("SELECT status FROM studio_workflow_runs WHERE id = ?").bind(workflowId).first<{ status: string }>();
  const result = await db.prepare("SELECT stage_key, attempt, status, output_json, error_json FROM studio_stage_runs WHERE workflow_run_id = ? ORDER BY created_at, attempt").bind(workflowId).all<{ stage_key: string; attempt: number; status: string; output_json: string | null; error_json: string | null }>();
  const latest = new Map<string, any>(); for (const row of result.results ?? []) if (!latest.has(row.stage_key) || latest.get(row.stage_key).attempt < row.attempt) latest.set(row.stage_key, { key: row.stage_key, attempt: row.attempt, status: row.status, output: row.output_json ? JSON.parse(row.output_json) : null, error: row.error_json ? JSON.parse(row.error_json) : null });
  const stages = [...latest.values()]; const quality = latest.get("quality-gate")?.output; const approved = run?.status === "succeeded" && quality?.release === "approved"; const copy = latest.get("copy")?.output ?? null; const visual = latest.get("visual-analysis")?.output ?? null;
  const images = [1,2,3,4,5,6].map((n) => latest.get(`visual-production-${n}`)?.output?.candidateAssetId).filter(Boolean).map((id) => ({ id, url: `/api/studio/assets?id=${encodeURIComponent(id)}` }));
  const reviewResult = await db.prepare("SELECT slot, asset_id, decision, feedback, created_at FROM studio_image_human_reviews WHERE workflow_run_id = ? ORDER BY created_at DESC").bind(workflowId).all<any>();
  const humanReviews = images.map((image,index)=>{const row=(reviewResult.results??[]).find((item:any)=>Number(item.slot)===index+1&&item.asset_id===image.id);return row?{slot:index+1,assetId:row.asset_id,decision:row.decision,feedback:row.feedback,createdAt:row.created_at}:{slot:index+1,assetId:image.id,decision:"pending",feedback:null,createdAt:null};});
  return { status: run?.status ?? "missing", approved, stages, copy, visual, quality, images, humanReviews, humanApproved: images.length===6&&humanReviews.every((item)=>item.decision==="approved"), progress: stages.filter((stage) => stage.status === "succeeded").length, total: 13 };
}
