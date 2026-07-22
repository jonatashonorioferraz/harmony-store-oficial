import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function productionContext() {
  const code = await readFile(new URL("../web/production-receipts.js", import.meta.url), "utf8");
  const context = {
    window: {},
    document: { body: {}, querySelector: () => null, querySelectorAll: () => [] },
    MutationObserver: class { observe() {} },
    S: { profile: null },
    console, Date, Map, Set, Math, Number, String, Object, Intl,
  };
  vm.runInNewContext(code, context);
  return context.window.HarmonyProduction;
}

test("payment is proportional for every quantity", async () => {
  const api = await productionContext();
  assert.equal(api.paymentFor(1, 2.5), 0.025);
  assert.equal(api.paymentFor(75, 2.5), 1.875);
  assert.equal(api.paymentFor(100, 2.5), 2.5);
  assert.equal(api.paymentFor(150, 2.5), 3.75);
  assert.equal(api.paymentFor(327, 2.5), 8.175);
  assert.equal(api.paymentFor(1000, 2.5), 25);
});

test("conference difference compares declared and official quantities", async () => {
  const api = await productionContext();
  assert.equal(api.differenceFor({ declared_quantity: 500, quantity: 487 }), -13);
  assert.equal(api.differenceFor({ declared_quantity: 75, quantity: 80 }), 5);
  assert.equal(api.differenceFor({ declared_quantity: 100, quantity: 100 }), 0);
  assert.equal(api.paymentFor(487, 2.5), 12.175);
});

test("multiple products remain grouped in one receipt collection", async () => {
  const api = await productionContext();
  Object.assign(api.state, { receipts: [
    { id: "r1", collection_id: "c1", worker_id: "a", received_on: "2026-07-17", model_id: "m1", quantity: 100 },
    { id: "r2", collection_id: "c1", worker_id: "a", received_on: "2026-07-17", model_id: "m2", quantity: 50 },
    { id: "r3", collection_id: "c2", worker_id: "a", received_on: "2026-07-16", model_id: "m1", quantity: 25 },
  ] });
  const collections = api.groupedCollections();
  assert.equal(collections.length, 2);
  assert.equal(collections.find(item => item.id === "c1").items.length, 2);
});

test("each received collection starts collapsed and can be expanded without changing its data", async () => {
  const [api,source,css] = await Promise.all([
    productionContext(),
    readFile(new URL("../web/production-receipts.js", import.meta.url), "utf8"),
    readFile(new URL("../web/production-receipts.css", import.meta.url), "utf8"),
  ]);
  assert.ok(api.state.expandedCollections instanceof Set);
  assert.match(source, /collapsed=!PR\.expandedCollections\.has\(collection\.id\)/);
  assert.match(source, /data-toggle-collection/);
  assert.match(source, /aria-expanded/);
  assert.match(source, /Recolher lista/);
  assert.match(source, /Ver itens/);
  assert.match(css, /\.collection-card\.is-collapsed>\.table-wrap/);
  assert.match(css, /\.collection-card\.is-collapsed>footer/);
});

test("week always runs from Monday through Sunday", async () => {
  const api = await productionContext();
  assert.deepEqual({ ...api.weekBounds("2026-07-17") }, { start: "2026-07-13", end: "2026-07-19" });
  assert.deepEqual({ ...api.weekBounds("2026-07-19") }, { start: "2026-07-13", end: "2026-07-19" });
  assert.deepEqual({ ...api.weekBounds("2026-07-20") }, { start: "2026-07-20", end: "2026-07-26" });
});

test("report keeps model, color and collaborator separated", async () => {
  const api = await productionContext();
  Object.assign(api.state, { receipts: [
    { worker_id: "a", worker_name: "Ana", model_id: "m1", model_name: "Coração", color: "Rosa", declared_quantity: 110, quantity: 100, amount: 2.5 },
    { worker_id: "a", worker_name: "Ana", model_id: "m1", model_name: "Coração", color: "Rosa", declared_quantity: 50, quantity: 50, amount: 1.25 },
    { worker_id: "a", worker_name: "Ana", model_id: "m1", model_name: "Coração", color: "Azul", declared_quantity: 18, quantity: 20, amount: .5 },
    { worker_id: "b", worker_name: "Bia", model_id: "m1", model_name: "Coração", color: "Rosa", declared_quantity: 80, quantity: 80, amount: 2 },
  ] });
  const report = api.groupReport();
  assert.equal(report.length, 3);
  assert.equal(report.find(row => row.worker_id === "a" && row.color === "Rosa").quantity, 150);
  assert.equal(report.find(row => row.worker_id === "a" && row.color === "Rosa").declared_quantity, 160);
  assert.equal(report.find(row => row.worker_id === "a" && row.color === "Rosa").amount, 3.75);
  assert.equal(report.find(row => row.worker_id === "b").quantity, 80);
});

test("receipt values are admin-only while weekly payment values remain available", async () => {
  const source = await readFile(new URL("../web/production-receipts.js", import.meta.url), "utf8");
  assert.match(source, /const canSeeReceiptValues=\(\)=>isAdmin\(\)/);
  assert.match(source, /const canSeePaymentValues=\(\)=>role\(\)!=='receiver'/);
  assert.match(source, /PR\.tab==='weeks'\?canSeePaymentValues\(\):canSeeReceiptValues\(\)/);
});
