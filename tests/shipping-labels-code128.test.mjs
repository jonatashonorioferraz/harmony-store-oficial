import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const context=vm.createContext({Uint8Array,TextEncoder,TextDecoder,setTimeout});
const bars=[],texts=[];
context.ZplCanvasFactory=(width,height)=>({width,height,getContext:()=>({
  fillRect(x,y,w,h){bars.push({x,y,w,h});},save(){},restore(){},translate(){},scale(){},fillText(text){texts.push(text);},
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
  for(const command of ['^BCN,140,Y,N,N,N','^BCN,140,X,N,N,A','^BCN,140,N,Y,N,A','^BCN,140,N,N,Y,A',
    '^BCN,140,N,N,N,D','^BCN,140,N,N,N,U','^BCR,140,N,N,N,A','^BCN,140,N,N,N,A,extra']){
    await assert.rejects(context.LocalZpl.parseZpl('^XA^FO70,755^BY5,,0'+command+'^FD12345678^FS^XZ'),/suportad/);
  }
});

test('automatic Code 128 prints the exact numeric interpretation without changing the bars',async()=>{
  const data='0001234567890';
  const zpl=show=>'^XA^PW800^LL1200^FO170,775^BY4,,0^BCN,135,'+show+',N,N,A^FD'+data+'^FS^XZ';
  bars.length=0;texts.length=0;
  await context.LocalZpl.parseZpl(zpl('N'));
  const originalBars=bars.filter(b=>b.y===775&&b.h===135);
  bars.length=0;
  const [page]=await context.LocalZpl.parseZpl(zpl('Y'));
  assert.deepEqual(bars.filter(b=>b.y===775&&b.h===135),originalBars);
  assert.deepEqual(texts,[data]);
  assert.equal(page.width,800);assert.equal(page.height,1200);
  texts.length=0;
  await context.LocalZpl.parseZpl(zpl(''));
  assert.deepEqual(texts,[data],'An omitted interpretation flag defaults to Y');
});

test('Code 128 interpretation participates in page bounds and rejects unverified payloads',async()=>{
  const zpl='^XA^PW800^LL1200^FO170,1060^BY4,,0^BCN,135,Y,N,N,A^FD0001234567890^FS^XZ';
  await assert.rejects(context.LocalZpl.parseZpl(zpl),/altura/);
  await context.LocalZpl.parseZpl(zpl.replace(',Y,N,N,A',',N,N,N,A'));
  await assert.rejects(context.LocalZpl.parseZpl(zpl.replace('0001234567890','>;001234')),/numéricos/);
  await assert.rejects(context.LocalZpl.parseZpl(zpl.replace('^FO170,1060','^FO0,0^A0N,10,400').replace('0001234567890','1')),/borda/);
});

test('a routing label without NF remains unpaired rather than inventing an invoice number',async()=>{
  const [page]=await context.LocalZpl.parseZpl(label('A').replace('^FDNF: 123^FS','^FDPeso: 1 kg^FS'));
  assert.equal(page.metadata.invoiceNumber,null);
  assert.equal(page.metadata.shipmentId,'40000000001');
});

test('near-fitting address with exceptional FB spacing keeps the whole text without shrinking barcodes',async()=>{
 const address='Cidade de destino: Municipio de Exemplo, Estado de Teste';
 // Fixture font measurement is 10 dots/character: a 500-dot field is 92.6%.
 assert.ok(address.length*10>500&&500/(address.length*10)>=0.85);
 const field=spacing=>'^XA^FO30,1121^A0N,26,26^FB500,2,'+spacing+',L^FD'+address+'^FS^XZ';
 texts.length=0;const [fitted]=await context.LocalZpl.parseZpl(field(1000));
 assert.equal(fitted.height,1200);assert.deepEqual(texts,[address]);
 texts.length=0;const [ordinary]=await context.LocalZpl.parseZpl(field(0));
 assert.equal(ordinary.height,1200);assert.equal(texts.length,2);assert.equal(texts.join(' '),address);
 texts.length=0;const [explicit]=await context.LocalZpl.parseZpl(field(1000).replace('Estado de Teste','Estado\\&de Teste'));
 assert.ok(explicit.height>1200);assert.equal(texts.length,2);
});
