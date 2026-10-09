import { createClient } from 'npm:@supabase/supabase-js@2.110.7';
const MAX=8388608;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return reply({error:'Metodo nao permitido'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth=request.headers.get('Authorization')||'';
  if(!auth.startsWith('Bearer '))return reply({error:'Entre novamente no aplicativo.'},401);
  const server=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity,error:authError}=await server.auth.getUser(auth.slice(7));
  if(authError||!identity.user)return reply({error:'Sessao invalida.'},401);
  // Bounded streaming read: no request.json() on an unbounded user-controlled body.
  const reader=request.body?.getReader();if(!reader)return reply({error:'Arquivo ausente.'},400);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>Math.ceil(MAX*4/3)+4096){await reader.cancel();return reply({error:'Limite de 8 MB por arquivo.'},413)}chunks.push(chunk.value)}
  const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length}
  const body=JSON.parse(new TextDecoder().decode(raw));
  if(!uuid(body.id)||!uuid(body.contract_id)||(body.payment_id!==null&&!uuid(body.payment_id))||typeof body.name!=='string'||body.name.length<1||body.name.length>180||typeof body.base64!=='string')return reply({error:'Dados do documento invalidos.'},400);
  const client=createClient(url,key,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:detail,error:denied}=await client.rpc('financial_contract_detail',{p_contract_id:body.contract_id});
  if(denied||!detail?.can_write)return reply({error:'Acesso financeiro negado.'},403);
  const binary=atob(body.base64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  if(!bytes.length||bytes.length>MAX)return reply({error:'Limite de 8 MB por arquivo.'},413);
  const pdf=bytes.length>5&&new TextDecoder().decode(bytes.slice(0,5))==='%PDF-';
  const png=bytes.length>8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
  const jpeg=bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const mime=pdf?'application/pdf':png?'image/png':jpeg?'image/jpeg':null;
  if(!mime)return reply({error:'Use um PDF, PNG ou JPEG valido. O original nao foi alterado.'},400);
  if(body.payment_id){const {data:payment}=await server.from('contract_payments').select('id').eq('id',body.payment_id).eq('contract_id',body.contract_id).maybeSingle();if(!payment)return reply({error:'Pagamento nao pertence ao contrato.'},400)}
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  const path=detail.contract.entity_id+'/'+body.contract_id+'/'+hash+(pdf?'.pdf':png?'.png':'.jpg');
  const {error:uploadError}=await server.storage.from('financial-contract-documents').upload(path,bytes,{contentType:mime,upsert:false});
  if(uploadError&&!['409','400'].includes(String(uploadError.statusCode)))return reply({error:'Nao foi possivel preservar o original. Tente novamente com o mesmo arquivo.'},502);
  // Recheck access under an entity lock and confirm the stored object's size before linking.
  const {data:document,error:finalizeError}=await server.rpc('finalize_financial_document',{p_actor:identity.user.id,p_id:body.id,p_contract_id:body.contract_id,p_payment_id:body.payment_id,p_name:body.name,p_mime:mime,p_size:bytes.length,p_sha256:hash,p_path:path});
  if(finalizeError)return reply({error:finalizeError.message||'Original preservado; vinculo nao confirmado.'},409);
  return reply({document});
 }catch{return reply({error:'Nao foi possivel concluir o anexo. Nenhum pagamento foi registrado. Tente novamente com o mesmo arquivo.'},400)}
});
