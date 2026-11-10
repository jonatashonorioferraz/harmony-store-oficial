import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
const ctx=vm.createContext({});for(const f of ['shopee-id-fonts.js','shopee.js'])vm.runInContext(await readFile(new URL('../shipping-labels/'+f,import.meta.url),'utf8'),ctx);
const fixtures=[{"kind":"shipping","width":29,"height":17,"bits":"1000000000011100000001100000010000000001110000000111000000100000000110000000001111000001000000011000000000010110000010000011100000000001100100000100001110000000000011001100001000111000000000001100001000010011100000000000011000011000101111000000000000100000110001110011000000000011000000110011000011000000000111111111100100000011000000011111111111001000000011000000110000000011010000000111000011000000000110100000000111000110000000000111000000000111001100000000001110000000000111110000000000011","text":"KA"},{"kind":"checklist","width":23,"height":12,"bits":"110000001100000011000001100000110000001110000011000110000000010110000110011000000000100100001101100000000010001100011111000000000100001000111011000000011000010001100011000000111111110011000011000011000000100110000011000100000001101100000011001000000001011000000011110000000011","text":"KA"},{"kind":"checklist","width":16,"height":12,"bits":"000001100000111100001010000000010001101000000001000100100000000100110010000000010110001000000001010000100000000111000010000000011111111110000001000000100110000100000010001100110000001000011110","text":"4J"},{"kind":"checklist","width":16,"height":12,"bits":"000001100000111100001010000000010001101000000001000100100000000100110010000000010110001000000001010000100000000111000010000000011111111110000001000000100110000100000010001100110000001000011110","text":"4J"},{"kind":"shipping","width":29,"height":17,"bits":"1000000000011100000001100000010000000001110000000111000000100000000110000000001111000001000000011000000000010110000010000011100000000001100100000100001110000000000011001100001000111000000000001100001000010011100000000000011000011000101111000000000000100000110001110011000000000011000000110011000011000000000111111111100100000011000000011111111111001000000011000000110000000011010000000111000011000000000110100000000111000110000000000111000000000111001100000000001110000000000111110000000000011","text":"KA"},{"kind":"shipping","width":38,"height":17,"bits":"1100000000110000000011110000000000001111000000001100000000111100000000000110011000000011100000001101100000000001100110000000111000000011011000000000110001100000011010000001100011000000001100001100000110110000011000110000000011000011000001001100000110000110000001100000110000110011000011000001100000011000000100001100010000110000011000001100000001100010000110001100000011000011000000011001100001100010000000110001100000000110011000001001100000000110011000000000110110000011011000000001100110000000001101000000110110000000011011000000000011110000000111000000000011110000000000011100000001110000000000111000000000000110000000011100000000000110000000","text":"WV"},{"kind":"checklist","width":27,"height":12,"bits":"100000011000000111000000001110000011000000101000000011010000011100001101100000011010000110100001000100000010011000100100001000110000110001000100110011000110000100001000100010011000010001100001101100010010000011001000000101000011010000001001000000101000001110000001111000000111000001100000000110000000010000001100000000110000","text":"WV"}];
test('new touching glyphs match only exact component bitmaps on both source formats',()=>{
 for(const f of fixtures){const patterns=ctx.ShopeeIdFonts[f.kind];assert.equal(ctx.LocalShopee.decodeGlyph(f,patterns),f.text);const broken={...f,bits:(f.bits[0]==='1'?'0':'1')+f.bits.slice(1)};assert.equal(ctx.LocalShopee.decodeGlyph(broken,patterns),'');}
});
function join(glyphs){const width=glyphs.reduce((n,g)=>n+g.width,0),height=Math.max(...glyphs.map(g=>g.height));let bits='';for(let y=0;y<height;y++)for(const g of glyphs){const line=y-(height-g.height);bits+=line<0?'0'.repeat(g.width):g.bits.slice(line*g.width,(line+1)*g.width);}return {width,height,bits};}
test('every pair of known individual glyphs can be decoded without adding a pair dictionary',()=>{
 for(const kind of ['shipping','checklist']){const singles=ctx.ShopeeIdFonts[kind].filter(g=>g.text.length===1);for(const a of singles)for(const b of singles)assert.equal(ctx.LocalShopee.decodeGlyph(join([a,b]),singles),a.text+b.text,kind+' '+a.text+b.text);}
});
test('longer adjacent sequences work and ambiguous or damaged pixels fail closed',()=>{
 const singles=ctx.ShopeeIdFonts.shipping.filter(g=>g.text.length===1),chars=[...'KAWV4J'];assert.equal(ctx.LocalShopee.decodeGlyph(join(chars.map(c=>singles.find(g=>g.text===c))),singles),chars.join(''));
 assert.equal(ctx.LocalShopee.decodeGlyph({width:2,height:1,bits:'11'},[{width:1,height:1,bits:'1',text:'A'},{width:1,height:1,bits:'1',text:'B'}]),'');
 assert.equal(ctx.LocalShopee.decodeGlyph({width:3,height:1,bits:'101'},[{width:1,height:1,bits:'1',text:'A'}]),'');
});

