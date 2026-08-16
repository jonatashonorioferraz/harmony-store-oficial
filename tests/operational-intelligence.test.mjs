import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function context() {
  const code = await readFile(new URL("../web/intelligence.js", import.meta.url), "utf8");
  const sandbox = {
    window: {},
    document: { body: {}, querySelector: () => null, querySelectorAll: () => [] },
    MutationObserver: class { observe() {} },
    S: { profile: null, requests: [], products: [], team: [] },
    console, Date, Map, Set, Math, Number, String, Object, Intl,
  };
  vm.runInNewContext(code, sandbox);
  return sandbox;
}

test("planned versus received groups worker, model and normalized color", async () => {
  const sandbox = await context();
  const api = sandbox.window.HarmonyIntelligence;
  Object.assign(api.state, {
    productionOrders: [
      { id: "o1", status: "sent", worker_id: "w1", worker_name: "Ana", model_id: "m1", model_name: "Coração", color_name: "Rosa BB", quantity: 100, due_date: "2026-08-10" },
      { id: "o2", status: "acknowledged", worker_id: "w1", worker_name: "Ana", model_id: "m2", model_name: "Estrela", color_name: "Azul", quantity: 80, due_date: "2026-08-10" },
      { id: "draft", status: "draft", worker_id: "w1", worker_name: "Ana", model_id: "m1", model_name: "Coração", color_name: "Rosa BB", quantity: 999, due_date: "2026-08-10" },
    ],
    productionReceipts: [
      { id: "r1", collection_id: "c1", worker_id: "w1", worker_name: "Ana", model_id: "m1", model_name: "Coração", color: "rosa bb", quantity: 60 },
      { id: "r2", collection_id: "c2", worker_id: "w1", worker_name: "Ana", model_id: "m1", model_name: "Coração", color: "RÓSA BB", quantity: 40 },
      { id: "r3", collection_id: "c3", worker_id: "w1", worker_name: "Ana", model_id: "m2", model_name: "Estrela", color: "Azul", quantity: 30 },
    ],
  });
  const report = api.productionPlanReport();
  const heart = report.find(item => item.modelId === "m1");
  const star = report.find(item => item.modelId === "m2");
  assert.equal(heart.planned, 100);
  assert.equal(heart.received, 100);
  assert.equal(heart.status, "complete");
  assert.equal(star.balance, 50);
  assert.equal(star.status, "partial");
});

test("production comparison never changes payment or inventory data", async () => {
  const code = await readFile(new URL("../web/intelligence.js", import.meta.url), "utf8");
  const comparison = code.slice(code.indexOf("function productionPlanReport"), code.indexOf("function dataQualityReport"));
  assert.doesNotMatch(comparison, /physical_stock|reserved_stock|rate_per_100|amount|rest\(|rpc\(/);
  assert.match(code, /Não interfere no pagamento/);
  assert.match(code, /o estoque só muda após aprovação e recebimento do ADM/);
});

test("data quality finds missing photos, suppliers, contacts, colors and divergences", async () => {
  const sandbox = await context();
  const api = sandbox.window.HarmonyIntelligence;
  sandbox.S.products = [
    { id: "p1", active: true, usage_scope: "production", image_path: null },
    { id: "p2", active: true, usage_scope: "ecommerce", image_path: "products/p2.webp" },
    { id: "internal", active: true, usage_scope: "internal", image_path: null },
  ];
  Object.assign(api.state, {
    supplierProducts: [{ product_id: "p2", supplier_id: "s1" }],
    suppliers: [{ id: "s1", active: true, phone: null, email: null, website: null }],
    productionColors: [{ name: "Rosa BB", active: true }],
    productionReceipts: [
      { color: "Rosa BB", quantity_difference: 0 },
      { color: "Cor antiga", quantity_difference: -3 },
    ],
  });
  const issues = Object.fromEntries(api.dataQualityReport().map(item => [item.kind, item.count]));
  assert.equal(issues.photos, 1);
  assert.equal(issues.suppliers, 1);
  assert.equal(issues.contacts, 1);
  assert.equal(issues.colors, 1);
  assert.equal(issues.differences, 1);
});

test("operational intelligence stays inside the existing admin intelligence area", async () => {
  const [root, web, css, webCss] = await Promise.all([
    readFile(new URL("../intelligence.js", import.meta.url), "utf8"),
    readFile(new URL("../web/intelligence.js", import.meta.url), "utf8"),
    readFile(new URL("../styles.css", import.meta.url), "utf8"),
    readFile(new URL("../web/styles.css", import.meta.url), "utf8"),
  ]);
  assert.equal(root, web);
  assert.equal(css, webCss);
  assert.match(root, /PLANEJADO × RECEBIDO/);
  assert.match(root, /QUALIDADE DOS DADOS/);
  assert.doesNotMatch(root, /data-view="operational-intelligence"/);
  assert.match(css, /\.production-plan-summary/);
  assert.match(css, /\.data-quality-grid/);
});
