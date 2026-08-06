import { getChatGPTUser } from "../../../chatgpt-auth.ts";
import { assertWorkflowOwner, createRequestStudioRuntime, workflowStatus } from "../shared.ts";
export const runtime = "edge";

export async function POST(request:Request) {
  try {
    const user=await getChatGPTUser(); if(!user)return Response.json({error:"Faça login para continuar"},{status:401});
    const body=await request.json() as {workflowId?:string;slot?:number;decision?:"approved"|"rejected";feedback?:string}; const slot=Number(body.slot); if(!body.workflowId||!Number.isInteger(slot)||slot<1||slot>6||!["approved","rejected"].includes(String(body.decision)))return Response.json({error:"Avaliação inválida"},{status:400});
    const feedback=String(body.feedback??"").trim(); if(body.decision==="rejected"&&feedback.length<8)return Response.json({error:"Explique o que deve ser corrigido nesta imagem"},{status:400});
    const core=createRequestStudioRuntime(); await assertWorkflowOwner(core.db,body.workflowId,user.id); const key=`visual-production-${slot}`; const stage=await core.db.prepare("SELECT output_json FROM studio_stage_runs WHERE workflow_run_id = ? AND stage_key = ? AND status = 'succeeded' ORDER BY attempt DESC LIMIT 1").bind(body.workflowId,key).first<{output_json:string}>(); const assetId=stage?.output_json?JSON.parse(stage.output_json).candidateAssetId:null; if(!assetId)return Response.json({error:"Imagem não encontrada"},{status:404});
    const now=new Date().toISOString(); await core.db.prepare("INSERT INTO studio_image_human_reviews (id, workflow_run_id, slot, asset_id, decision, feedback, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(),body.workflowId,slot,assetId,body.decision,feedback||null,user.id,now).run();
    if(body.decision==="rejected")await core.orchestrator.reprocessImage(body.workflowId,slot,feedback,user.id);
    return Response.json(await workflowStatus(core.db,body.workflowId));
  } catch(error){return Response.json({error:error instanceof Error?error.message:"Falha ao registrar avaliação"},{status:500});}
}
