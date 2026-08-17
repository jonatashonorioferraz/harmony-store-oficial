import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('perfil Gerente de e-commerce usa papel colaborador e permissão adicional', () => {
  const app = read('app.js');
  assert.match(app, /value="ecommerce_manager"/);
  assert.ok(app.includes("role:isEcommerceManager?'collaborator':accessProfile"));
  assert.match(app, /is_ecommerce_manager:isEcommerceManager/);
  assert.doesNotMatch(app, /function ecommerceManagerField/);
  assert.match(app, /Gerente de e-commerce/);
  assert.equal(app, read('web/app.js'));
});

test('Gerente acessa somente os módulos extras definidos', () => {
  const inventory = read('production-inventory.js');
  const health = read('system-health.js');
  const help = read('help-center.js');
  assert.ok(inventory.includes('Boolean(S?.profile?.is_ecommerce_manager)'));
  assert.ok(health.includes('S?.profile?.is_ecommerce_manager'));
  assert.ok(health.includes('profile||null'));
  assert.match(help, /transfer-center','production-inventory','health/);
  assert.equal(inventory, read('web/production-inventory.js'));
  assert.equal(health, read('web/system-health.js'));
  assert.equal(help, read('web/help-center.js'));
});

test('backend e banco validam a permissão sem promover a ADM', () => {
  const edge = read('supabase/functions/system-health/index.ts');
  const migration = read('supabase/migrations/20260817123000_ecommerce_manager_production_inventory_access.sql');
  assert.ok(edge.includes('role,status,is_ecommerce_manager'));
  assert.ok(edge.includes('caller.role !== \"admin\" && caller.is_ecommerce_manager !== true'));
  assert.ok(migration.includes('coalesce(p.is_ecommerce_manager,false)'));
  assert.ok(migration.includes("p.role in ('admin','receiver')"));
  assert.ok(migration.includes("p.status='active'"));
});
