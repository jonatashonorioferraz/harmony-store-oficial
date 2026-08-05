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
