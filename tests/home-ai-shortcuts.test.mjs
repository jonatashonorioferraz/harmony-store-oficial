import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [inventory, css, supplies, bills] = await Promise.all([
  readFile(new URL('../production-inventory.js', import.meta.url), 'utf8'),
  readFile(new URL('../production-inventory.css', import.meta.url), 'utf8'),
  readFile(new URL('../internal-supplies.js', import.meta.url), 'utf8'),
  readFile(new URL('../bills.js', import.meta.url), 'utf8'),
]);

test('home keeps inventory and adds two clearly identified AI shortcuts for admins', () => {
  assert.match(inventory, /harmonyQuickActions/);
  assert.match(inventory, /Inventário de Produção/);
  assert.match(inventory, /Registrar compra direta com IA/);
  assert.match(inventory, /Cadastrar boleto com IA/);
  assert.match(inventory, /S\.profile\?\.role==='admin'/);
  assert.match(inventory, /HarmonyInternalSupplies\?\.openDirectPurchase/);
  assert.match(inventory, /HarmonyBills\?\.openNew/);
});

test('quick actions reuse the protected module entry points', () => {
  assert.match(supplies, /async function openDirectPurchase\(\)\{if\(!isAdmin\(\)\)return/);
  assert.match(bills, /async function openNew\(\)\{if\(!isAdmin\(\)\)return/);
});

test('quick action group is polished, responsive and motion-safe', () => {
  assert.match(css, /\.harmony-home-quick-actions/);
  assert.match(css, /\.harmony-ai-home-shortcut/);
  assert.match(css, /@media\(max-width:1080px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
