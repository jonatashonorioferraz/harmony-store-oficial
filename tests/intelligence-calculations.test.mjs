import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function intelligenceContext(overrides = {}) {
  const code = await readFile(new URL("../web/intelligence.js", import.meta.url), "utf8");
  const context = {
    window: {},
    document: { body: {}, querySelector: () => null, querySelectorAll: () => [] },
    MutationObserver: class { observe() {} },
    S: { profile: null, requests: [], products: [], team: [] },
    console,
    Date,
    Map,
    Set,
    Math,
    Number,
    String,
    Object,
    Intl,
    ...overrides,
  };
  vm.runInNewContext(code, context);
  return context;
}

test("material report uses delivered quantity and excludes cancelled requests", async () => {
  const context = await intelligenceContext();
  const product = { id: "p1", name: "Base", unit: "quilo", physical_stock: 2, reserved_stock: 0, minimum_stock: 1, safety_stock: 6, lead_time_days: 30, unit_cost: 2 };
  const person = { id: "u1", role: "collaborator", full_name: "Artesã" };
  Object.assign(context.S, {
    products: [product],
    team: [person],
    requests: [
      { id: "r1", requested_by: "u1", status: "delivered", created_at: "2026-07-10T12:00:00Z" },
      { id: "r2", requested_by: "u1", status: "cancelled", created_at: "2026-07-11T12:00:00Z" },
    ],
  });
  const api = context.window.HarmonyIntelligence;
  Object.assign(api.state, {
    from: "2026-07-01",
    to: "2026-07-30",
    items: [
      { request_id: "r1", product_id: "p1", requested_quantity: 10, approved_quantity: 8, removed_by_admin: false },
      { request_id: "r2", product_id: "p1", requested_quantity: 100, approved_quantity: 100, removed_by_admin: false },
    ],
    supplierProducts: [],
    orders: [],
    orderItems: [],
  });
  const [report] = api.materialReport();
  assert.equal(report.requested, 10);
  assert.equal(report.delivered, 8);
  assert.equal(report.monthly, 8);
  assert.equal(report.suggested, 12);
  assert.equal(report.estimatedCost, 24);
});

test("collaborator report keeps each collaborator isolated", async () => {
  const context = await intelligenceContext();
  const product = { id: "p1", name: "Essência", unit: "garrafa", physical_stock: 10, reserved_stock: 0, minimum_stock: 2 };
  const people = [
    { id: "u1", role: "collaborator", full_name: "Ana" },
    { id: "u2", role: "collaborator", full_name: "Bia" },
  ];
  Object.assign(context.S, {
    products: [product],
    team: people,
    requests: [
      { id: "r1", requested_by: "u1", status: "delivered", created_at: "2026-07-10T12:00:00Z" },
      { id: "r2", requested_by: "u2", status: "pending", created_at: "2026-07-12T12:00:00Z" },
    ],
  });
  const api = context.window.HarmonyIntelligence;
  Object.assign(api.state, {
    from: "2026-07-01",
    to: "2026-07-30",
    items: [
      { request_id: "r1", product_id: "p1", requested_quantity: 3, approved_quantity: 2, removed_by_admin: false },
      { request_id: "r2", product_id: "p1", requested_quantity: 5, approved_quantity: null, removed_by_admin: false },
    ],
  });
  const report = api.collaboratorReport();
  assert.equal(report.find(item => item.person.id === "u1").deliveryCount, 1);
  assert.equal(report.find(item => item.person.id === "u2").deliveryCount, 0);
  assert.match(report.find(item => item.person.id === "u1").topProduct, /2 garrafa/);
});

test("supplier links are shared by supplier and product flows", async () => {
  const context = await intelligenceContext();
  const api = context.window.HarmonyIntelligence;
  Object.assign(api.state, { supplierProducts: [
    { id: "sp1", supplier_id: "s1", product_id: "p1", is_preferred: true },
    { id: "sp2", supplier_id: "s1", product_id: "p2", is_preferred: false },
    { id: "sp3", supplier_id: "s2", product_id: "p3", is_preferred: true },
  ] });
  assert.deepEqual(api.linksForSupplier("s1").map(link => link.product_id), ["p1", "p2"]);
  assert.deepEqual(api.linksForSupplier("s2").map(link => link.product_id), ["p3"]);
});

test("product form uses the intelligence supplier integration", async () => {
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");
  assert.match(app, /Fornecedor principal/);
  assert.match(app, /productSupplyContext/);
  assert.match(app, /savePreferredSupplier/);
  assert.match(app, /Cadastro compartilhado com Inteligência e Compras/);
});

test("preferred supplier loads and saves through the shared relationship", async () => {
  const calls = [];
  const rest = async (path, options = {}) => {
    calls.push({ path, options });
    if (path.startsWith("suppliers?")) return [
      { id: "s1", name: "Ativo", active: true },
      { id: "s2", name: "Inativo vinculado", active: false },
    ];
    if (path.includes("order=is_preferred")) return [
      { id: "sp2", supplier_id: "s2", product_id: "p1", is_preferred: true },
    ];
    if (path.includes("select=*") && path.startsWith("supplier_products?")) return [
      { id: "sp2", supplier_id: "s2", product_id: "p1", is_preferred: true },
    ];
    return [];
  };
  const context = await intelligenceContext({ rest, encodeURIComponent });
  const api = context.window.HarmonyIntelligence;
  const supply = await api.productSupplyContext("p1");
  assert.equal(supply.selectedSupplierId, "s2");
  assert.equal(supply.suppliers.length, 2, "the inactive current supplier remains editable");
  await api.savePreferredSupplier("p1", "s1");
  assert.ok(calls.some(call => call.options.method === "PATCH" && call.options.body.includes('"is_preferred":false')));
  assert.ok(calls.some(call => call.options.method === "POST" && call.options.body.includes('"supplier_id":"s1"')));
  assert.equal(api.state.loaded, false);
});
