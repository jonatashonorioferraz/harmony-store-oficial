import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const context=vm.createContext({Uint8Array,TextEncoder,TextDecoder,setTimeout});
const bars=[];
context.ZplCanvasFactory=(width,height)=>({width,height,getContext:()=>({
  fillRect(x,y,w,h){bars.push({x,y,w,h});},save(){},restore(){},translate(){},scale(){},fillText(){},
  measureText(text){return {width:text.length*10};},
  getImageData(){return {data:new Uint8Array(width*height*4).fill(255)};},
})});
for(const file of ['vendor/code128.js','zpl-drawing.js','engine.js']){
  vm.runInContext(await readFile(new URL('../shipping-labels/'+file,import.meta.url),'utf8'),context);
}
const encode=(text,mode)=>Array.from(context.ZplCode128(text,mode));
const width=widths=>widths.reduce((sum,n)=>sum+n,0);

test('automatic numeric Code 128 preserves leading zeros and an odd final digit with a valid checksum',()=>{
  // Start C, 00 01 23 45 67 89 01, Code B, "2", checksum 31, Stop.
  const expected=['211232','212222','222122','312131','113123','141122',
    '212141','222122','114131','223211','212321','2331112'].join('');
  assert.equal(encode('000123456789012','A').join(''),expected);
  assert.equal(width(encode('000123456789012','A')),134);
  assert.equal(width(encode('000123456789012')),200);
});

test('automatic short, even and odd numeric data never adds or drops digits',()=>{
  for(const [data,manual] of [
    ['0','>:0'],['00','>:00'],['001','>:001'],['0012','>;0012'],
    ['00123','>;0012>63'],['00012345678901','>;00012345678901'],
    ['000123456789012','>;00012345678901>62'],
  ])assert.deepEqual(encode(data,'A'),encode(manual),data);
});

test('explicit B/C and FNC1 behavior stays unchanged; unsupported automatic input fails closed',()=>{
  assert.deepEqual(encode('1234'),encode('>:1234'));
  assert.notDeepEqual(encode('1234','N'),encode('1234','A'));
  assert.deepEqual(encode('>;>8001234'),encode('>;>8001234','N'));
  for(const data of ['', '12A34', '>;1234', '>81234', '１２３４', '12\x1d34', '1234\n']){
    assert.throws(()=>encode(data,'A'),/numéricos/);
  }
  assert.throws(()=>encode('1234','D'),/Modo/);
});

const label=mode=>'^XA^PW800^LL1200^FO230,210^BY3,,0^BCN,160,N,N,N'+
  '^FD>:40000000001^FS^FO70,755^BY5,,0^BCN,140,N,N,N,'+mode+
  '^FD000123456789012^FS^FO30,1000^A0N,30,30^FDNF: 123^FS'+
  '^FO30,1090^A0N,30,30^FDCEP: 01234567^FS^XZ';

test('mixed Mercado Envios codes fit 100x150 geometry and keep shipment metadata distinct from routing',async()=>{
  bars.length=0;
  const [page]=await context.LocalZpl.parseZpl(label('A'));
  assert.equal(page.width,800);assert.equal(page.height,1200);
  assert.equal(page.metadata.shipmentId,'40000000001');assert.equal(page.metadata.invoiceNumber,'123');
  const routing=bars.filter(b=>b.y===755&&b.h===140);
  assert.equal(Math.max(...routing.map(b=>b.x+b.w)),740);
  await assert.rejects(context.LocalZpl.parseZpl(label('N')),/largura/);
});

test('unsupported BC variants and rotations remain blocked',async()=>{
  for(const command of ['^BCN,140,Y,N,N,A','^BCN,140,N,Y,N,A','^BCN,140,N,N,Y,A',
    '^BCN,140,N,N,N,D','^BCN,140,N,N,N,U','^BCR,140,N,N,N,A','^BCN,140,N,N,N,A,extra']){
    await assert.rejects(context.LocalZpl.parseZpl('^XA^FO70,755^BY5,,0'+command+'^FD12345678^FS^XZ'),/suportad/);
  }
});

test('a routing label without NF remains unpaired rather than inventing an invoice number',async()=>{
  const [page]=await context.LocalZpl.parseZpl(label('A').replace('^FDNF: 123^FS','^FDPeso: 1 kg^FS'));
  assert.equal(page.metadata.invoiceNumber,null);
  assert.equal(page.metadata.shipmentId,'40000000001');
});
