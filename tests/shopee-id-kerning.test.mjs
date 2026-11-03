import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
const ctx=vm.createContext({});
for(const f of ['shopee-id-fonts.js','shopee.js'])vm.runInContext(await readFile(new URL('../shipping-labels/'+f,import.meta.url),'utf8'),ctx);
// Isolated font pixels only. No customer or order data.
const fixtures=[{"width":28,"height":12,"bits":"100000011000000100000110000011000001100000010000111000000100000111000011000010110000010000110100001000001001000001100010010000100001000110000010001001100110000100001000001000100010011000110000100000110110001001000011111111000001010000110100011000000100000101000001110001000000011000011100000110000100000000100000100000011000110000000011","text":"WA"},{"width":20,"height":12,"bits":"000001100110000000010000101000100000001100011010001100000011000100100001000000100011001000011000011001100010000110000100010000100000100011001100001000001100100011111111100001001000000000100000011110000000001000000011000000000010000000110000","text":"4V"}];
for(const pair of fixtures)test('checklist recognizes touching '+pair.text+' only with exact pixels',()=>{
 const width=1218,height=816,stride=Math.ceil(width/8),raw=new Uint8Array(stride*height),page={width,height,stride,raw};
 const glyphs=[...'26110100'].map(text=>ctx.ShopeeIdFonts.checklist.find(g=>g.text===text));glyphs.push(pair,...[...'0000'].map(text=>ctx.ShopeeIdFonts.checklist.find(g=>g.text===text)));
 let left=212,pairX;
 for(const g of glyphs){if(g===pair)pairX=left;for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++)if(g.bits[y*g.width+x]==='1')raw[(179+y)*stride+((left+x)>>3)]|=128>>((left+x)%8);left+=g.width+2;}
 assert.equal(ctx.LocalShopee.glyphId(page,'checklist'),'26110100'+pair.text+'0000');
 raw[179*stride+(pairX>>3)]^=128>>(pairX%8);
 assert.equal(ctx.LocalShopee.glyphId(page,'checklist'),'');
});
