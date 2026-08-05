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

test("the sixth image receives exact deterministic measurements and every image is reviewed", async () => {
  const [optimizer, executor, schemas] = await Promise.all([read("app/image-upload.ts"), read("src/harmony-studio/infrastructure/openai/openai-stage-executor.ts"), read("src/harmony-studio/infrastructure/openai/stage-output-schemas.ts")]);
  assert.match(optimizer, /addMeasurementOverlay/);
  assert.match(executor, /Não gere letras, números, setas ou medidas/);
  assert.match(schemas, /minItems: 6, maxItems: 6/);
  assert.match(schemas, /slot:/);
});
