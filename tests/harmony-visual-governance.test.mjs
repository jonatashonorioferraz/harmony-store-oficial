import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("visual governance defines six distinct commercial functions", async () => {
  const [plan, page, migration] = await Promise.all([read("src/harmony-studio/domain/orchestration/workflow-plan.ts"), read("app/page.tsx"), read("drizzle/0006_visual_direction_standards.sql")]);
  for (const shot of ["catalog-cover", "product-detail", "variations", "purchase-contents", "use-occasion", "product-size"]) assert.match(page + migration, new RegExp(shot));
  assert.match(plan, /visual-production-6/);
  assert.match(page, /Tamanho e medidas/);
});

test("uploads are optimized before the platform request limit", async () => {
  const [optimizer, productRoute, referenceRoute] = await Promise.all([read("app/image-upload.ts"), read("app/api/studio/start/route.ts"), read("app/api/admin/visual-references/route.ts")]);
  assert.match(optimizer, /PRODUCT_IMAGE_MAX_BYTES = 220_000/);
  assert.match(optimizer, /VISUAL_REFERENCE_MAX_BYTES = 780_000/);
  assert.match(productRoute, /totalBytes > 960_000/);
  assert.match(referenceRoute, /image\.size > 800_000/);
  assert.doesNotMatch(productRoute + referenceRoute, /10 MB/);
});

test("only approved analysis feeds a published visual manual into the photographer", async () => {
  const [repository, orchestrator, executor, standards] = await Promise.all([read("src/harmony-studio/infrastructure/persistence/d1-visual-reference-repository.ts"), read("src/harmony-studio/application/orchestration/workflow-orchestrator.ts"), read("src/harmony-studio/infrastructure/openai/openai-stage-executor.ts"), read("app/api/admin/visual-standards/route.ts")]);
  assert.match(repository, /analysis_status = 'approved'/);
  assert.match(orchestrator, /visualStandards\.findPublished/);
  assert.match(executor, /MANUAL VISUAL PUBLICADO PARA ESTA FUNÇÃO/);
  assert.match(standards, /references\.length < 3/);
  assert.match(standards, /status = 'published'/);
});

test("visual standard persistence uses the migrated column names", async () => {
  const [overview, route, migration] = await Promise.all([read("app/api/admin/overview/route.ts"), read("app/api/admin/visual-standards/route.ts"), read("drizzle/0007_visual_standard_archival.sql")]);
  assert.match(overview, /change_reason/);
  assert.doesNotMatch(overview, /source_reference_ids_json, reason/);
  assert.match(route, /source_reference_ids_json, change_reason/);
  assert.match(migration, /ADD COLUMN `archived_at`/);
});

test("the sixth image receives exact deterministic measurements and every image is reviewed", async () => {
  const [optimizer, executor, schemas] = await Promise.all([read("app/image-upload.ts"), read("src/harmony-studio/infrastructure/openai/openai-stage-executor.ts"), read("src/harmony-studio/infrastructure/openai/stage-output-schemas.ts")]);
  assert.match(optimizer, /addMeasurementOverlay/);
  assert.match(executor, /Não gere letras, números, setas ou medidas/);
  assert.match(schemas, /minItems: 6, maxItems: 6/);
  assert.match(schemas, /slot:/);
});

test("approved references can be moved or retired without losing audit history", async () => {
  const [route, page] = await Promise.all([read("app/api/admin/visual-references/route.ts"), read("app/admin/visual-standards/page.tsx")]);
  assert.match(route, /body\.action === "move"/);
  assert.match(route, /visual_reference\.\$\{body\.action\}/);
  assert.match(page, /Mover referência/);
  assert.match(page, /Retirar/);
  assert.match(route, /derivedManualsInvalidated/);
  assert.match(route, /instr\(source_reference_ids_json/);
});
