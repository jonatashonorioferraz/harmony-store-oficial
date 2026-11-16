import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const window={};
vm.runInNewContext(await readFile(new URL('../production-cost.js',import.meta.url),'utf8'),{window});
const {initial,calculate}=window.HarmonyProductionCost;
test('150 hearts use 3/8 of the recipe, proportional labor and two whole packages',()=>{
  const c=initial();
  [32,25,12].forEach((price,i)=>c.supplies[i].price=price);
  const r=calculate(c,c.recipes[0],150,100);
  assert.deepEqual(Array.from(r.lines,l=>l.amount),[375,7.5,3.75]);
  assert.equal(r.labor,3.75);
  assert.equal(r.bags,2);
  assert.equal(r.packaging,.2);
  assert.equal(r.total.toFixed(3),'18.275');
  assert.equal(calculate(c,c.recipes[0],150,50).bags,3);
});
test('missing prices do not silently reduce the estimate; zero price is supported',()=>{
  const c=initial();
  assert.equal(calculate(c,c.recipes[0],400,100).total,null);
  c.supplies.forEach(s=>s.price=0);
  assert.equal(calculate(c,c.recipes[0],400,100).total,10.4);
  assert.throws(()=>calculate(c,c.recipes[0],1.5,100));
  assert.throws(()=>calculate(c,c.recipes[0],100,0));
});
