import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ExcellenceLibraryService } from "../src/harmony-studio/application/excellence/excellence-library-service.ts";

function fixture({ candidateStatus = "approved", decision = "approved" } = {}) {
  const rows = [];
  const events = [];
  const library = {
    async save(item) { const index = rows.findIndex((row) => row.id === item.id); if (index >= 0) rows[index] = item; else rows.push(item); },
    async findById(id) { return rows.find((row) => row.id === id) ?? null; },
    async findByCandidateId(id) { return rows.find((row) => row.candidateId === id) ?? null; },
    async searchActive(filters) { return rows.filter((row) => row.status === "active" && (!filters.artifactType || row.artifactType === filters.artifactType)); },
  };
  const sources = {
    async findCandidate(id) { return { id, projectId: "project-1", artifactType: "title", status: candidateStatus }; },
    async findLatestApproval(id) { return { id: "review-1", candidateId: id, decision, reviewerRole: "quality-director", reasons: ["Fiel e claro"] }; },
  };
  const audit = { async append(event) { events.push(event); }, async listByProject() { return events; } };
  return { service: new ExcellenceLibraryService(library, sources, audit), rows, events };
}

const input = { id: "excellent-1", candidateId: "candidate-1", marketplace: "Shopee", productCategory: "mini-sabonetes", agentRole: "copywriter", context: { quantity: 100 }, decisions: ["Título objetivo", "Sem promessas inventadas"], approvalReason: "Alta fidelidade ao produto", tags: [" Rosas ", "rosas", "lembrancinha"], actorId: "owner-1", auditId: "audit-1", now: "2026-08-05T15:00:00.000Z" };

test("only formally approved material enters the Excellence Library", async () => {
  const { service, rows, events } = fixture();
  const item = await service.curate(input);
  assert.equal(item.status, "active");
  assert.deepEqual(item.tags, ["rosas", "lembrancinha"]);
  assert.equal(rows.length, 1);
  assert.equal(events[0].eventType, "excellence.item_curated");
});

test("candidate without final approval is rejected", async () => {
  const { service } = fixture({ candidateStatus: "pending_review" });
  await assert.rejects(() => service.curate(input), /Only an approved candidate/);
});

test("review decision must be approved", async () => {
  const { service } = fixture({ decision: "changes_requested" });
  await assert.rejects(() => service.curate(input), /approved review decision/);
});

test("same candidate cannot be curated twice", async () => {
  const { service } = fixture();
  await service.curate(input);
  await assert.rejects(() => service.curate({ ...input, id: "excellent-2", auditId: "audit-2" }), /already in/);
});

test("retirement preserves the record and removes it from active search", async () => {
  const { service, rows, events } = fixture();
  await service.curate(input);
  const retired = await service.retire({ id: "excellent-1", actorId: "owner-1", auditId: "audit-2", now: "2026-08-05T16:00:00.000Z" });
  assert.equal(retired.status, "retired");
  assert.equal(rows.length, 1);
  assert.deepEqual(await service.search({ artifactType: "title" }), []);
  assert.equal(events.at(-1).eventType, "excellence.item_retired");
});

test("migration adds the curated library with provenance and search indexes", async () => {
  const sql = await readFile(new URL("../drizzle/0001_many_king_cobra.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE `studio_excellence_items`/);
  assert.match(sql, /`candidate_id` text NOT NULL/);
  assert.match(sql, /`review_decision_id` text NOT NULL/);
  assert.match(sql, /studio_excellence_candidate_unique/);
  assert.match(sql, /studio_excellence_type_marketplace_idx/);
});
