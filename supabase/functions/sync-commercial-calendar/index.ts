import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { parseProposals, requestBody } from "./validation.mjs";

const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});
function equalSecret(a:string,b:string){
  if(!a||!b||a.length!==b.length)return false;
  let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
  return difference===0;
}
const sha256=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(n=>n.toString(16).padStart(2,"0")).join("");

Deno.serve(async request=>{
  if(request.method!=="POST")return reply({error:"method_not_allowed"},405);
  const secret=Deno.env.get("CALENDAR_CRON_SECRET")||"";
  if(secret.length<32||!equalSecret(request.headers.get("x-calendar-secret")||"",secret))return reply({error:"forbidden"},403);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),openai=Deno.env.get("OPENAI_API_KEY");
  if(!url||!key||!openai)return reply({error:"not_configured"},503);
  // A separate server approval is deliberately required in addition to SQL settings.
  if(Deno.env.get("CALENDAR_RESEARCH_APPROVED")!=="yes")return reply({status:"disabled"});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  let runId:string|null=null;
  try{
    const claim=await admin.rpc("claim_commercial_calendar_sync");
    if(claim.error)throw new Error("claim_failed");
    if(!claim.data?.allowed)return reply({status:claim.data?.reason||"disabled"});
    runId=claim.data.run_id;
    const domains=claim.data.domains as string[],from=claim.data.run_day as string;
    if(!domains?.length||domains.length>20)throw new Error("invalid_sources");
    const until=new Date(from+"T12:00:00Z");until.setUTCDate(until.getUTCDate()+370);
    const to=until.toISOString().slice(0,10);
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",headers:{Authorization:"Bearer "+openai,"Content-Type":"application/json"},
      body:JSON.stringify(requestBody(from,to,domains)),signal:AbortSignal.timeout(65000)
    });
    if(!response.ok)throw new Error(response.status===429?"provider_rate_limit":"provider_error");
    const result=await response.json();
    const proposals=parseProposals(result,domains,from,to);
    const events=[];
    for(const proposal of proposals){
      const {fingerprint_input,...event}=proposal;
      events.push({...event,fingerprint:await sha256(fingerprint_input)});
    }
    const saved=await admin.rpc("finish_commercial_calendar_sync",{
      p_run_id:runId,p_events:events,p_error_code:null,
      p_input_tokens:result.usage?.input_tokens??null,p_output_tokens:result.usage?.output_tokens??null
    });
    if(saved.error)throw new Error("save_failed");
    return reply({status:"completed",proposals:events.length});
  }catch(error){
    const allowed=new Set(["claim_failed","invalid_sources","provider_rate_limit","provider_error","incomplete_response","refused_response","invalid_response","invalid_proposal","unverified_source","invalid_date","invalid_publication_date","save_failed"]);
    const message=error instanceof Error?error.message:"";
    const code=allowed.has(message)?message:error instanceof Error&&["TimeoutError","AbortError"].includes(error.name)?"provider_timeout":"sync_failed";
    if(runId){
      const failed=await admin.rpc("finish_commercial_calendar_sync",{p_run_id:runId,p_events:[],p_error_code:code,p_input_tokens:null,p_output_tokens:null});
      if(failed.error)console.error(JSON.stringify({event:"commercial_calendar_finish_failed",run_id:runId}));
    }
    // Never log provider response bodies, credentials, or business documents.
    console.error(JSON.stringify({event:"commercial_calendar_sync_failed",code}));
    return reply({error:code},502);
  }
});
