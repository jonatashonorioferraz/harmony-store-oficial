import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
const context=vm.createContext({crypto:webcrypto,Uint8Array,Uint8ClampedArray});
vm.runInContext(await readFile(new URL('../shipping-labels/shopee-id-fonts.js',import.meta.url),'utf8'),context);
vm.runInContext(await readFile(new URL('../shipping-labels/shopee.js',import.meta.url),'utf8'),context);
const api=context.LocalShopee;
const clone=x=>JSON.parse(JSON.stringify(x));
const label={index:0,source_key:'label:816x1218:'+'a'.repeat(64),shipment_ref:'BR123456789012A'};
const row=()=>({index:1,confirmed:true,reviewedId:'261016ABCDEFGH',selectedLabel:label,source_key:'label:816x1218:'+'b'.repeat(64),products:[{title:'Kit 100 sabonetes',variation:'Azul, lavanda',quantity:2,sku:'',listing_id:''}]});
test('Shopee checklist records one order and commercial quantity, not two pages or 200 pieces',()=>{
 const orders=clone(api.orders({orders:[row()],labels:[label]}));assert.equal(orders.length,1);assert.equal(orders[0].key,'shopee:261016ABCDEFGH');assert.equal(orders[0].products[0].quantity,2);assert.equal(orders[0].source_keys.length,2);
});
test('unconfirmed OCR never contributes product quantities',()=>{const o=row();o.confirmed=false;const orders=clone(api.orders({orders:[o],labels:[label]}));assert.equal(orders.length,1);assert.equal(orders[0].identified,false);assert.deepEqual(orders[0].products,[])});
test('one label cannot be manually attached to two checklists',()=>{assert.throws(()=>api.orders({orders:[row(),row()],labels:[label]}),/mais de um checklist/)});
test('duplicate copies of same order preserve quantities and collect source hashes',()=>{const a=row(),b=row();b.index=3;b.selectedLabel={...label,index:2,source_key:'label:816x1218:'+'c'.repeat(64)};const result=clone(api.orders({orders:[a,b],labels:[label,b.selectedLabel]}));assert.equal(result.length,1);assert.equal(result[0].products[0].quantity,2);assert.equal(result[0].source_keys.length,3)});
test('different products in duplicate order require resolution, never silent overwrite',()=>{const a=row(),b=row();b.selectedLabel={...label,index:2};b.products[0].quantity=3;assert.throws(()=>api.orders({orders:[a,b],labels:[label,b.selectedLabel]}),/produtos diferentes/)});
test('blank variation is preserved for personalized and single-variant listings',()=>{const o=row();o.products[0].variation='';assert.equal(api.orders({orders:[o],labels:[label]})[0].products[0].variation,'')});
test('order ID parser rejects truncated or extra characters instead of guessing',()=>{assert.equal(api.orderId('261016ABCDEFGH package 1'),'261016ABCDEFGH');assert.equal(api.orderId('261016ABCDE'),'');assert.equal(api.orderId('261016ABCDEFGHI'),'')});
test('bitmap rotation preserves every pixel and supports non-byte-aligned widths',()=>{const p={width:8,height:3,stride:1,raw:new Uint8Array([128,64,32])};const r=api.rotate(p);assert.equal(r.width,3);assert.equal(r.height,8);assert.deepEqual([...r.raw],[32,64,128,0,0,0,0,0])});
test('local OCR uses explicit local assets and no CDN/remote service path',async()=>{const source=await readFile(new URL('../shipping-labels/shopee.js',import.meta.url),'utf8');assert.doesNotMatch(source,/https?:|fetch\(|localStorage|sessionStorage/);assert.match(source,/workerPath:base/);assert.match(source,/langPath:base/);assert.match(source,/cacheMethod:'none'/)});
test('exact font reader independently recognizes both identity fields and rejects damaged glyphs',()=>{
 for(const kind of ['shipping','checklist']){
  const width=kind==='shipping'?816:1218,height=kind==='shipping'?1218:816,stride=Math.ceil(width/8),raw=new Uint8Array(stride*height),p={width,height,stride,raw};
  let x=kind==='shipping'?135:208;const y=kind==='shipping'?255:173;
  for(const char of '261016ABCDEFGH'){
   const g=context.ShopeeIdFonts[kind].find(g=>g.text===char);assert.ok(g);
   for(let j=0;j<g.height;j++)for(let i=0;i<g.width;i++)if(g.bits[j*g.width+i]==='1')raw[(y+j)*stride+((x+i)>>3)]|=128>>((x+i)%8);
   x+=g.width+1;
  }
  assert.equal(api.glyphId(p,kind),'261016ABCDEFGH');
  const left=kind==='shipping'?135:208;raw[y*stride+(left>>3)]^=128>>(left%8);
  assert.equal(api.glyphId(p,kind),'');
 }
});
test('automatic checklist registration ignores name confidence and requires matching quantity reads',async()=>{
 function page(kind){
  const width=kind==='shipping'?816:1218,height=kind==='shipping'?1218:816,stride=Math.ceil(width/8),raw=new Uint8Array(stride*height);
  const p={width,height,stride,raw},put=(x,y)=>{raw[y*stride+(x>>3)]|=128>>(x%8);};
  let x=kind==='shipping'?135:208;const y=kind==='shipping'?255:173;
  for(const char of '261016ABCDEFGH'){const g=context.ShopeeIdFonts[kind].find(g=>g.text===char);for(let j=0;j<g.height;j++)for(let i=0;i<g.width;i++)if(g.bits[j*g.width+i]==='1')put(x+i,y+j);x+=g.width+1;}
  if(kind==='checklist'){for(const y of [265,340])for(let x=0;x<width;x++)put(x,y);for(const x of [75,560,949,1007])for(let y=265;y<=340;y++)put(x,y);}
  return p;
 }
 const shipping=page('shipping'),checklist=api.rotate(api.rotate(api.rotate(page('checklist'))));
 for(const second of ['2','3']){
  let texts=0;
  const result=await api.read([shipping,checklist],{qr:()=>({data:'BR123456789012A'}),recognize:async(_image,kind)=>({text:kind==='quantity'?'2':kind==='quantity-check'?second:['Checklist de carregamento','Kit sabonetes','Azul lavanda'][texts++],confidence:20})});
  assert.equal(result.orders.length,1);
  assert.equal(result.orders[0].confirmed,second==='2');
  assert.equal(result.orders[0].products[0].quantity,2);
 }
});
