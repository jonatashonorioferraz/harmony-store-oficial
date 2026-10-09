/* global S, rpc, storageFetch */
(function(root){
'use strict';
const C=root.HarmonyFinancialCore,E=C.esc;
let generation=0;
const controllers=new Set(),urls=new Set();
const q=(node,selector)=>node.querySelector(selector);
const money=value=>Number.isFinite(Number(value))?Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'indisponivel';
const messages={disabled:'A leitura esta desativada. O original continua salvo.',budget_exhausted:'Limite preventivo mensal atingido. O original continua salvo.',rate_limited:'Muitas leituras nesta hora. Aguarde antes de solicitar outra.',unauthorized:'Sua sessao terminou. Entre novamente para retomar a leitura.',forbidden:'Voce nao tem permissao financeira para esta empresa.',not_configured:'O servico de IA ainda nao esta configurado.',original_unavailable:'Nao foi possivel concluir a guarda do original. Tente novamente com o mesmo arquivo.',file_too_large:'O limite por arquivo e 8 MB.',invalid_input:'Use um PDF, PNG ou JPEG valido, com ate 8 MB.'};
function reset(){generation++;for(const c of controllers)c.abort();controllers.clear();for(const url of urls)URL.revokeObjectURL(url);urls.clear()}
async function original(item){
 const response=await storageFetch('/storage/v1/object/authenticated/financial-contract-documents/'+item.storage_path.split('/').map(encodeURIComponent).join('/'));
 if(!response.ok)throw Error('Original indisponivel ou permissao encerrada.');
 const blob=await response.blob(),url=URL.createObjectURL(blob);urls.add(url);
 const a=document.createElement('a');a.href=url;a.download=item.original_name;a.click();
 setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url)},60000);
}
function mount({el,entityId,contractId=null,mode,onApply,intakeId=null}){
 const form=q(el,'form'),panel=document.createElement('section'),born=generation,actor=S.profile?.id;
 panel.className='fc-ai-panel';form.prepend(panel);
 let current=null,active=!!intakeId,busy=false,stopped=false,pollTimer=null,applyDone=false;
 const live=()=>!stopped&&born===generation&&el.isConnected&&actor===S.profile?.id&&S.view==='financial-contracts';
 const stop=()=>{stopped=true;clearTimeout(pollTimer)};el.addEventListener('close',stop,{once:true});
 const report=text=>{if(live())q(panel,'[data-ai-message]').textContent=text};
 panel.innerHTML=`<div class="fc-ai-heading"><strong>Leitura assistida por IA</strong><span data-ai-status>Consultando disponibilidade...</span></div><p>O original fica salvo. A IA sugere; voce confere e decide. Nenhum pagamento e registrado automaticamente.</p><label>Contrato ou comprovante original<input data-ai-file type="file" accept="application/pdf,image/png,image/jpeg"></label><div class="fc-ai-actions"><button type="button" class="fc-btn" data-ai-read>Guardar original e ler</button><button type="button" class="fc-btn" data-ai-manual>Continuar manualmente</button></div><p class="fc-ai-message" role="status" aria-live="polite" data-ai-message>PDF, PNG ou JPEG, ate 8 MB. Nao envie dados que nao sejam necessarios.</p><div data-ai-result></div>`;
 function draw(item){
  if(!live())return;current=item;intakeId=item.id;active=true;
  const run=item.run,result=run?.result,ex=result?.extraction,a=result?.assessment;
  let content=`<div class="fc-ai-original"><strong>${E(item.original_name)}</strong><button type="button" class="fc-btn" data-ai-original>Baixar original</button></div>`;
  if(item.confirmed){content+='<p>Esta leitura ja foi conferida e vinculada a um registro. Consulte o contrato no historico.</p>';}
  else if(run?.status==='succeeded'&&ex){
   const allowed=mode==='payment'?a?.payment_suggestion_allowed===true:ex.document_kind==='contract';
   const labels={contract:'Contrato',payment_receipt:'Comprovante',payment_schedule:'Agendamento, nao confirma pagamento',bill:'Boleto, nao confirma pagamento',other:'Outro documento',unreadable:'Documento ilegivel'};
   content+=`<p><strong>${E(labels[ex.document_kind]||'Documento nao identificado')}</strong></p><dl class="fc-ai-fields"><div><dt>Credor ou beneficiario</dt><dd>${E(ex.beneficiary_name||ex.creditor_name||'Nao identificado')}</dd></div><div><dt>Valor encontrado</dt><dd>${ex.amount==null?'Nao identificado':E(money(ex.amount))}</dd></div><div><dt>Data encontrada</dt><dd>${E(ex.effective_date||ex.contract_date||'Nao identificada')}</dd></div></dl>`;
   const warnings=[...(ex.warnings||[]),...(a?.warnings||[]),...(a?.blocking_reasons||[])];
   if(warnings.length)content+=`<ul class="fc-ai-warnings">${warnings.map(w=>`<li>${E(w)}</li>`).join('')}</ul>`;
   content+='<p>Os trechos abaixo foram extraidos pela IA e tambem precisam ser comparados com o original.</p>';
   content+=`<details><summary>Ver evidencias da leitura</summary>${(ex.evidence||[]).map(e=>`<blockquote><strong>${E(e.field)}${e.page?' | pagina '+E(e.page):''}</strong><p>${E(e.quote)}</p></blockquote>`).join('')||'<p>Sem trechos de apoio.</p>'}</details>`;
   if(allowed){
    content+='<button type="button" class="fc-btn" data-ai-apply>Usar sugestoes no formulario</button>';
    if(mode==='payment')content+=`<div class="fc-ai-candidates"><strong>Possiveis parcelas, escolha somente apos conferir</strong>${(a.candidates||[]).map((c,i)=>`<button type="button" class="fc-btn" data-ai-candidate="${i}">Parcela ${E(c.number)} | ${E(c.due_date)} | saldo ${E(money(c.remaining))}</button>`).join('')||'<p>Sem correspondencia segura. Selecione os valores manualmente no formulario.</p>'}<p>A escolha nao registra o pagamento. O saldo sera validado novamente na confirmacao.</p></div>`;
    content+='<label class="fc-check"><input type="checkbox" data-ai-reviewed> Conferi o original, os dados sugeridos e as parcelas do formulario. Confirmo apenas o que realmente ocorreu.</label>';
   }else content+='<p class="fc-ai-warning">Esta leitura nao pode ser usada para confirmar este registro. Confira o documento e, se necessario, continue manualmente. Um boleto ou agendamento nao comprova pagamento.</p>';
  }else if(!run||run.status==='failed'||run.stale){
   content+='<p>Nao ha uma leitura concluida disponivel. O original foi preservado. Tentativas sem custo confirmado continuam reservadas no limite preventivo.</p><button type="button" class="fc-btn" data-ai-retry>Solicitar leitura novamente</button>';
  }else content+='<p>Original salvo. Leitura em andamento, sem percentual artificial. Voce pode fechar esta tela e retomar em Leituras salvas.</p>';
  q(panel,'[data-ai-result]').innerHTML=content;
  q(panel,'[data-ai-original]').onclick=()=>original(item).catch(error=>report(error.message));
  q(panel,'[data-ai-apply]')?.addEventListener('click',()=>{onApply(ex);applyDone=true;report('Sugestoes preenchidas. Confira todos os campos e marque a revisao antes de confirmar.')});
  for(const button of panel.querySelectorAll('[data-ai-candidate]'))button.onclick=()=>{
   if(!root.confirm('Usar esta parcela como sugestao? Confira valor, data e favorecido antes de registrar.'))return;
   onApply(ex,a.candidates[Number(button.dataset.aiCandidate)]);applyDone=true;report('Parcela sugerida no formulario. Nenhum pagamento foi registrado.');
  };
  q(panel,'[data-ai-retry]')?.addEventListener('click',()=>{
   if(root.confirm('Solicitar uma nova leitura? Havera outra reserva preventiva de R$ 2; a tentativa anterior pode ter tido custo. Nenhuma nova tentativa e automatica.'))start(true);
  });
 }
 async function load(poll=false){
  if(!live())return;
  const data=await rpc('financial_ai_state',{p_entity:entityId,p_intake:intakeId});if(!live())return;
  const limit=data.monthly_limit_brl??data.limit_brl??data.limit,used=data.estimated_used_brl??data.used_brl??data.estimated_used;
  q(panel,'[data-ai-status]').textContent=data.enabled?'IA habilitada neste modulo':'IA desativada';
  if(!intakeId){report((limit==null?'':`Limite mensal: ${money(limit)}. `)+(used==null?'':`Consumo preventivo: ${money(used)}. `)+'Reserva de R$ 2 por tentativa. Valores estimados, separados do calendario comercial.');return;}
  const item=data.items?.find(i=>i.id===intakeId);if(!item)throw Error('Leitura indisponivel ou acesso encerrado.');draw(item);
  if(poll&&['queued','processing'].includes(item.run?.status)&&!item.run?.stale)pollTimer=setTimeout(()=>load(true).catch(error=>report(error.message)),2500);
 }
 async function start(retry=false){
  if(busy||!live())return;busy=true;clearTimeout(pollTimer);applyDone=false;
  q(panel,'[data-ai-read]').disabled=true;
  const controller=new AbortController();controllers.add(controller);
  const timeout=setTimeout(()=>controller.abort(),35000);
  try{
   const payload={entity_id:entityId,run_id:crypto.randomUUID(),retry};
   if(intakeId)payload.intake_id=intakeId;
   else{
    const file=q(panel,'[data-ai-file]').files?.[0];if(!file)throw Error('Selecione o arquivo original primeiro.');
    if(file.size>8388608||!file.size||!['application/pdf','image/png','image/jpeg'].includes(file.type))throw Error(messages.invalid_input);
    const bytes=new Uint8Array(await file.arrayBuffer());let encoded='';for(let i=0;i<bytes.length;i+=32768)encoded+=String.fromCharCode(...bytes.subarray(i,i+32768));
    Object.assign(payload,{id:crypto.randomUUID(),mode,contract_id:contractId,name:file.name,mime:file.type,base64:btoa(encoded)});
   }
   active=true;report('Guardando o original e solicitando a leitura...');
   const response=await storageFetch('/functions/v1/analyze-financial-document',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
   const result=await response.json();if(!live())return;
   if(result.intake_id)intakeId=result.intake_id;
   if(!response.ok){if(intakeId)await load(false);throw Error(messages[result.error]||'Nao foi possivel iniciar a leitura. Consulte Leituras salvas antes de tentar novamente.');}
   report('Original salvo. Aguardando a leitura da IA.');await load(true);
  }catch(error){report(error.name==='AbortError'?'A resposta demorou. O processamento pode continuar. Consulte Leituras salvas antes de repetir.':error.message);}
  finally{clearTimeout(timeout);controllers.delete(controller);busy=false;if(live())q(panel,'[data-ai-read]').disabled=false;}
 }
 q(panel,'[data-ai-read]').onclick=()=>start(false);
 q(panel,'[data-ai-file]').onchange=()=>{
  if(active&&!root.confirm('Trocar o documento? O original anterior permanece em Leituras salvas.')){q(panel,'[data-ai-file]').value='';return;}
  clearTimeout(pollTimer);current=null;intakeId=null;active=false;applyDone=false;q(panel,'[data-ai-result]').replaceChildren();
 };
 q(panel,'[data-ai-manual]').onclick=()=>{
  if(busy){report('Aguarde a resposta de envio antes de continuar manualmente.');return;}
  if(active&&!root.confirm('Continuar sem vincular esta leitura? O original ficara em Leituras salvas, sem vinculo automatico ao registro manual.'))return;
  clearTimeout(pollTimer);active=false;report('Modo manual. Confira todos os dados. A leitura salva, se houver, permanece no historico.');
 };
 load(!!intakeId).catch(error=>report(error.message));
 return Object.freeze({review(){
  if(busy)throw Error('Aguarde a resposta do envio do documento.');
  if(!active)return null;
  if(current?.confirmed)throw Error('Esta leitura ja foi vinculada. Consulte o registro existente.');
  if(current?.run?.status!=='succeeded'||!q(panel,'[data-ai-reviewed]')?.checked)throw Error('Conclua e confira a leitura, ou escolha continuar manualmente.');
  if(!applyDone)throw Error('Use as sugestoes no formulario e confira os dados antes de confirmar.');
  return {runId:current.run.id};
 }});
}
async function history({entityId,dialog,onResume}){
 const el=dialog('Leituras salvas', '<div class="fc-ai-history" role="status">Carregando documentos...</div>'),born=generation,actor=S.profile?.id;
 try{
  const data=await rpc('financial_ai_state',{p_entity:entityId,p_intake:null});if(!el.isConnected||born!==generation||actor!==S.profile?.id)return;
  const items=data.items||[];
  q(el,'.fc-ai-history').innerHTML='<p>Ultimos 50 documentos. O original permanece salvo mesmo quando a IA nao conclui. Nenhuma nova leitura e cobrada ao abrir um resultado pronto.</p>'+items.map((item,i)=>`<article class="fc-ai-history-item"><strong>${E(item.original_name)}</strong><p>${E(item.mode==='payment'?'Comprovante':'Contrato')} | ${E(new Date(item.created_at).toLocaleString('pt-BR'))} | ${item.confirmed?'Conferido e vinculado':item.run?.status==='succeeded'?'Aguardando conferencia':item.run?.stale?'Leitura sem conclusao confirmada':item.run?.status==='failed'?'Leitura nao concluida':'Pendente'}</p><div class="fc-ai-actions"><button type="button" class="fc-btn" data-ai-download="${i}">Original</button>${item.confirmed?'':`<button type="button" class="fc-btn" data-ai-resume="${i}">Retomar conferencia</button>`}</div></article>`).join('')+(items.length?'':'<p>Nenhum documento enviado para leitura nesta empresa.</p>');
  for(const button of el.querySelectorAll('[data-ai-download]'))button.onclick=()=>original(items[Number(button.dataset.aiDownload)]).catch(error=>root.alert(error.message));
  for(const button of el.querySelectorAll('[data-ai-resume]'))button.onclick=()=>{const item=items[Number(button.dataset.aiResume)];el.close();onResume(item)};
 }catch(error){if(el.isConnected)q(el,'.fc-ai-history').textContent=error.message;}
}
root.HarmonyFinancialAI=Object.freeze({mount,history,reset});
})(window);
