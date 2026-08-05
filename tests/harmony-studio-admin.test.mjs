import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("admin configuration is immutable, versioned and indexed", async () => {
  const migration = await read("drizzle/0003_studio_admin.sql");
  assert.match(migration, /studio_configuration_versions/);
  assert.match(migration, /UNIQUE INDEX `studio_configuration_key_version_unique`/);
  assert.match(migration, /studio_configuration_key_status_idx/);
});

test("admin APIs enforce server-side email allowlist", async () => {
  const shared = await read("app/api/admin/shared.ts");
  assert.match(shared, /STUDIO_ADMIN_EMAILS/);
  assert.match(shared, /getChatGPTUser/);
  assert.match(shared, /ADMIN_REQUIRED/);
});

test("knowledge publishing and global settings append audit events", async () => {
  const knowledge = await read("app/api/admin/knowledge/route.ts");
  const settings = await read("app/api/admin/settings/route.ts");
  assert.match(knowledge, /knowledge\.version_published/);
  assert.match(settings, /configuration\.version_published/);
  assert.match(knowledge, /IntelligenceCenter/);
});

test("the main studio exposes the protected administration panel", async () => {
  const page = await read("app/page.tsx");
  const admin = await read("app/admin/page.tsx");
  assert.match(page, /href="\/admin"/);
  assert.match(admin, /Centro de/);
  assert.match(admin, /Biblioteca de Excelência/);
  assert.match(admin, /Histórico de alterações/);
});

test("published global parameters drive new workflows and budget enforcement", async () => {
  const workflow = await read("src/harmony-studio/application/workflows/start-studio-workflow.ts");
  const budget = await read("src/harmony-studio/infrastructure/persistence/d1-usage-budget.ts");
  assert.match(workflow, /marketplaceTitleLimit/);
  assert.match(workflow, /minimumQualityScore/);
  assert.match(workflow, /brandName/);
  assert.match(budget, /maxProjectBudgetUsd/);
});

test("new advertisements start product-neutral and restore drafts only by choice", async () => {
  const page = await read("app/page.tsx");
  assert.doesNotMatch(page, /Mini Sabonetes Rosinhas/);
  assert.doesNotMatch(page, /Rosinhas Perfumadas/);
  assert.match(page, /Nome do produto \*/);
  assert.match(page, /Principais características \*/);
  assert.match(page, /Retomar trabalho/);
  assert.match(page, /Ele não será aberto automaticamente/);
  assert.match(page, /productPayload/);
});

test("category palettes are durable, versioned and selectable in new ads", async () => {
  const migration = await read("drizzle/0004_category_palettes.sql");
  const admin = await read("app/api/admin/palettes/route.ts");
  const selector = await read("app/api/studio/palettes/route.ts");
  const page = await read("app/page.tsx");
  assert.match(migration, /studio_category_palette_versions/);
  assert.match(migration, /category_name_version_unique/);
  assert.match(admin, /palette\.version_published/);
  assert.match(admin, /requireStudioAdmin/);
  assert.match(selector, /status = 'active'/);
  assert.match(page, /choosePalette/);
  assert.match(page, /Paleta salva para/);
});

test("opening administration bootstraps the eight official agent versions", async () => {
  const overview = await read("app/api/admin/overview/route.ts");
  assert.match(overview, /ensureDefaultAgentKnowledge/);
  assert.match(overview, /D1AgentKnowledgeRepository/);
});
