import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
const root=resolve(import.meta.dirname,"..","dist","client"),types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png'};
createServer(async(req,res)=>{try{let path=join(root,new URL(req.url,'http://localhost').pathname==='/'?'index.html':new URL(req.url,'http://localhost').pathname);try{if(!(await stat(path)).isFile())throw 0}catch{path=join(root,'index.html')}let body=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body)}catch{res.writeHead(500);res.end('Erro ao abrir o aplicativo')}}).listen(4173,'127.0.0.1',()=>console.log('Local URL: http://127.0.0.1:4173'));