test('PAC Industrial ID is read from its own pixels at the top, never borrowed from a checklist',()=>{
 const id='261103C06R9J52',p={width:816,height:1218,stride:102,raw:new Uint8Array(102*1218)};let x=480;
 for(const char of id){const g=[...ctx.ShopeeIdFonts.pac].reverse().find(g=>g.text===char);assert.ok(g);for(let y=0;y<g.height;y++)for(let i=0;i<g.width;i++)if(g.bits[y*g.width+i]==='1')p.raw[(85+y)*p.stride+((x+i)>>3)]|=128>>((x+i)%8);x+=g.width+3;}
 assert.equal(ctx.LocalShopee.glyphId(p,'shipping'),id);assert.equal(ctx.LocalShopee.glyphId(p,'pac'),id);
 p.raw[86*p.stride+(480>>3)]^=128>>(480%8);assert.equal(ctx.LocalShopee.glyphId(p,'shipping'),'');
});

test('kerning with shared columns requires two complete disjoint masks and a unique exact match',()=>{
 const glyph={"width":29,"height":17,"bits":"1100000000000011000001100000011000000000001100000111000000011000000000011000001111000000110000000001100000010110000000110000000011000001100100000001100000000110000011001100000001100000011000001100001000000011000000110000011000011000000110000011000000100000110000000110000110000011000000110000001100011000000111111111100000001100110000011111111111000000011001100000110000000011000000110110000011000000000110000000111100000110000000000110000001110000001100000000001100000001100000110000000000011"};assert.equal(ctx.LocalShopee.decodeGlyph(glyph,ctx.ShopeeIdFonts.shipping),'VA');
 for(let i=0;i<glyph.bits.length;i++){const damaged={...glyph,bits:glyph.bits.slice(0,i)+(glyph.bits[i]==='1'?'0':'1')+glyph.bits.slice(i+1)};assert.equal(ctx.LocalShopee.decodeGlyph(damaged,ctx.ShopeeIdFonts.shipping),'');}
 const ambiguous=[...ctx.ShopeeIdFonts.shipping,{...ctx.ShopeeIdFonts.shipping.find(p=>p.text==='V'),text:'X'}];assert.equal(ctx.LocalShopee.decodeGlyph(glyph,ambiguous),'');
 assert.equal(ctx.LocalShopee.decodeGlyph({width:3,height:1,bits:'111'},[{width:2,height:1,bits:'11',text:'A'},{width:2,height:1,bits:'11',text:'B'}]),'');
});

test('shipping IDs at the air and standard origins retain every digit and reject damage',()=>{
 const id='261110ABCDEFGH';
 for(const origin of [124,140]){const p={width:816,height:1218,stride:102,raw:new Uint8Array(102*1218)};let x=origin;
  for(const c of id){const g=ctx.ShopeeIdFonts.shipping.find(g=>g.text===c);assert.ok(g);for(let y=0;y<g.height;y++)for(let i=0;i<g.width;i++)if(g.bits[y*g.width+i]==='1')p.raw[(258+y)*p.stride+((x+i)>>3)]|=128>>((x+i)%8);x+=g.width+3;}
  assert.equal(ctx.LocalShopee.glyphId(p,'shipping'),id);p.raw[258*p.stride+(origin>>3)]^=128>>(origin%8);assert.equal(ctx.LocalShopee.glyphId(p,'shipping'),'');
 }
});

test('PAC Industrial alternate 8 D and 7 masks decode exactly and reject unknown altered pixels',()=>{
 const fixtures=[{"width":8,"height":12,"bits":"011111101100001110000001100000011100001100111100110000101000000110000001100000011100011101111100","text":"8"},{"width":11,"height":12,"bits":"111111110001100000110011000000110110000000101100000001111000000011110000000111100000001111000000010110000001101100001110011111110000","text":"D"},{"width":8,"height":12,"bits":"111111110000001100000010000001000000110000001000000110000001000000010000001100000011000000110000","text":"7"}];
 for(const g of fixtures){assert.equal(ctx.LocalShopee.decodeGlyph(g,ctx.ShopeeIdFonts.pac),g.text);for(let i=0;i<g.bits.length;i++){const broken={...g,bits:g.bits.slice(0,i)+(g.bits[i]==='1'?'0':'1')+g.bits.slice(i+1)};const known=ctx.ShopeeIdFonts.pac.find(p=>p.width===broken.width&&p.height===broken.height&&p.bits===broken.bits);assert.equal(ctx.LocalShopee.decodeGlyph(broken,ctx.ShopeeIdFonts.pac),known?.text||'');}}
});
