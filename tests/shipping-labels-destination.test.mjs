import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const sources=await Promise.all(['invoices.js','recovery.js'].map(f=>readFile(new URL('../shipping-labels/'+f,import.meta.url),'utf8')));
const prefix='3526100000000000010055001000000123112345678';
let sum=0,weight=2;for(let i=42;i>=0;i--){sum+=Number(prefix[i])*weight;weight=weight===9?2:weight+1;}
const key=prefix+(sum%11<2?0:11-sum%11);
const item=(str,x,y)=>({str,width:str.length*5,transform:[1,0,0,1,x,y]});
function fields(delivery='98765-432',sheet=1,total=1){
 const values=[item(key,10,700),item(`${sheet} de ${total}`,200,660),item('DESTINATÁRIO / REMETENTE',10,600),item('CEP',400,580),item('01234-567',400,567),item('FATURA / DUPLICATA',10,550),item('TRANSPORTADOR / VOLUMES TRANSPORTADOS',10,520),item('CEP',400,500),item('11111-111',400,487),item('INFORMAÇÕES DO LOCAL DE ENTREGA / RETIRADA',10,300),item('CEP',400,280),item('DADOS DO PRODUTO / SERVIÇOS',10,230),item('CEP',400,210),item('22222-222',400,197)];
 if(delivery!==null)values.push(item(delivery,400,267));return values;
}
function env(pages=[fields()]){
 const c=vm.createContext({Uint8Array,atob,PDFLib:{},LocalPicking:{extract:()=>[{description:'Teste',quantity:'1',unit:'UN',code:'TEST'}]},LocalPdfJs:{getDocument:()=>({promise:Promise.resolve({numPages:pages.length,getPage:async n=>({getTextContent:async()=>({items:pages[n-1]}),getOperatorList:async()=>({}),cleanup(){}}),async destroy(){}})})}});
 for(const source of sources)vm.runInContext(source,c);return c;
}
const file={name:'synthetic.pdf',size:1,arrayBuffer:async()=>new Uint8Array([1]).buffer};
const label=postcode=>({metadata:{invoiceNumber:'123',shipmentId:'10000000123',postcode}});

test('explicit delivery CEP takes priority, preserving recipient CEP and excluding carrier/other sections',()=>{
 const api=env().LocalInvoices,info=api.pageInfo(fields());
 assert.equal(info.recipientPostcode,'01234567');assert.equal(info.deliveryPostcode,'98765432');assert.equal(info.postcode,'98765432');assert.equal(info.postcodeSource,'delivery');
 const note={...info,pages:[{...info,sheet:1}]};
 assert.equal(api.pair([label('98765432')],[note]).length,1);
 assert.throws(()=>api.pair([label('01234567')],[note]),e=>e.issues.some(s=>s.includes('diferente')));
 const missing=label('98765432');missing.metadata.invoiceNumber=null;missing.metadata.invoiceNumbers=[];
 assert.equal(api.missingInvoiceOptions([missing],[note],0).length,1);
});

test('empty or absent delivery section falls back to recipient; pickup is not a delivery address',()=>{
 const api=env().LocalInvoices;
 for(const items of [[...fields(null),item('FONE/FAX',400,260)],fields().filter(i=>i.transform[5]>300),fields().map(i=>i.str.startsWith('INFORMAÇÕES')?{...i,str:'INFORMAÇÕES DO LOCAL DE RETIRADA'}:i)]){
  const info=api.pageInfo(items);assert.equal(info.postcode,'01234567');assert.equal(info.deliveryPostcode,null);assert.equal(info.postcodeSource,'recipient');
 }
});

test('malformed or ambiguous delivery CEP cannot silently fall back to the recipient',()=>{
 const api=env().LocalInvoices;
 assert.throws(()=>api.pageInfo(fields('98765-43')),/local de entrega ilegível/);
 assert.throws(()=>api.pageInfo([...fields(),item('CEP',300,280),item('33333-333',300,267)]),/Mais de um CEP do local de entrega/);
});

test('both readers use delivery CEP across multiple sheets even when only the first sheet supplies it',async()=>{
 for(const reader of ['LocalInvoices','LocalBatchRecovery']){
  const c=env([fields('98765-432',1,2),fields(null,2,2)]),result=await c[reader].readInvoices([file]);
  assert.equal(result.invoices.length,1);assert.equal(result.invoices[0].postcode,'98765432');assert.equal(result.invoices[0].recipientPostcode,'01234567');assert.equal(result.invoices[0].pages.length,2);
  assert.equal(c.LocalInvoices.pair([label('98765432')],result.invoices).length,1);
 }
});

test('conflicting delivery addresses on continuation sheets remain blocked',async()=>{
 const pages=[fields('98765-432',1,2),fields('33333-333',2,2)];
 await assert.rejects(env(pages).LocalInvoices.readInvoices([file]),/CEPs.*divergentes/);
 const result=await env(pages).LocalBatchRecovery.readInvoices([file]);
 assert.equal(result.invoices.length,0);assert.equal(result.problems[0].code,'postcode');assert.match(result.problems[0].message,/CEPs.*divergentes/);
});
