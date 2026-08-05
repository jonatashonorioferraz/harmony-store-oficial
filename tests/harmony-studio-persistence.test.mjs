import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ProjectService } from "../src/harmony-studio/application/projects/project-service.ts";
import { SourceAssetService } from "../src/harmony-studio/application/assets/source-asset-service.ts";
import { R2AssetStorage } from "../src/harmony-studio/infrastructure/storage/r2-asset-storage.ts";

test("Studio migration creates the complete isolated persistence model", async () => {
  const sql = await readFile(new URL("../drizzle/0000_next_kat_farrell.sql", import.meta.url), "utf8");
  const tables = [...sql.matchAll(/CREATE TABLE `([^`]+)`/g)].map((match) => match[1]);
  assert.deepEqual(tables.sort(), [
    "studio_ad_projects", "studio_agent_knowledge_versions", "studio_artifact_candidates",
    "studio_audit_events", "studio_product_snapshots", "studio_review_decisions",
    "studio_source_assets", "studio_stage_runs", "studio_workflow_runs",
  ].sort());
  assert.match(sql, /studio_stage_idempotency_unique/);
  assert.match(sql, /studio_knowledge_role_version_unique/);
});

test("hosting declares durable D1 and R2 bindings", async () => {
  const config = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));
  assert.equal(config.d1, "DB");
  assert.equal(config.r2, "STUDIO_ASSETS");
});

test("project creation is persisted and audited", async () => {
  const saved = [];
  const events = [];
  const service = new ProjectService({ save: async (item) => saved.push(item), findById: async () => null, listByOwner: async () => [] }, { append: async (event) => events.push(event), listByProject: async () => [] });
  const project = await service.create({ id: "project-1", ownerId: "owner-1", name: " Rosinhas ", marketplace: "Shopee", actorId: "owner-1", auditId: "audit-1", now: "2026-08-05T12:00:00.000Z" });
  assert.equal(project.name, "Rosinhas");
  assert.equal(saved.length, 1);
  assert.equal(events[0].eventType, "project.created");
});

test("source asset stores binary in R2 and metadata in the repository", async () => {
  const objects = new Map();
  const bucket = {
    async put(key, body, options) { objects.set(key, { body, options }); return { size: body.byteLength }; },
    async get(key) { const item = objects.get(key); return item ? { body: new Response(item.body).body, httpMetadata: item.options.httpMetadata } : null; },
    async delete(key) { objects.delete(key); },
  };
  const rows = [];
  const storage = new R2AssetStorage(bucket);
  const service = new SourceAssetService(storage, { save: async (row) => rows.push(row), listByProject: async () => rows });
  const asset = await service.store({ id: "asset-1", projectId: "project-1", kind: "reference_photo", originalName: "foto rosa.jpg", contentType: "image/jpeg", body: new TextEncoder().encode("image").buffer, now: "2026-08-05T12:00:00.000Z" });
  assert.equal(asset.storageKey, "projects/project-1/source/asset-1-foto-rosa.jpg");
  assert.equal(asset.sha256.length, 64);
  assert.equal(rows.length, 1);
  assert.equal(objects.size, 1);
});

test("source asset compensates R2 when metadata persistence fails", async () => {
  let deleted = false;
  const service = new SourceAssetService({ put: async (key) => ({ key, contentType: "image/jpeg", sizeBytes: 1, sha256: "x" }), get: async () => null, delete: async () => { deleted = true; } }, { save: async () => { throw new Error("D1 unavailable"); }, listByProject: async () => [] });
  await assert.rejects(() => service.store({ id: "asset-2", projectId: "project-1", kind: "reference_photo", originalName: "foto.jpg", contentType: "image/jpeg", body: new ArrayBuffer(1) }), /D1 unavailable/);
  assert.equal(deleted, true);
});
