import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../financial-contracts-core.js',import.meta.url),'utf8');
const context=vm.createContext({Intl,Date,BigInt,Uint8Array});vm.runInContext(source,context);const C=context.HarmonyFinancialCore;
test('financial money keeps exact cents and rejects ambiguous values',()=>{
 assert.equal(C.inputMoney('100,01'),'100.01');assert.equal(C.cents('999999999999.99'),99999999999999n);
 assert.equal(C.totals([{amount:'0.10'},{amount:'0.20'}]),'0.30');
 for(const value of ['1.001','1e2','1,000.00','-1','0','Infinity','NaN'])assert.throws(()=>C.inputMoney(value));
 assert.equal(C.money('123456789012345.67'),'R$ 123.456.789.012.345,67');
});
test('monthly schedules retain their original anchor across leap February',()=>{
 const rows=C.monthly('2028-01-31',3,'80.10');assert.deepEqual(Array.from(rows,x=>x.due_date),['2028-01-31','2028-02-29','2028-03-31']);
 assert.equal(C.monthly('2027-01-30',3,'1')[2].due_date,'2027-03-30');
 for(const date of ['2027-02-29','2028-02-30','2028-13-01','2028-1-1'])assert.equal(C.validDate(date),false);
 assert.throws(()=>C.monthly('2200-12-31',2,'1'));assert.throws(()=>C.monthly('2028-01-01',601,'1'));
});
test('partial allocations never exceed selected balances',()=>{
 const result=C.allocations([{id:'a',remaining:'10.01'},{id:'b',remaining:'10.01'}],'15.02');
 assert.equal(result[0].amount,'10.01');assert.equal(result[1].amount,'5.01');assert.throws(()=>C.allocations([{id:'a',remaining:'10.01'}],'10.02'));
});
test('settled is determined by monetary balance, not an attachment or installment count',()=>{
 assert.equal(C.status({remaining_amount:'0',overdue_amount:'0'}),'settled');
 assert.equal(C.status({remaining_amount:'1.00',overdue_amount:'0.01'}),'overdue');
 assert.equal(C.status({remaining_amount:'1.00',overdue_amount:'0'}),'active');
});
test('HTML fields are escaped',()=>{assert.equal(C.esc('<img onerror="bad">'),'&lt;img onerror=&quot;bad&quot;&gt;')});
test('PDF is a real multipage document with correct byte offsets',()=>{
 const bytes=C.pdfBytes(Array.from({length:120},(_,i)=>'Parcela '+i+' | credito (teste) \\ R$ 100,00'));
 const text=Buffer.from(bytes).toString('latin1');assert.ok(text.startsWith('%PDF-1.4'));assert.match(text,/\/Count 3/);
 const offset=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(text.slice(offset,offset+4),'xref');
 const offsets=text.slice(offset).split('\n').slice(3).filter(x=>/^\d{10} 00000 n /.test(x));
 offsets.forEach((line,i)=>assert.ok(text.slice(Number(line.slice(0,10))).startsWith((i+1)+' 0 obj')));
});
test('central resources are mirrored and versioned without caching private originals',async()=>{
 for(const file of ['financial-contracts-core.js','financial-contracts.js','financial-contracts.css']){
  const source=await readFile(new URL('../'+file,import.meta.url),'utf8'),mirror=await readFile(new URL('../web/'+file,import.meta.url),'utf8');assert.equal(source,mirror);
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),sw=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');assert.ok(html.includes(file+'?v=1'));assert.ok(sw.includes(file+'?v=1'));
 }
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');assert.ok(app.includes("S.view==='financial-contracts'"));assert.ok(app.includes('window.HarmonyFinancialContracts'));
});
