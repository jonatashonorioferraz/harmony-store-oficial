import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
const source=await readFile(new URL('../shipping-labels/history.js',import.meta.url),'utf8');
function environment(){const c=vm.createContext({crypto:webcrypto,Uint8Array,LocalInvoices:{labelIdentity:l=>l.metadata||{}}});vm.runInContext(source,c);return c.LocalConversionHistory;}
const label=n=>({raw:new Uint8Array([n]),width:8,height:1,metadata:{shipmentId:String(10000000000+n),saleId:String(2000000000000000n+BigInt(n)),postcode:'12345678'}});
const product={itemId:'MLB123',title:'Kit 100 sabonetes',quantity:2,variation:null,sku:'X',source:'private.xlsx',buyer:'Customer'};
test('summary sends only selected matched Excel products and no buyer, ZIP, invoice or address fields',async()=>{
 const a=environment();const input={channel:'mercado-livre',batch:[label(1)],rows:[{labelIndex:0,order:{id:'one'},shipmentId:'10000000001'}],read:{sales:{groups:[{id:'one',shipmentId:'10000000001',products:[product]},{id:'outside',shipmentId:'99999999999',products:[{...product,quantity:95}]}]}},pages:2,total:50};
 const result=JSON.parse(JSON.stringify(await a.summary(input)));
 assert.equal(result.included,1);assert.equal(result.total,50);assert.equal(result.orders.length,1);assert.equal(result.orders[0].products[0].quantity,2);assert.equal(result.orders[0].products[0].variation,'');assert.equal(result.orders[0].products[0].listing_id,'MLB123');
 assert.doesNotMatch(JSON.stringify(result),/Customer|private.xlsx|postcode|12345678|outside|99999999999/);
});
test('reprints have stable identity across PDF settings and file names, but new request IDs',async()=>{
 const a=environment(),input={channel:'mercado-livre',batch:[label(1)],pages:1,total:1};const first=await a.summary(input),second=await a.summary({...input,pages:2});assert.equal(first.orders[0].key,second.orders[0].key);assert.notEqual(first.request_id,second.request_id);
});
test('image labels count separately and repeated copies within one PDF have one identity',async()=>{
 const a=environment(),result=await a.summary({channel:'shopee',batch:[label(1),label(1)],pages:2,total:2});assert.equal(result.included,2);assert.equal(result.orders.length,1);assert.equal(result.orders[0].identified,false);assert.equal(result.orders[0].shipment_ref,'');assert.match(result.orders[0].key,/^label:8x1:[a-f0-9]{64}$/);assert.equal(result.orders[0].products.length,0);
});
