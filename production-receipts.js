(()=>{
const PR={loaded:false,loading:false,error:'',models:[],receipts:[],closings:[],workers:[],tab:'receipts',weekStart:''};
const pn=value=>Number(value||0);
const money=value=>pn(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2});
const preciseMoney=value=>'R$ '+pn(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4});
const units=value=>pn(value).toLocaleString('pt-BR',{maximumFractionDigits:0})+' un.';
const localIso=date=>{const d=new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const today=()=>localIso(new Date());
const paymentFor=(quantity,rate=2.5)=>pn(quantity)*pn(rate)/100;
const role=()=>S.profile?.role||'';
const isAdmin=()=>role()==='admin';
const canReceive=()=>isAdmin()||role()==='receiver';
const canSeeValues=()=>role()!=='receiver';
const modelImageUrl=model=>model?.image_path?API+'/storage/v1/object/public/product-images/'+model.image_path:'';
function weekBounds(value=new Date()){
  const base=typeof value==='string'?new Date(value+'T12:00:00'):new Date(value);
  const offset=(base.getDay()+6)%7;
  base.setDate(base.getDate()-offset);
  const end=new Date(base);end.setDate(end.getDate()+6);
  return {start:localIso(base),end:localIso(end)};
}
PR.weekStart=weekBounds().start;

function groupReport(rows=PR.receipts){
  const grouped=new Map();
  rows.forEach(item=>{
    const key=[item.worker_id,item.model_id,item.color].join('|');
    const current=grouped.get(key)||{worker_id:item.worker_id,worker_name:item.worker_name,model_id:item.model_id,model_name:item.model_name,color:item.color,quantity:0,amount:0};
    current.quantity+=pn(item.quantity);current.amount+=pn(item.amount);grouped.set(key,current);
  });
  return [...grouped.values()].sort((a,b)=>a.worker_name.localeCompare(b.worker_name)||a.model_name.localeCompare(b.model_name)||a.color.localeCompare(b.color));
}

async function loadProduction(force=false){
  if(PR.loading||PR.loaded&&!force)return;
  PR.loading=true;PR.error='';
  const bounds=weekBounds(PR.weekStart);
  try{
    const calls=[rpc('list_finished_product_models',{}),rpc('list_finished_production_receipts',{p_from:bounds.start,p_to:bounds.end,p_worker_id:null}),rpc('list_production_weekly_closings',{p_from:bounds.start,p_to:bounds.end,p_worker_id:null})];
    if(canReceive())calls.push(rpc('list_production_workers',{}));
    const [models,receipts,closings,workers]=await Promise.all(calls);
    Object.assign(PR,{models,receipts,closings,workers:workers||[S.profile],loaded:true});
  }catch(error){PR.error=error.message||'Não foi possível carregar a produção recebida.'}
  finally{PR.loading=false}
}

function productionNav(){
  if(!S?.profile)return;
  const navRoot=document.querySelector('.sidebar nav'),profileButton=navRoot?.querySelector('[data-view="profile"]');
  if(!navRoot||!profileButton)return;
  let button=navRoot.querySelector('[data-view="production"]');
  if(!button){
    const marker=document.createElement('small');marker.dataset.productionMarker='true';marker.textContent='PRODUÇÃO RECEBIDA';
    button=document.createElement('button');button.className='nav';button.dataset.view='production';
    button.innerHTML=`<i>📦</i>${isAdmin()?'Produção e pagamentos':role()==='receiver'?'Receber produção':'Minha produção'}`;
    profileButton.parentNode.insertBefore(marker,profileButton);profileButton.parentNode.insertBefore(button,profileButton);
    button.onclick=()=>{S.view='production';renderApp()};
  }
  button.classList.toggle('active',S.view==='production');
  const accountRole=document.querySelector('.account small');
  if(accountRole&&role()==='receiver'&&accountRole.textContent!=='Colaboradora de recebimento')accountRole.textContent='Colaboradora de recebimento';
  const profileRole=document.querySelector('.profile-head p');
  if(profileRole&&role()==='receiver'&&profileRole.textContent!=='Colaboradora de recebimento')profileRole.textContent='Colaboradora de recebimento';
  const userRole=document.querySelector('#userForm select[name="role"]');
  if(userRole&&!userRole.querySelector('option[value="receiver"]')){
    const option=document.createElement('option');option.value='receiver';option.textContent='Colaboradora de recebimento';
    const adminOption=userRole.querySelector('option[value="admin"]');userRole.insertBefore(option,adminOption);
    const username=document.querySelector('#userForm input[name="username"]')?.value;
    if(S.team.find(item=>item.username===username)?.role==='receiver')userRole.value='receiver';
  }
  if(S.view==='production'){
    const page=document.querySelector('#page');if(page&&!page.dataset.production)renderProduction();
  }
}

function tabs(){
  const items=[['receipts',role()==='receiver'?'Conferências':'Recebimentos']];
  if(role()!=='receiver')items.push(['weeks',isAdmin()?'Pagamentos semanais':'Meus pagamentos']);
  if(isAdmin())items.push(['models','Modelos']);
  return `<div class="production-tabs">${items.map(([id,label])=>`<button data-production-tab="${id}" class="${PR.tab===id?'active':''}">${label}</button>`).join('')}</div>`;
}

function weekFilter(){
  const bounds=weekBounds(PR.weekStart);
  return `<section class="card production-filter"><label>Semana iniciada em<input id="productionWeek" type="date" value="${bounds.start}"></label><div><small>PERÍODO</small><b>${new Date(bounds.start+'T12:00:00').toLocaleDateString('pt-BR')} a ${new Date(bounds.end+'T12:00:00').toLocaleDateString('pt-BR')}</b></div><button class="outline compact-action" id="applyProductionWeek">Atualizar semana</button></section>`;
}

function receiptMetrics(){
  const quantity=PR.receipts.reduce((sum,item)=>sum+pn(item.quantity),0),workers=new Set(PR.receipts.map(item=>item.worker_id)).size,amount=PR.receipts.reduce((sum,item)=>sum+pn(item.amount),0);
  return `<div class="production-metrics"><article><small>RECEBIMENTOS</small><b>${PR.receipts.length}</b><span>Conferências na semana</span></article><article><small>UNIDADES</small><b>${units(quantity)}</b><span>Produção recebida</span></article><article><small>COLABORADORAS</small><b>${workers}</b><span>Com produção registrada</span></article>${canSeeValues()?`<article><small>VALOR PROPORCIONAL</small><b>${money(amount)}</b><span>Antes do fechamento</span></article>`:''}</div>`;
}

function receiptTable(){
  const editable=item=>!item.closing_id&&(isAdmin()||role()==='receiver'&&item.received_by===S.profile.id);
  return `<div class="table-wrap"><table class="production-table"><thead><tr><th>Data</th><th>Colaboradora</th><th>Modelo</th><th>Cor</th><th>Quantidade</th>${canSeeValues()?'<th>Valor</th>':''}<th>Conferido por</th><th>Situação</th>${canReceive()?'<th>Ações</th>':''}</tr></thead><tbody>${PR.receipts.map(item=>`<tr><td>${new Date(item.received_on+'T12:00:00').toLocaleDateString('pt-BR')}</td><td><b>${esc(item.worker_name)}</b></td><td>${esc(item.model_name)}</td><td><span class="color-pill">${esc(item.color)}</span></td><td><strong>${units(item.quantity)}</strong></td>${canSeeValues()?`<td>${preciseMoney(item.amount)}</td>`:''}<td>${esc(item.receiver_name)}</td><td><span class="badge ${item.closing_id?'production-closed':'production-open'}">${item.closing_id?'Semana fechada':'Em aberto'}</span></td>${canReceive()?`<td><div class="actions">${editable(item)?`<button class="ghost compact-action" data-edit-receipt="${item.id}">Editar</button><button class="danger compact-action" data-delete-receipt="${item.id}">Excluir</button>`:'—'}</div></td>`:''}</tr>`).join('')||`<tr><td colspan="${canReceive()?9:8}" class="empty">Nenhuma produção recebida nesta semana.</td></tr>`}</tbody></table></div>`;
}

function reportTable(){
  const rows=groupReport();
  if(!isAdmin()||!rows.length)return '';
  return `<section class="card production-section"><div class="card-head"><div><p class="eyebrow">RESUMO DA SEMANA</p><h2>Produção por modelo e cor</h2></div><button class="outline compact-action" id="exportProduction">Exportar Excel</button></div><div class="table-wrap"><table class="production-table"><thead><tr><th>Colaboradora</th><th>Modelo</th><th>Cor</th><th>Quantidade</th><th>Valor proporcional</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.worker_name)}</td><td>${esc(row.model_name)}</td><td>${esc(row.color)}</td><td>${units(row.quantity)}</td><td>${money(row.amount)}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function receiptsView(){
  return `${receiptMetrics()}<section class="card production-section"><div class="card-head"><div><p class="eyebrow">PRODUTOS ACABADOS</p><h2>${role()==='receiver'?'Conferências realizadas':'Recebimentos da semana'}</h2></div>${canReceive()?'<button class="primary" id="newReceipt">＋ Novo recebimento</button>':''}</div>${receiptTable()}</section>${reportTable()}`;
}

function weeksView(){
  const bounds=weekBounds(PR.weekStart),byWorker=new Map();
  PR.receipts.forEach(item=>{const current=byWorker.get(item.worker_id)||{worker_id:item.worker_id,worker_name:item.worker_name,quantity:0,amount:0};current.quantity+=pn(item.quantity);current.amount+=pn(item.amount);byWorker.set(item.worker_id,current)});
  if(!isAdmin()){
    return `<section class="card production-section"><div class="card-head"><div><p class="eyebrow">PAGAMENTOS</p><h2>Meus fechamentos semanais</h2></div></div><div class="closing-list">${PR.closings.map(closing=>closingCard(closing)).join('')||'<div class="empty">Nenhum pagamento fechado nesta semana.</div>'}</div></section>`;
  }
  const workers=PR.workers.map(worker=>{const current=byWorker.get(worker.id)||{worker_id:worker.id,worker_name:worker.full_name,quantity:0,amount:0},closing=PR.closings.find(item=>item.worker_id===worker.id);return {worker,current,closing}}).filter(item=>item.current.quantity||item.closing);
  return `<section class="card production-section"><div class="card-head"><div><p class="eyebrow">FECHAMENTO</p><h2>Pagamentos de ${new Date(bounds.start+'T12:00:00').toLocaleDateString('pt-BR')} a ${new Date(bounds.end+'T12:00:00').toLocaleDateString('pt-BR')}</h2></div></div><div class="closing-list">${workers.map(({worker,current,closing})=>closing?closingCard(closing):`<article><div><small>COLABORADORA</small><b>${esc(worker.full_name)}</b></div><div><small>PRODUÇÃO</small><b>${units(current.quantity)}</b></div><div><small>VALOR</small><b>${money(current.amount)}</b></div><span class="badge production-open">Em aberto</span><button class="primary compact-action" data-close-week="${worker.id}">Fechar semana</button></article>`).join('')||'<div class="empty">Nenhum recebimento encontrado para fechar.</div>'}</div></section>`;
}

function closingCard(closing){
  return `<article><div><small>COLABORADORA</small><b>${esc(closing.worker_name)}</b></div><div><small>PRODUÇÃO</small><b>${units(closing.total_quantity)}</b></div>${canSeeValues()?`<div><small>TOTAL A PAGAR</small><b>${money(closing.total_amount)}</b></div>`:''}<span class="badge ${closing.status==='paid'?'production-paid':'production-closed'}">${closing.status==='paid'?'Pago':'Fechado'}</span>${isAdmin()?`<div class="actions"><button class="outline compact-action" data-statement="${closing.id}">Gerar PDF</button>${closing.status==='closed'?`<button class="primary compact-action" data-mark-paid="${closing.id}">Marcar como pago</button><button class="danger compact-action" data-reopen-week="${closing.id}">Reabrir</button>`:''}</div>`:''}</article>`;
}

function modelsView(){
  return `<section class="production-model-head"><div><p class="eyebrow">MODELOS ACABADOS</p><h2>Catálogo para conferência</h2><span>Nome, cores e valor proporcional por 100 unidades.</span></div><button class="primary" id="newFinishedModel">＋ Novo modelo</button></section><div class="finished-model-grid">${PR.models.map(model=>`<article class="card finished-model"><div class="finished-model-photo">${model.image_path?`<img src="${esc(modelImageUrl(model))}" alt="${esc(model.name)}">`:'<i>✦</i>'}</div><div><span class="badge ${model.active?'active':'inactive'}">${model.active?'Ativo':'Inativo'}</span><h3>${esc(model.name)}</h3><p>${model.colors.length?model.colors.map(color=>`<span class="color-pill">${esc(color)}</span>`).join(' '):'Cores livres'}</p><b>${money(model.rate_per_100)} por 100 unidades</b></div><div class="actions"><button class="ghost compact-action" data-edit-finished-model="${model.id}">Editar</button><button class="danger compact-action" data-delete-finished-model="${model.id}">Excluir</button></div></article>`).join('')||'<div class="empty">Nenhum modelo cadastrado.</div>'}</div>`;
}

async function renderProduction(){
  const page=document.querySelector('#page');if(!page||S.view!=='production')return;
  page.dataset.production='true';page.innerHTML='<div class="loading-inline">Preparando recebimentos…</div>';
  await loadProduction();if(S.view!=='production')return;
  if(PR.error){page.innerHTML=`<div class="page">${head('PRODUÇÃO RECEBIDA','Atualização necessária','O restante do aplicativo continua funcionando normalmente.')}<section class="card intelligence-error"><h2>Execute a atualização 009 no Supabase</h2><p>O módulo de recebimentos só será liberado após a atualização do banco.</p><small>${esc(PR.error)}</small></section></div>`;return}
  page.innerHTML=`<div class="page production-page">${head('PRODUÇÃO RECEBIDA',isAdmin()?'Controle simples e pagamento semanal':role()==='receiver'?'Conferência de produtos acabados':'Minha produção recebida',isAdmin()?'Registre modelos, acompanhe quantidades e feche os pagamentos de segunda a domingo.':role()==='receiver'?'Confira modelo, cor, quantidade e data sem acesso a valores.':'Acompanhe o que foi recebido e os seus fechamentos semanais.')} ${tabs()} ${weekFilter()} <div id="productionContent">${PR.tab==='weeks'?weeksView():PR.tab==='models'&&isAdmin()?modelsView():receiptsView()}</div></div>`;
  bindProduction();
}

function rerenderProduction(){const page=document.querySelector('#page');if(page)delete page.dataset.production;renderProduction()}
async function refreshProduction(message){PR.loaded=false;await loadProduction(true);document.querySelector('#modal').innerHTML='';rerenderProduction();if(message)toast(message)}

function bindProduction(){
  document.querySelectorAll('[data-production-tab]').forEach(button=>button.onclick=()=>{PR.tab=button.dataset.productionTab;rerenderProduction()});
  const apply=document.querySelector('#applyProductionWeek');if(apply)apply.onclick=()=>{const value=document.querySelector('#productionWeek').value;if(!value)return alert('Informe uma data.');PR.weekStart=weekBounds(value).start;PR.loaded=false;rerenderProduction()};
  const newReceipt=document.querySelector('#newReceipt');if(newReceipt)newReceipt.onclick=()=>receiptModal();
  document.querySelectorAll('[data-edit-receipt]').forEach(button=>button.onclick=()=>receiptModal(PR.receipts.find(item=>item.id===button.dataset.editReceipt)));
  document.querySelectorAll('[data-delete-receipt]').forEach(button=>button.onclick=()=>deleteReceipt(button.dataset.deleteReceipt));
  document.querySelectorAll('[data-close-week]').forEach(button=>button.onclick=()=>closeWeek(button.dataset.closeWeek));
  document.querySelectorAll('[data-mark-paid]').forEach(button=>button.onclick=()=>markPaid(button.dataset.markPaid));
  document.querySelectorAll('[data-reopen-week]').forEach(button=>button.onclick=()=>reopenWeek(button.dataset.reopenWeek));
  document.querySelectorAll('[data-statement]').forEach(button=>button.onclick=()=>printStatement(button.dataset.statement));
  const newModel=document.querySelector('#newFinishedModel');if(newModel)newModel.onclick=()=>modelModal();
  document.querySelectorAll('[data-edit-finished-model]').forEach(button=>button.onclick=()=>modelModal(PR.models.find(item=>item.id===button.dataset.editFinishedModel)));
  document.querySelectorAll('[data-delete-finished-model]').forEach(button=>button.onclick=()=>deleteModel(button.dataset.deleteFinishedModel));
  const exportButton=document.querySelector('#exportProduction');if(exportButton)exportButton.onclick=exportProduction;
}

function closeModalBindings(){document.querySelectorAll('[data-production-close]').forEach(button=>button.onclick=()=>document.querySelector('#modal').innerHTML='')}

function receiptModal(receipt={}){
  const selectedModel=PR.models.find(item=>item.id===receipt.model_id)||PR.models.find(item=>item.active),selectedWorker=receipt.worker_id||S.profile.id;
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box" id="productionReceiptForm"><div class="modal-head"><div><p class="eyebrow">CONFERÊNCIA</p><h2>${receipt.id?'Editar recebimento':'Novo recebimento'}</h2></div><button type="button" data-production-close>×</button></div><div class="form"><label>Colaboradora<select name="worker_id" required><option value="">Selecione</option>${PR.workers.map(worker=>`<option value="${worker.id}" ${worker.id===selectedWorker?'selected':''}>${esc(worker.full_name)}</option>`).join('')}</select></label><label>Data do recebimento<input name="received_on" type="date" max="${today()}" value="${receipt.received_on||today()}" required></label><label>Modelo<select name="model_id" required><option value="">Selecione</option>${PR.models.filter(item=>item.active||item.id===receipt.model_id).map(model=>`<option value="${model.id}" ${model.id===selectedModel?.id?'selected':''}>${esc(model.name)}</option>`).join('')}</select></label><label id="productionColorLabel">Cor</label><label>Quantidade recebida<input name="quantity" type="number" inputmode="numeric" min="1" step="1" value="${receipt.quantity||''}" required></label>${isAdmin()?`<div class="production-calculation"><small>CÁLCULO PROPORCIONAL</small><b id="productionCalculated">${money(paymentFor(receipt.quantity,selectedModel?.rate_per_100))}</b><span>${money(selectedModel?.rate_per_100||2.5)} a cada 100 unidades</span></div>`:''}<label class="wide">Observação<textarea name="notes" placeholder="Opcional">${esc(receipt.notes||'')}</textarea></label><div class="form-actions"><button type="button" class="outline" data-production-close>Cancelar</button><button class="primary">Salvar recebimento</button></div></div></form></div>`;
  const form=document.querySelector('#productionReceiptForm'),modelSelect=form.elements.model_id,colorLabel=document.querySelector('#productionColorLabel');
  const updateColor=()=>{const model=PR.models.find(item=>item.id===modelSelect.value),colors=model?.colors||[],value=receipt.color||colors[0]||'';colorLabel.innerHTML=`Cor${colors.length?`<select name="color" required>${colors.map(color=>`<option ${color===value?'selected':''}>${esc(color)}</option>`).join('')}</select>`:`<input name="color" value="${esc(value)}" required placeholder="Informe a cor">`}`;updateCalculation()};
  const updateCalculation=()=>{const output=document.querySelector('#productionCalculated');if(!output)return;const model=PR.models.find(item=>item.id===modelSelect.value);output.textContent=money(paymentFor(form.elements.quantity.value,model?.rate_per_100||0))};
  modelSelect.onchange=()=>{receipt.color='';updateColor()};form.elements.quantity.oninput=updateCalculation;updateColor();closeModalBindings();
  form.onsubmit=async event=>{event.preventDefault();const button=event.submitter,f=new FormData(form),quantity=Number(f.get('quantity'));if(!Number.isInteger(quantity)||quantity<=0)return alert('Informe a quantidade em unidades inteiras.');button.disabled=true;const payload={p_worker_id:f.get('worker_id'),p_model_id:f.get('model_id'),p_color:f.get('color'),p_quantity:quantity,p_received_on:f.get('received_on'),p_notes:f.get('notes')||null};try{await rpc(receipt.id?'update_finished_production_receipt':'create_finished_production_receipt',receipt.id?{p_receipt_id:receipt.id,...payload}:payload);await refreshProduction('Recebimento salvo com segurança.')}catch(error){alert(error.message);button.disabled=false}};
}

async function deleteReceipt(id){if(!confirm('Excluir este recebimento? Esta ação ficará registrada no histórico.'))return;try{await rpc('delete_finished_production_receipt',{p_receipt_id:id});await refreshProduction('Recebimento excluído.')}catch(error){alert(error.message)}}

function modelModal(model={}){
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box" id="finishedModelForm"><div class="modal-head"><div><p class="eyebrow">MODELO ACABADO</p><h2>${model.id?'Editar modelo':'Novo modelo'}</h2></div><button type="button" data-production-close>×</button></div><div class="form"><label>Nome do modelo<input name="name" value="${esc(model.name||'')}" required></label><label>Valor por 100 unidades<input name="rate_per_100" type="number" min="0" step=".01" value="${model.rate_per_100??2.5}" required></label><label class="wide">Cores disponíveis<input name="colors" value="${esc((model.colors||[]).join(', '))}" placeholder="Rosa, Azul, Branco"></label><label>Foto do modelo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><label class="check"><input name="active" type="checkbox" ${model.active!==false?'checked':''}>Modelo ativo</label><label class="wide">Observações<textarea name="notes">${esc(model.notes||'')}</textarea></label><div class="form-actions"><button type="button" class="outline" data-production-close>Cancelar</button><button class="primary">Salvar modelo</button></div></div></form></div>`;
  closeModalBindings();document.querySelector('#finishedModelForm').onsubmit=async event=>{event.preventDefault();const button=event.submitter,f=new FormData(event.target),colors=[...new Set(String(f.get('colors')||'').split(',').map(item=>item.trim()).filter(Boolean))],data={name:String(f.get('name')).trim(),rate_per_100:pn(f.get('rate_per_100')),colors,notes:f.get('notes')||null,active:f.get('active')==='on'};button.disabled=true;try{const file=f.get('photo');if(file?.size){if(file.size>2097152)throw Error('A foto deve ter no máximo 2 MB.');if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use uma imagem JPG, PNG ou WebP.');const path='finished-models/'+crypto.randomUUID()+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'-');await json(await fetch(API+'/storage/v1/object/product-images/'+path,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+S.session.access_token,'Content-Type':file.type},body:file}));data.image_path=path}if(!model.id)data.created_by=S.profile.id;await rest(model.id?'finished_product_models?id=eq.'+model.id:'finished_product_models',{method:model.id?'PATCH':'POST',body:JSON.stringify(data)});await refreshProduction('Modelo salvo.')}catch(error){alert(error.message);button.disabled=false}};
}

async function deleteModel(id){if(!confirm('Excluir este modelo? Modelos já usados em recebimentos não podem ser excluídos.'))return;try{await rest('finished_product_models?id=eq.'+id,{method:'DELETE'});await refreshProduction('Modelo excluído.')}catch(error){alert('Este modelo possui recebimentos registrados. Você pode editá-lo e deixá-lo inativo.')}}
async function closeWeek(workerId){if(!confirm('Fechar esta semana? Os recebimentos ficarão protegidos contra alterações.'))return;try{await rpc('admin_close_production_week',{p_worker_id:workerId,p_week_start:weekBounds(PR.weekStart).start});await refreshProduction('Semana fechada e pagamento calculado.')}catch(error){alert(error.message)}}
async function markPaid(id){const notes=prompt('Observação do pagamento (opcional):')||'';if(!confirm('Confirmar que este pagamento foi realizado?'))return;try{await rpc('admin_mark_production_week_paid',{p_closing_id:id,p_notes:notes});await refreshProduction('Pagamento marcado como realizado.')}catch(error){alert(error.message)}}
async function reopenWeek(id){if(!confirm('Reabrir este fechamento para correções? Depois será necessário fechar a semana novamente.'))return;try{await rpc('admin_reopen_production_week',{p_closing_id:id});await refreshProduction('Semana reaberta para correções.')}catch(error){alert(error.message)}}

function exportProduction(){
  const clean=value=>`"${String(value??'').replaceAll('"','""')}"`,rows=groupReport(),content='\ufeff'+[['Colaboradora','Modelo','Cor','Quantidade','Valor proporcional'],...rows.map(row=>[row.worker_name,row.model_name,row.color,row.quantity,row.amount.toFixed(4)])].map(row=>row.map(clean).join(';')).join('\r\n'),url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`harmony-producao-${weekBounds(PR.weekStart).start}.csv`;link.hidden=true;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}

async function printStatement(id){
  try{
    const rows=await rpc('admin_production_statement',{p_closing_id:id});if(!rows.length)throw Error('Fechamento sem lançamentos.');
    const first=rows[0],area=document.createElement('section');area.id='productionPrint';
    area.innerHTML=`<header><img src="logo.jpg" alt="Harmony Store"><div><small>HARMONY STORE OFICIAL</small><h1>Demonstrativo semanal de produção</h1><p>Fechamento #${String(first.protocol).padStart(4,'0')}</p></div></header><div class="print-summary"><div><small>COLABORADORA</small><b>${esc(first.worker_name)}</b></div><div><small>PERÍODO</small><b>${new Date(first.week_start+'T12:00:00').toLocaleDateString('pt-BR')} a ${new Date(first.week_end+'T12:00:00').toLocaleDateString('pt-BR')}</b></div><div><small>SITUAÇÃO</small><b>${first.status==='paid'?'Pago':'Fechado'}</b></div></div><table><thead><tr><th>Data</th><th>Modelo</th><th>Cor</th><th>Quantidade</th><th>Valor/100</th><th>Valor proporcional</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${new Date(row.received_on+'T12:00:00').toLocaleDateString('pt-BR')}</td><td>${esc(row.model_name)}</td><td>${esc(row.color)}</td><td>${units(row.quantity)}</td><td>${money(row.rate_per_100)}</td><td>${preciseMoney(row.line_amount)}</td></tr>`).join('')}</tbody></table><footer><div><small>TOTAL PRODUZIDO</small><b>${units(first.total_quantity)}</b></div><div class="print-total"><small>TOTAL A PAGAR</small><b>${money(first.total_amount)}</b></div></footer><div class="signatures"><span>Responsável Harmony Store</span><span>${esc(first.worker_name)}</span></div><p class="print-note">Cálculo proporcional: quantidade × valor por 100 ÷ 100. Documento gerado em ${new Date().toLocaleString('pt-BR')}.</p>`;
    document.body.appendChild(area);window.onafterprint=()=>{area.remove();window.onafterprint=null};window.print();
  }catch(error){alert(error.message)}
}

new MutationObserver(productionNav).observe(document.body,{childList:true,subtree:true});
productionNav();
window.HarmonyProduction=Object.freeze({state:PR,paymentFor,weekBounds,groupReport});
})();
