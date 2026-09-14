import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');
const url='https://tyzfznwvjzmudxtcbbaf.supabase.co/storage/v1/render/image/public/product-images/12345678-1234-4567-89ab-123456789abc.jpg?width=480';

function harness(options={}){
  const entries=new Map(),listeners={},calls=[];
  const cache={
    async match(request){const entry=entries.get(request.url);if(!entry)return undefined;if(entry.accept!==(request.headers.get('accept')||''))return undefined;return entry.response.clone()},
    async put(request,response){if(options.failWrite)throw Error('quota');entries.set(request.url,{request,accept:request.headers.get('accept')||'',response:response.clone()})},
    async keys(){return [...entries.values()].map(entry=>entry.request)},
    async delete(request){return entries.delete(request.url)}
  };
  const context=vm.createContext({URL,Request,Response,Headers,Map,Date,Promise,
    self:{location:{origin:'http://localhost'},addEventListener:(name,fn)=>listeners[name]=fn},
    caches:{async open(){if(options.failOpen)throw Error('unavailable');return cache}},
    async fetch(request){calls.push(request);if(options.failCors&&request.mode==='cors')throw Error('cors');return new Response('image',{status:options.status||200,headers:{'content-type':options.type||'image/webp','cache-control':'no-cache'}})}
  });
  vm.runInContext(source,context);
  const request=new Request(url);
  return{entries,cache,calls,listeners,request,context,
    eligible:req=>context.publicMediaRequest(req,new URL(req.url)),
    serve:req=>context.servePublicMedia(req||request)};
}

test('only immutable public images without auth or tokens are eligible',()=>{
  const h=harness();assert.equal(h.eligible(h.request),true);
  for(const request of[
    new Request(url.replace('render/image/public/product-images','object/authenticated/bill-documents')),
    new Request(url+'&token=secret'),
    new Request(url.replace('12345678-1234-4567-89ab-123456789abc','avatar')),
    new Request(url,{headers:{authorization:'Bearer private'}}),
    new Request(url,{headers:{range:'bytes=0-10'}}),
    new Request(url,{cache:'no-store'}),
    new Request(url,{cache:'reload'}),
    new Request(url,{method:'POST',body:'x'})
  ])assert.equal(h.eligible(request),false);
});
test('second request is local even when upstream returns no-cache',async()=>{
  const h=harness();assert.equal((await h.serve()).headers.get('x-harmony-media-source'),'network');
  assert.equal((await h.serve()).headers.get('x-harmony-media-source'),'local-cache');assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].credentials,'omit');
});
test('concurrent requests share one network fetch and get independent bodies',async()=>{
  const h=harness();const a=h.serve(),b=h.serve();
  assert.equal(await(await a).text(),'image');assert.equal(await(await b).text(),'image');assert.equal(h.calls.length,1);
});
test('expired cache fetches a fresh image',async()=>{
  const h=harness();await h.serve();
  const entry=h.entries.get(url),headers=new Headers(entry.response.headers);
  headers.set('x-harmony-media-at',String(Date.now()-86400001));
  entry.response=new Response('old',{headers});
  assert.equal((await h.serve()).headers.get('x-harmony-media-source'),'network');assert.equal(h.calls.length,2);
});
test('accept negotiation cannot reuse an incompatible representation',async()=>{
  const h=harness();await h.serve();await h.serve(new Request(url,{headers:{accept:'image/webp'}}));assert.equal(h.calls.length,2);
});
test('cache storage failure does not prevent image delivery or retry upload',async()=>{
  const h=harness({failWrite:true});assert.equal(await(await h.serve()).text(),'image');assert.equal(h.calls.length,1);
  const other=harness({failOpen:true});assert.equal(await(await other.serve()).text(),'image');assert.equal(other.calls.length,1);
});
test('HTTP failures and non-images are never cached',async()=>{
  for(const options of[{status:404},{type:'text/html'}]){
    const h=harness(options);await h.serve();await h.serve();assert.equal(h.entries.size,0);assert.equal(h.calls.length,2);
  }
});
test('failed CORS uses the original request without caching an opaque fallback',async()=>{
  const h=harness({failCors:true});const request=new Request(url,{mode:'no-cors'});
  await h.serve(request);assert.equal(h.calls.length,2);assert.equal(h.calls[1],request);assert.equal(h.entries.size,0);
});
test('pruning enforces a 48 MB budget and expires old entries',async()=>{
  const h=harness();
  for(let i=0;i<20;i++){
    const request=new Request(url.replace('.jpg?',`-${i}.jpg?`));
    await h.cache.put(request,new Response('image',{headers:{'x-harmony-media-at':String(Date.now()-i),'x-harmony-media-bytes':String(3*1024*1024)}}));
  }
  await h.context.prunePublicMedia(h.cache);assert.equal(h.entries.size,16);
});
test('private downloads are not intercepted by the fetch handler',()=>{
  const h=harness();let handled=false;
  h.listeners.fetch({request:new Request(url.replace('render/image/public/product-images','object/authenticated/bill-documents')),respondWith(){handled=true}});
  assert.equal(handled,false);
});
