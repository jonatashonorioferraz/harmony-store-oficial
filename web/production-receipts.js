(()=>{
const PR={loaded:false,loading:false,error:'',models:[],colors:[],receipts:[],closings:[],workers:[],paymentOverview:[],tab:'receipts',weekStart:''};
const pn=value=>Number(value||0);
const money=value=>pn(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2});
const preciseMoney=value=>'R$ '+pn(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4});
const units=value=>pn(value).toLocaleString('pt-BR',{maximumFractionDigits:0})+' un.';
const localIso=date=>{const d=new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const today=()=>localIso(new Date());
const dateBr=value=>value?new Date(value+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const weekdayName=value=>['','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado','domingo'][Number(value)]||'não configurado';
const paymentFor=(quantity,rate=2.5)=>pn(quantity)*pn(rate)/100;
const differenceFor=item=>pn(item?.quantity)-pn(item?.declared_quantity??item?.quantity);
const role=()=>S.profile?.role||'';
const isAdmin=()=>role()==='admin';
const canReceive=()=>isAdmin()||role()==='receiver';
const canSeeReceiptValues=()=>isAdmin();
const canSeePaymentValues=()=>role()!=='receiver';
const canSeeValues=()=>PR.tab==='weeks'?canSeePaymentValues():canSeeReceiptValues();
const modelImageUrl=model=>model?.image_path?API+'/storage/v1/object/public/product-images/'+model.image_path:'';
const productionColor=name=>PR.colors.find(color=>color.name.toLocaleLowerCase('pt-BR')===String(name||'').toLocaleLowerCase('pt-BR'));
const productionColorHex=name=>productionColor(name)?.hex_code||'#D9A3BE';
const colorChip=name=>`<span class="color-pill visual-color-pill"><i style="--production-color:${esc(productionColorHex(name))}"></i>${esc(name)}</span>`;
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
    const current=grouped.get(key)||{worker_id:item.worker_id,worker_name:item.worker_name,model_id:item.model_id,model_name:item.model_name,color:item.color,declared_quantity:0,quantity:0,amount:0};
    current.declared_quantity+=pn(item.declared_quantity??item.quantity);current.quantity+=pn(item.quantity);current.amount+=pn(item.amount);grouped.set(key,current);
  });
  return [...grouped.values()].sort((a,b)=>a.worker_name.localeCompare(b.worker_name)||a.model_name.localeCompare(b.model_name)||a.color.localeCompare(b.color));
}

function groupedCollections(rows=PR.receipts){
  const grouped=new Map();
  rows.forEach(item=>{
    const key=item.collection_id||item.id,current=grouped.get(key)||{
      id:key,worker_id:item.worker_id,worker_name:item.worker_name,received_on:item.received_on,
      received_by:item.received_by,receiver_name:item.receiver_name,box_reference:item.box_reference,
      notes:item.notes,created_at:item.created_at,planned_payment_on:item.planned_payment_on,items:[]
    };
    current.items.push(item);grouped.set(key,current);
  });
  return [...grouped.values()].sort((a,b)=>String(b.received_on).localeCompare(String(a.received_on))||String(b.created_at).localeCompare(String(a.created_at)));
}

async function loadProduction(force=false){
  if(PR.loading||PR.loaded&&!force)return;
  PR.loading=true;PR.error='';
  const bounds=weekBounds(PR.weekStart);
  try{
    const [models,receipts,closings,colors,workers,paymentOverview]=await Promise.all([
      rpc('list_finished_product_models',{}),
      rpc('list_finished_production_receipts',{p_from:bounds.start,p_to:bounds.end,p_worker_id:null}),
      rpc('list_production_payment_closings',{p_from:null,p_to:null,p_worker_id:null}),
      rpc('list_finished_production_colors',{}),
      canReceive()?rpc('list_production_workers',{}):Promise.resolve([S.profile]),
      isAdmin()?rpc('list_production_payment_overview',{}):Promise.resolve([])
    ]);
    Object.assign(PR,{models,colors,receipts,closings,workers:workers||[S.profile],paymentOverview,loaded:true});
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
  if(role()!=='receiver')items.push(['weeks',isAdmin()?'Agenda de pagamentos':'Meus pagamentos']);
  if(isAdmin())items.push(['models','Modelos'],['colors','Cores']);
  return `<div class="production-tabs">${items.map(([id,label])=>`<button data-production-tab="${id}" class="${PR.tab===id?'active':''}">${label}</button>`).join('')}</div>`;
}

function weekFilter(){
  const bounds=weekBounds(PR.weekStart);
  return `<section class="card production-filter"><label>Semana iniciada em<input id="productionWeek" type="date" value="${bounds.start}"></label><div><small>PERÍODO</small><b>${new Date(bounds.start+'T12:00:00').toLocaleDateString('pt-BR')} a ${new Date(bounds.end+'T12:00:00').toLocaleDateString('pt-BR')}</b></div><button class="outline compact-action" id="applyProductionWeek">Atualizar semana</button></section>`;
}

function receiptMetrics(){
  const collections=groupedCollections(),declared=PR.receipts.reduce((sum,item)=>sum+pn(item.declared_quantity??item.quantity),0),quantity=PR.receipts.reduce((sum,item)=>sum+pn(item.quantity),0),divergences=PR.receipts.filter(item=>differenceFor(item)!==0).length,amount=PR.receipts.reduce((sum,item)=>sum+pn(item.amount),0);
  return `<div class="production-metrics"><article><small>RECEBIMENTOS</small><b>${collections.length}</b><span>Coletas registradas</span></article><article><small>MODELOS/CORES</small><b>${PR.receipts.length}</b><span>Itens conferidos</span></article><article><small>INFORMADAS</small><b>${units(declared)}</b><span>Anotadas nas folhas</span></article><article><small>CONTAGEM OFICIAL</small><b>${units(quantity)}</b><span>Base do pagamento</span></article><article><small>DIVERGÊNCIAS</small><b>${divergences}</b><span>Contagens diferentes</span></article>${canSeeValues()?`<article><small>VALOR PROPORCIONAL</small><b>${money(amount)}</b><span>Calculado pela contagem oficial</span></article>`:''}</div>`;
}

function differenceBadge(item){
  const difference=differenceFor(item),kind=difference<0?'shortage':difference>0?'surplus':'match',label=difference<0?`${units(Math.abs(difference))} faltando`:difference>0?`${units(difference)} a mais`:'Contagem correta';
  return `<span class="quantity-difference ${kind}">${label}</span>`;
}

function receiptTable(){
  const collections=groupedCollections();
  return `<div class="receipt-collections">${collections.map(collection=>{const closingId=collection.items.find(item=>item.closing_id)?.closing_id||null,closing=PR.closings.find(item=>item.id===closingId),closed=Boolean(closingId),paid=closing?.status==='paid',correctable=canReceive()&&!paid,deletable=!closed&&(isAdmin()||role()==='receiver'&&collection.received_by===S.profile.id),total=collection.items.reduce((sum,item)=>sum+pn(item.amount),0),paymentLabel=paid?'Pagamento realizado':closed?'Pagamento fechado':collection.planned_payment_on?'Previsto para '+dateBr(collection.planned_payment_on):'Agenda não configurada';return `<article class="collection-card"><header><div><small>DATA</small><b>${dateBr(collection.received_on)}</b></div><div><small>COLABORADORA</small><b>${esc(collection.worker_name)}</b></div><div><small>COLETA / CAIXA</small><b>${esc(collection.box_reference||'Não informada')}</b></div><div><small>ITENS</small><b>${collection.items.length}</b></div>${canSeeValues()?`<div><small>VALOR</small><b>${preciseMoney(total)}</b></div>`:''}<span class="badge ${paid?'production-paid':closed?'production-closed':'production-open'}">${paymentLabel}</span>${canReceive()?`<div class="actions">${correctable?`<button class="ghost compact-action" data-edit-collection="${collection.id}">${closed?'Reabrir e editar':'Editar coleta'}</button>`:''}${isAdmin()&&!closed?`<button class="outline compact-action" data-move-payment="${collection.id}">Mover pagamento</button>`:''}${deletable?`<button class="danger compact-action" data-delete-collection="${collection.id}">Excluir coleta</button>`:''}${paid?'<small class="locked-receipt">Pagamento protegido</small>':''}</div>`:''}</header><div class="table-wrap"><table class="production-table collection-items-table"><thead><tr><th>Modelo</th><th>Cor</th><th>Informada</th><th>Oficial</th><th>Diferença</th>${canSeeValues()?'<th>Valor</th>':''}</tr></thead><tbody>${collection.items.map(item=>`<tr><td><b>${esc(item.model_name)}</b></td><td>${colorChip(item.color)}</td><td>${units(item.declared_quantity??item.quantity)}</td><td><strong>${units(item.quantity)}</strong></td><td>${differenceBadge(item)}</td>${canSeeValues()?`<td>${preciseMoney(item.amount)}</td>`:''}</tr>`).join('')}</tbody></table></div><footer><span>Conferido por <b>${esc(collection.receiver_name)}</b></span>${collection.notes?`<span>Observação: ${esc(collection.notes)}</span>`:''}</footer></article>`}).join('')||'<div class="empty">Nenhuma produção recebida nesta semana.</div>'}</div>`;
}

function reportTable(){
  const rows=groupReport();
  if(!isAdmin()||!rows.length)return '';
  return `<section class="card production-section"><div class="card-head"><div><p class="eyebrow">RESUMO DA SEMANA</p><h2>Produção por modelo e cor</h2></div><button class="outline compact-action" id="exportProduction">Exportar Excel</button></div><div class="table-wrap"><table class="production-table"><thead><tr><th>Colaboradora</th><th>Modelo</th><th>Cor</th><th>Informada</th><th>Oficial</th><th>Diferença</th><th>Valor proporcional</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.worker_name)}</td><td>${esc(row.model_name)}</td><td>${colorChip(row.color)}</td><td>${units(row.declared_quantity)}</td><td><strong>${units(row.quantity)}</strong></td><td>${differenceBadge(row)}</td><td>${money(row.amount)}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function receiptsView(){
  return `${receiptMetrics()}<section class="card production-section"><div class="card-head"><div><p class="eyebrow">PRODUTOS ACABADOS</p><h2>${role()==='receiver'?'Conferências realizadas':'Recebimentos da semana'}</h2></div>${canReceive()?'<button class="primary" id="newReceipt">＋ Novo recebimento</button>':''}</div>${receiptTable()}</section>${reportTable()}`;
}

function weeksView(){
  const bounds=weekBounds(PR.weekStart),periodClosings=PR.closings.filter(item=>!item.payment_due_on||item.payment_due_on>=bounds.start&&item.payment_due_on<=bounds.end);
  if(!isAdmin()){
    return `<section class="card production-section"><div class="card-head"><div><p class="eyebrow">PAGAMENTOS</p><h2>Meus pagamentos</h2><span>Somente pagamentos já fechados aparecem aqui.</span></div></div><div class="closing-list">${periodClosings.map(closing=>closingCard(closing)).join('')||'<div class="empty">Nenhum pagamento fechado neste período.</div>'}</div></section>`;
  }
  const overview=PR.paymentOverview||[];
  return `<section class="card production-section"><div class="card-head"><div><p class="eyebrow">AGENDA INDIVIDUAL</p><h2>Próximos pagamentos</h2><span>O fechamento respeita o corte e o dia configurados para cada colaboradora.</span></div></div><div class="payment-overview-grid">${overview.map(item=>paymentOverviewCard(item)).join('')||'<div class="empty">Nenhuma colaboradora ativa encontrada.</div>'}</div></section><section class="card production-section"><div class="card-head"><div><p class="eyebrow">HISTÓRICO</p><h2>Pagamentos fechados no período</h2></div></div><div class="closing-list">${periodClosings.map(closing=>closingCard(closing)).join('')||'<div class="empty">Nenhum pagamento fechado neste período.</div>'}</div></section>`;
}

function paymentOverviewCard(item){
  if(!item.schedule_active)return `<article class="payment-overview-card unconfigured"><div><small>COLABORADORA</small><b>${esc(item.worker_name)}</b></div><span class="badge production-open">Agenda não configurada</span><p>Abra o cadastro desta colaboradora para definir corte e pagamento.</p><button class="outline compact-action" data-open-worker-schedule="${item.worker_id}">Configurar agenda</button></article>`;
  const ready=Boolean(item.ready_to_close),hasItems=pn(item.receipt_count)>0,status=ready?'Pronto para fechar':hasItems?'Aguardando o corte':'Sem produção pendente';
  return `<article class="payment-overview-card ${ready?'ready':''}"><header><div><small>COLABORADORA</small><b>${esc(item.worker_name)}</b></div><span class="badge ${ready?'production-paid':'production-open'}">${status}</span></header><div class="payment-schedule-summary"><span><small>CORTE</small><b>${weekdayName(item.cutoff_weekday)}, ${String(item.cutoff_time||'').slice(0,5)}</b></span><span><small>PAGAMENTO</small><b>${weekdayName(item.payment_weekday)}, ${dateBr(item.payment_due_on)}</b></span><span><small>COLETAS</small><b>${pn(item.collection_count)}</b></span><span><small>PRODUÇÃO</small><b>${units(item.total_quantity)}</b></span><span><small>VALOR</small><b>${money(item.total_amount)}</b></span></div>${hasItems?`<div class="actions"><button class="outline compact-action" data-preview-payment="${item.worker_id}" data-payment-due="${item.payment_due_on}">Conferir itens</button>${ready?`<button class="primary compact-action" data-close-payment="${item.worker_id}" data-payment-due="${item.payment_due_on}">Fechar pagamento</button>`:''}</div>`:'<small>Novos recebimentos serão incluídos automaticamente.</small>'}</article>`;
}

function closingCard(closing){
  return `<article><div><small>COLABORADORA</small><b>${esc(closing.worker_name)}</b></div><div><small>CICLO</small><b>${dateBr(closing.cycle_start_on)} a ${dateBr(closing.cycle_end_on)}</b></div><div><small>PAGAMENTO</small><b>${dateBr(closing.payment_due_on)}</b></div><div><small>PRODUÇÃO</small><b>${units(closing.total_quantity)}</b></div>${canSeeValues()?`<div><small>TOTAL A PAGAR</small><b>${money(closing.total_amount)}</b></div>`:''}<span class="badge ${closing.status==='paid'?'production-paid':'production-closed'}">${closing.status==='paid'?'Pago':'Fechado'}</span>${isAdmin()?`<div class="actions"><button class="outline compact-action" data-statement="${closing.id}">Gerar PDF</button>${closing.status==='closed'?`<button class="primary compact-action" data-mark-paid="${closing.id}">Marcar como pago</button><button class="danger compact-action" data-reopen-payment="${closing.id}">Reabrir</button>`:''}</div>`:''}</article>`;
}

function modelsView(){
  const activeColors=PR.colors.filter(color=>color.active);
  return `<section class="production-model-head"><div><p class="eyebrow">MODELOS ACABADOS</p><h2>Catálogo para conferência</h2><span>Todo modelo recebe automaticamente as ${activeColors.length} cores ativas do catálogo padrão.</span></div><button class="primary" id="newFinishedModel">＋ Novo modelo</button></section><div class="finished-model-grid">${PR.models.map(model=>`<article class="card finished-model"><div class="finished-model-photo">${model.image_path?`<img src="${esc(modelImageUrl(model))}" alt="${esc(model.name)}">`:'<i>✦</i>'}</div><div><span class="badge ${model.active?'active':'inactive'}">${model.active?'Ativo':'Inativo'}</span><h3>${esc(model.name)}</h3><p>${activeColors.slice(0,4).map(color=>colorChip(color.name)).join('')}${activeColors.length>4?`<span class="color-pill">+${activeColors.length-4}</span>`:''}</p><b>${money(model.rate_per_100)} por 100 unidades</b></div><div class="actions"><button class="ghost compact-action" data-edit-finished-model="${model.id}">Editar</button><button class="danger compact-action" data-delete-finished-model="${model.id}">Excluir</button></div></article>`).join('')||'<div class="empty">Nenhum modelo cadastrado.</div>'}</div>`;
}

function colorsView(){
  return `<section class="production-model-head production-color-head"><div><p class="eyebrow">PADRÃO DE PRODUÇÃO</p><h2>Catálogo visual de cores</h2><span>Toda cor ativa aparece automaticamente em todos os modelos atuais e futuros.</span></div><button class="primary" id="newProductionColor">＋ Nova cor</button></section><div class="production-color-grid">${PR.colors.map(color=>`<article class="card production-color-card"><div class="production-color-preview" style="--production-color:${esc(color.hex_code)}"><i></i></div><div><span class="badge ${color.active?'active':'inactive'}">${color.active?'Ativa':'Inativa'}</span><h3>${esc(color.name)}</h3><p>${esc(color.hex_code)} · ordem ${color.sort_order}</p></div><div class="actions"><button class="ghost compact-action" data-edit-production-color="${color.id}">Editar</button><button class="danger compact-action" data-delete-production-color="${color.id}">Excluir</button></div></article>`).join('')||'<div class="empty">Nenhuma cor cadastrada. Cadastre a primeira cor padrão da produção.</div>'}</div>`;
}

async function renderProduction(){
  const page=document.querySelector('#page');if(!page||S.view!=='production')return;
  page.dataset.production='true';page.innerHTML='<div class="loading-inline">Preparando recebimentos…</div>';
  await loadProduction();if(S.view!=='production')return;
  if(PR.error){page.innerHTML=`<div class="page">${head('PRODUÇÃO RECEBIDA','Atualização necessária','O restante do aplicativo continua funcionando normalmente.')}<section class="card intelligence-error"><h2>Execute a atualização 009 no Supabase</h2><p>O módulo de recebimentos só será liberado após a atualização do banco.</p><small>${esc(PR.error)}</small></section></div>`;return}
  page.innerHTML=`<div class="page production-page">${head('PRODUÇÃO RECEBIDA',isAdmin()?'Controle de produção e pagamentos':role()==='receiver'?'Conferência de produtos acabados':'Minha produção recebida',isAdmin()?'Registre recebimentos e feche cada pagamento conforme a agenda individual.':role()==='receiver'?'Confira modelo, cor, quantidade e data sem acesso a valores.':'Acompanhe o que foi recebido e os pagamentos já fechados.')} ${tabs()} ${weekFilter()} <div id="productionContent">${PR.tab==='weeks'?weeksView():PR.tab==='models'&&isAdmin()?modelsView():PR.tab==='colors'&&isAdmin()?colorsView():receiptsView()}</div></div>`;
  bindProduction();
}

function rerenderProduction(){const page=document.querySelector('#page');if(page)delete page.dataset.production;renderProduction()}
async function refreshProduction(message){PR.loaded=false;await loadProduction(true);document.querySelector('#modal').innerHTML='';rerenderProduction();if(message)toast(message)}

function bindProduction(){
  document.querySelectorAll('[data-production-tab]').forEach(button=>button.onclick=()=>{PR.tab=button.dataset.productionTab;rerenderProduction()});
  const apply=document.querySelector('#applyProductionWeek');if(apply)apply.onclick=()=>{const value=document.querySelector('#productionWeek').value;if(!value)return alert('Informe uma data.');PR.weekStart=weekBounds(value).start;PR.loaded=false;rerenderProduction()};
  const newReceipt=document.querySelector('#newReceipt');if(newReceipt)newReceipt.onclick=()=>PR.colors.some(color=>color.active)?receiptModal():alert('Cadastre e ative pelo menos uma cor na aba Cores antes de criar um recebimento.');
  document.querySelectorAll('[data-edit-collection]').forEach(button=>button.onclick=()=>receiptModal(groupedCollections().find(item=>item.id===button.dataset.editCollection)));
  document.querySelectorAll('[data-delete-collection]').forEach(button=>button.onclick=()=>deleteCollection(button.dataset.deleteCollection));
  document.querySelectorAll('[data-move-payment]').forEach(button=>button.onclick=()=>moveCollectionPayment(button.dataset.movePayment));
  document.querySelectorAll('[data-preview-payment]').forEach(button=>button.onclick=()=>previewPayment(button.dataset.previewPayment,button.dataset.paymentDue));
  document.querySelectorAll('[data-close-payment]').forEach(button=>button.onclick=()=>closePayment(button.dataset.closePayment,button.dataset.paymentDue));
  document.querySelectorAll('[data-open-worker-schedule]').forEach(button=>button.onclick=()=>userModal(S.team.find(item=>item.id===button.dataset.openWorkerSchedule)));
  document.querySelectorAll('[data-mark-paid]').forEach(button=>button.onclick=()=>markPaid(button.dataset.markPaid));
  document.querySelectorAll('[data-reopen-payment]').forEach(button=>button.onclick=()=>reopenPayment(button.dataset.reopenPayment));
  document.querySelectorAll('[data-statement]').forEach(button=>button.onclick=()=>printStatement(button.dataset.statement));
  const newModel=document.querySelector('#newFinishedModel');if(newModel)newModel.onclick=()=>modelModal();
  document.querySelectorAll('[data-edit-finished-model]').forEach(button=>button.onclick=()=>modelModal(PR.models.find(item=>item.id===button.dataset.editFinishedModel)));
  document.querySelectorAll('[data-delete-finished-model]').forEach(button=>button.onclick=()=>deleteModel(button.dataset.deleteFinishedModel));
  const newColor=document.querySelector('#newProductionColor');if(newColor)newColor.onclick=()=>colorModal();
  document.querySelectorAll('[data-edit-production-color]').forEach(button=>button.onclick=()=>colorModal(PR.colors.find(color=>color.id===button.dataset.editProductionColor)));
  document.querySelectorAll('[data-delete-production-color]').forEach(button=>button.onclick=()=>deleteProductionColor(button.dataset.deleteProductionColor));
  const exportButton=document.querySelector('#exportProduction');if(exportButton)exportButton.onclick=exportProduction;
}

function closeModalBindings(){document.querySelectorAll('[data-production-close]').forEach(button=>button.onclick=()=>document.querySelector('#modal').innerHTML='')}

function receiptModal(receipt={}){
  const items=receipt.items?.length?receipt.items:[{}],selectedWorker=receipt.worker_id||S.profile.id,reopening=Boolean(receipt.items?.some(item=>item.closing_id));
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box large" id="productionReceiptForm"><div class="modal-head"><div><p class="eyebrow">CONFERÊNCIA DA COLETA</p><h2>${reopening?'Reabrir e complementar recebimento':receipt.id?'Editar recebimento':'Novo recebimento'}</h2><span>Adicione todos os modelos recebidos nesta coleta.</span></div><button type="button" data-production-close>×</button></div>${reopening?'<div class="production-reopen-note"><b>Correção de coleta fechada</b><span>Você pode incluir a caixa encontrada ou corrigir a conferência. A colaboradora e a data original serão mantidas, e os totais da semana serão recalculados automaticamente.</span></div>':''}<div class="form collection-header-fields"><label>Colaboradora<select name="worker_id" required ${reopening?'disabled':''}><option value="">Selecione</option>${PR.workers.map(worker=>`<option value="${worker.id}" ${worker.id===selectedWorker?'selected':''}>${esc(worker.full_name)}</option>`).join('')}</select></label><label>Data do recebimento<input name="received_on" type="date" max="${today()}" value="${receipt.received_on||today()}" required ${reopening?'readonly':''}></label><label class="wide">Identificação da coleta/caixas<input name="box_reference" maxlength="80" value="${esc(receipt.box_reference||'')}" placeholder="Ex.: Caixas 12 e 13 (opcional)"></label></div><section class="collection-items-editor"><div class="collection-items-head"><div><small>PRODUTOS DA COLETA</small><b>Adicione modelo por modelo</b></div><button type="button" class="outline compact-action" id="addProductionItem">＋ Adicionar outro produto</button></div><div id="productionItems"></div></section><div class="production-calculation conference-result collection-total"><small>RESUMO DO RECEBIMENTO</small><b id="productionCollectionDifference" class="match">Contagem correta</b><span id="productionCollectionTotals">0 itens • 0 un. oficiais</span>${isAdmin()?`<div class="conference-payment"><small>VALOR TOTAL PELA CONTAGEM OFICIAL</small><strong id="productionCalculated">${money(0)}</strong></div>`:''}</div><div class="form"><label class="wide">Observação da conferência<textarea name="notes" placeholder="Opcional: explique avarias ou diferenças encontradas">${esc(receipt.notes||'')}</textarea></label><div class="form-actions"><button type="button" class="outline" data-production-close>Cancelar</button><button class="primary">${reopening?'Salvar correção da coleta':'Salvar recebimento completo'}</button></div></div></form></div>`;
  const form=document.querySelector('#productionReceiptForm'),itemsRoot=document.querySelector('#productionItems');
  const updateTotals=()=>{const rows=[...itemsRoot.querySelectorAll('.production-item-row')],totals=rows.reduce((sum,row)=>{const declared=Number(row.querySelector('[name="declared_quantity"]').value||0),official=Number(row.querySelector('[name="quantity"]').value||0),model=PR.models.find(item=>item.id===row.querySelector('[name="model_id"]').value);sum.declared+=declared;sum.official+=official;sum.amount+=paymentFor(official,model?.rate_per_100||0);return sum},{declared:0,official:0,amount:0}),difference=totals.official-totals.declared,output=document.querySelector('#productionCollectionDifference');output.className=difference<0?'shortage':difference>0?'surplus':'match';output.textContent=difference<0?`${units(Math.abs(difference))} faltando no total`:difference>0?`${units(difference)} a mais no total`:'Contagem total correta';document.querySelector('#productionCollectionTotals').textContent=`${rows.length} ${rows.length===1?'item':'itens'} • ${units(totals.declared)} informadas • ${units(totals.official)} oficiais`;const payment=document.querySelector('#productionCalculated');if(payment)payment.textContent=money(totals.amount)};
  const addItem=item=>{const row=document.createElement('article'),selectedModel=PR.models.find(model=>model.id===item.model_id)||PR.models.find(model=>model.active);row.className='production-item-row';row.innerHTML=`<label>Modelo<select name="model_id" required><option value="">Selecione</option>${PR.models.filter(model=>model.active||model.id===item.model_id).map(model=>`<option value="${model.id}" ${model.id===selectedModel?.id?'selected':''}>${esc(model.name)}</option>`).join('')}</select></label><label data-item-color>Cor</label><label>Quantidade informada<input name="declared_quantity" type="number" inputmode="numeric" min="0" step="1" value="${item.declared_quantity??item.quantity??''}" required></label><label>Contagem oficial<input name="quantity" type="number" inputmode="numeric" min="0" step="1" value="${item.quantity??''}" required></label><div class="item-difference"><small>DIFERENÇA</small><b class="match">Contagem correta</b></div><button type="button" class="danger compact-action remove-production-item">Remover</button>`;itemsRoot.appendChild(row);const modelSelect=row.querySelector('[name="model_id"]'),colorLabel=row.querySelector('[data-item-color]');const updateColor=value=>{const available=PR.colors.filter(color=>color.active||String(color.name).toLocaleLowerCase('pt-BR')===String(value||'').toLocaleLowerCase('pt-BR')),selected=productionColor(value)?.name||available.find(color=>color.active)?.name||'';colorLabel.innerHTML=`Cor<div class="production-color-select"><i style="--production-color:${esc(productionColorHex(selected))}"></i><select name="color" required ${available.length?'':'disabled'}>${available.length?available.map(color=>`<option value="${esc(color.name)}" ${color.name===selected?'selected':''}>${esc(color.name)}${color.active?'':' (inativa)'}</option>`).join(''):'<option value="">Cadastre uma cor</option>'}</select></div>`;const colorSelect=colorLabel.querySelector('[name="color"]'),swatch=colorLabel.querySelector('i');colorSelect.onchange=()=>{swatch.style.setProperty('--production-color',productionColorHex(colorSelect.value));updateRow()}};const updateRow=()=>{const declared=Number(row.querySelector('[name="declared_quantity"]').value||0),official=Number(row.querySelector('[name="quantity"]').value||0),difference=official-declared,output=row.querySelector('.item-difference b');output.className=difference<0?'shortage':difference>0?'surplus':'match';output.textContent=difference<0?`${units(Math.abs(difference))} faltando`:difference>0?`${units(difference)} a mais`:'Contagem correta';updateTotals()};modelSelect.onchange=()=>{updateColor('');updateRow()};row.querySelector('[name="declared_quantity"]').oninput=updateRow;row.querySelector('[name="quantity"]').oninput=updateRow;row.querySelector('.remove-production-item').onclick=()=>{if(itemsRoot.querySelectorAll('.production-item-row').length===1)return alert('O recebimento precisa ter pelo menos um produto.');row.remove();updateTotals()};updateColor(item.color);updateRow()};
  items.forEach(addItem);document.querySelector('#addProductionItem').onclick=()=>addItem({});closeModalBindings();
  form.onsubmit=async event=>{event.preventDefault();const button=event.submitter,f=new FormData(form),payloadItems=[...itemsRoot.querySelectorAll('.production-item-row')].map(row=>({model_id:row.querySelector('[name="model_id"]').value,color:row.querySelector('[name="color"]').value,declared_quantity:Number(row.querySelector('[name="declared_quantity"]').value),quantity:Number(row.querySelector('[name="quantity"]').value)}));if(payloadItems.some(item=>!item.model_id||!item.color))return alert('Preencha o modelo e a cor de todos os produtos.');if(payloadItems.some(item=>!Number.isInteger(item.declared_quantity)||item.declared_quantity<0))return alert('Informe as quantidades das folhas em unidades inteiras.');if(payloadItems.some(item=>!Number.isInteger(item.quantity)||item.quantity<0))return alert('Informe as contagens oficiais em unidades inteiras.');button.disabled=true;const payload={p_worker_id:reopening?receipt.worker_id:f.get('worker_id'),p_received_on:reopening?receipt.received_on:f.get('received_on'),p_box_reference:f.get('box_reference')||null,p_notes:f.get('notes')||null,p_items:payloadItems};try{await rpc(receipt.id?'update_finished_production_collection':'create_finished_production_collection',receipt.id?{p_collection_id:receipt.id,...payload}:payload);await refreshProduction(reopening?'Coleta reaberta, corrigida e recalculada com segurança.':'Recebimento completo salvo com segurança.')}catch(error){alert(error.message);button.disabled=false}};
}

async function deleteCollection(id){if(!confirm('Excluir este recebimento completo e todos os produtos dele? Esta ação ficará registrada no histórico.'))return;try{await rpc('delete_finished_production_collection',{p_collection_id:id});await refreshProduction('Recebimento completo excluído.')}catch(error){alert(error.message)}}

function modelModal(model={}){
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box" id="finishedModelForm"><div class="modal-head"><div><p class="eyebrow">MODELO ACABADO</p><h2>${model.id?'Editar modelo':'Novo modelo'}</h2></div><button type="button" data-production-close>×</button></div><div class="form"><label>Nome do modelo<input name="name" value="${esc(model.name||'')}" required></label><label>Valor por 100 unidades<input name="rate_per_100" type="number" min="0" step=".01" value="${model.rate_per_100??2.5}" required></label><div class="wide model-global-colors"><small>CORES AUTOMÁTICAS</small><b>${PR.colors.filter(color=>color.active).length} cores ativas serão adicionadas a este modelo</b><div>${PR.colors.filter(color=>color.active).slice(0,8).map(color=>colorChip(color.name)).join('')}</div><span>As cores são administradas uma única vez na aba Cores e valem para todos os modelos.</span></div><label>Foto do modelo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><label class="check"><input name="active" type="checkbox" ${model.active!==false?'checked':''}>Modelo ativo</label><label class="wide">Observações<textarea name="notes">${esc(model.notes||'')}</textarea></label><div class="form-actions"><button type="button" class="outline" data-production-close>Cancelar</button><button class="primary">Salvar modelo</button></div></div></form></div>`;
  closeModalBindings();document.querySelector('#finishedModelForm').onsubmit=async event=>{event.preventDefault();const button=event.submitter,f=new FormData(event.target),data={name:String(f.get('name')).trim(),rate_per_100:pn(f.get('rate_per_100')),notes:f.get('notes')||null,active:f.get('active')==='on'};button.disabled=true;try{const file=f.get('photo');if(file?.size){if(file.size>2097152)throw Error('A foto deve ter no máximo 2 MB.');if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use uma imagem JPG, PNG ou WebP.');const path='finished-models/'+crypto.randomUUID()+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'-');await json(await fetch(API+'/storage/v1/object/product-images/'+path,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+S.session.access_token,'Content-Type':file.type},body:file}));data.image_path=path}if(!model.id)data.created_by=S.profile.id;await rest(model.id?'finished_product_models?id=eq.'+model.id:'finished_product_models',{method:model.id?'PATCH':'POST',body:JSON.stringify(data)});await refreshProduction('Modelo salvo com o catálogo global de cores.')}catch(error){alert(error.message);button.disabled=false}};
}

function colorModal(color={}){
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box compact-modal" id="productionColorForm"><div class="modal-head"><div><p class="eyebrow">COR PADRÃO</p><h2>${color.id?'Editar cor':'Nova cor'}</h2><span>Esta cor ficará disponível automaticamente em todos os modelos.</span></div><button type="button" data-production-close>×</button></div><div class="production-color-form-preview"><i id="productionColorPreview" style="--production-color:${esc(color.hex_code||'#EE8FBB')}"></i><b id="productionColorPreviewName">${esc(color.name||'Nova cor')}</b></div><div class="form"><label>Nome da cor<input name="name" maxlength="60" value="${esc(color.name||'')}" placeholder="Ex.: Rosa bebê" required></label><label>Tonalidade visual<input name="hex_code" type="color" value="${esc(color.hex_code||'#EE8FBB')}"></label><label>Ordem de exibição<input name="sort_order" type="number" min="0" max="9999" step="1" value="${color.sort_order??PR.colors.length*10}"></label><label class="check"><input name="active" type="checkbox" ${color.active!==false?'checked':''}>Cor ativa em todos os modelos</label><div class="form-actions"><button type="button" class="outline" data-production-close>Cancelar</button><button class="primary">Salvar cor</button></div></div></form></div>`;
  closeModalBindings();const form=document.querySelector('#productionColorForm'),preview=document.querySelector('#productionColorPreview'),previewName=document.querySelector('#productionColorPreviewName'),nameInput=form.elements.namedItem('name'),hexInput=form.elements.namedItem('hex_code');hexInput.oninput=()=>preview.style.setProperty('--production-color',hexInput.value);nameInput.oninput=()=>previewName.textContent=nameInput.value||'Nova cor';form.onsubmit=async event=>{event.preventDefault();const button=event.submitter,f=new FormData(form);button.disabled=true;try{await rpc('admin_save_finished_production_color',{p_color_id:color.id||null,p_name:String(f.get('name')).trim(),p_hex_code:String(f.get('hex_code')).toUpperCase(),p_active:f.get('active')==='on',p_sort_order:Number(f.get('sort_order')||0)});await refreshProduction('Cor salva e disponibilizada automaticamente para todos os modelos.')}catch(error){alert(error.message);button.disabled=false}};
}

async function deleteProductionColor(id){
  const color=PR.colors.find(item=>item.id===id);if(!color||!confirm(`Excluir a cor “${color.name}”?\n\nSe ela já foi usada em um recebimento, o sistema preservará o histórico e pedirá para deixá-la inativa.`))return;
  try{await rpc('admin_delete_finished_production_color',{p_color_id:id});await refreshProduction('Cor excluída do catálogo padrão.')}catch(error){alert(error.message)}
}

async function deleteModel(id){if(!confirm('Excluir este modelo? Modelos já usados em recebimentos não podem ser excluídos.'))return;try{await rest('finished_product_models?id=eq.'+id,{method:'DELETE'});await refreshProduction('Modelo excluído.')}catch(error){alert('Este modelo possui recebimentos registrados. Você pode editá-lo e deixá-lo inativo.')}}
async function closePayment(workerId,paymentDue){if(!confirm(`Fechar o pagamento previsto para ${dateBr(paymentDue)}? Os recebimentos incluídos ficarão protegidos.`))return;try{await rpc('admin_close_production_payment',{p_worker_id:workerId,p_payment_due_on:paymentDue});await refreshProduction('Pagamento fechado com a agenda individual.')}catch(error){alert(error.message)}}
async function markPaid(id){const notes=prompt('Observação do pagamento (opcional):')||'';if(!confirm('Confirmar que este pagamento foi realizado?'))return;try{await rpc('admin_mark_production_payment_paid',{p_closing_id:id,p_notes:notes});await refreshProduction('Pagamento marcado como realizado.')}catch(error){alert(error.message)}}
async function reopenPayment(id){if(!confirm('Reabrir este pagamento para correções? Os recebimentos voltarão à agenda individual.'))return;try{await rpc('admin_reopen_production_payment',{p_closing_id:id});await refreshProduction('Pagamento reaberto para correções.')}catch(error){alert(error.message)}}

async function previewPayment(workerId,paymentDue){
  try{const rows=await rpc('admin_preview_production_payment',{p_worker_id:workerId,p_payment_due_on:paymentDue}),worker=PR.paymentOverview.find(item=>item.worker_id===workerId),total=rows.reduce((sum,row)=>sum+pn(row.line_amount),0);document.querySelector('#modal').innerHTML=`<div class="modal"><div class="modal-box large"><div class="modal-head"><div><p class="eyebrow">CONFERÊNCIA DO PAGAMENTO</p><h2>${esc(worker?.worker_name||'Colaboradora')}</h2><span>Pagamento previsto para ${dateBr(paymentDue)}</span></div><button type="button" data-production-close>×</button></div><div class="table-wrap payment-preview-table"><table class="production-table"><thead><tr><th>Recebimento</th><th>Modelo</th><th>Cor</th><th>Oficial</th><th>Valor</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${dateBr(row.received_on)}<small>${esc(row.box_reference||'Sem identificação')}</small></td><td>${esc(row.model_name)}</td><td>${colorChip(row.color)}</td><td>${units(row.quantity)}</td><td>${preciseMoney(row.line_amount)}</td></tr>`).join('')}</tbody></table></div><div class="payment-preview-total"><span>${rows.length} ${rows.length===1?'item':'itens'}</span><b>Total: ${money(total)}</b></div><div class="form-actions"><button type="button" class="outline" data-production-close>Voltar</button>${worker?.ready_to_close?`<button type="button" class="primary" id="confirmClosePayment">Fechar pagamento</button>`:''}</div></div></div>`;closeModalBindings();const confirmButton=document.querySelector('#confirmClosePayment');if(confirmButton)confirmButton.onclick=()=>closePayment(workerId,paymentDue)}catch(error){alert(error.message)}}

function moveCollectionPayment(collectionId){
  const collection=groupedCollections().find(item=>item.id===collectionId);document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box compact-modal" id="movePaymentForm"><div class="modal-head"><div><p class="eyebrow">AJUSTAR PAGAMENTO</p><h2>Mover recebimento</h2><span>${esc(collection?.worker_name||'Colaboradora')} · recebido em ${dateBr(collection?.received_on)}</span></div><button type="button" data-production-close>×</button></div><div class="form"><label>Nova data de pagamento<input name="payment_on" type="date" min="${collection?.received_on||today()}" value="${collection?.planned_payment_on||''}" required></label><label class="wide">Motivo da alteração<textarea name="reason" minlength="5" placeholder="Ex.: caixa recebida após o fechamento" required></textarea></label><div class="form-actions"><button type="button" class="outline" data-production-close>Cancelar</button><button class="primary">Salvar alteração</button></div></div></form></div>`;closeModalBindings();document.querySelector('#movePaymentForm').onsubmit=async event=>{event.preventDefault();const button=event.submitter,f=new FormData(event.target);button.disabled=true;try{await rpc('admin_move_production_collection_payment',{p_collection_id:collectionId,p_payment_on:f.get('payment_on'),p_reason:f.get('reason')});await refreshProduction('Recebimento movido e alteração registrada na auditoria.')}catch(error){alert(error.message);button.disabled=false}};
}

function exportProduction(){
  const clean=value=>`"${String(value??'').replaceAll('"','""')}"`,rows=groupReport(),content='\ufeff'+[['Colaboradora','Modelo','Cor','Quantidade informada','Contagem oficial','Diferença','Valor proporcional'],...rows.map(row=>[row.worker_name,row.model_name,row.color,row.declared_quantity,row.quantity,row.quantity-row.declared_quantity,row.amount.toFixed(4)])].map(row=>row.map(clean).join(';')).join('\r\n'),url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`harmony-producao-${weekBounds(PR.weekStart).start}.csv`;link.hidden=true;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}

async function printStatement(id){
  try{
    const rows=await rpc('admin_production_payment_statement',{p_closing_id:id});if(!rows.length)throw Error('Fechamento sem lançamentos.');
    const first=rows[0],area=document.createElement('section');area.id='productionPrint';
    area.innerHTML=`<header><img src="logo.jpg" alt="Harmony Store"><div><small>HARMONY STORE OFICIAL</small><h1>Demonstrativo de produção</h1><p>Pagamento #${String(first.protocol).padStart(4,'0')} · previsto para ${dateBr(first.payment_due_on)}</p></div></header><div class="print-summary"><div><small>COLABORADORA</small><b>${esc(first.worker_name)}</b></div><div><small>CICLO DE RECEBIMENTOS</small><b>${dateBr(first.cycle_start_on)} a ${dateBr(first.cycle_end_on)}</b></div><div><small>SITUAÇÃO</small><b>${first.status==='paid'?'Pago':'Fechado'}</b></div></div><table><thead><tr><th>Data</th><th>Caixa</th><th>Modelo/cor</th><th>Informada</th><th>Oficial</th><th>Diferença</th><th>Valor</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${dateBr(row.received_on)}</td><td>${esc(row.box_reference||'—')}</td><td>${esc(row.model_name)} / ${esc(row.color)}</td><td>${units(row.declared_quantity)}</td><td>${units(row.quantity)}</td><td>${row.quantity_difference>0?'+':''}${units(row.quantity_difference)}</td><td>${preciseMoney(row.line_amount)}</td></tr>`).join('')}</tbody></table><footer><div><small>TOTAL OFICIAL PRODUZIDO</small><b>${units(first.total_quantity)}</b></div><div class="print-total"><small>TOTAL A PAGAR</small><b>${money(first.total_amount)}</b></div></footer><div class="signatures"><span>Responsável Harmony Store</span><span>${esc(first.worker_name)}</span></div><p class="print-note">O pagamento utiliza exclusivamente a contagem oficial: quantidade oficial × valor por 100 ÷ 100. Documento gerado em ${new Date().toLocaleString('pt-BR')}.</p>`;
    document.body.appendChild(area);window.onafterprint=()=>{area.remove();window.onafterprint=null};window.print();
  }catch(error){alert(error.message)}
}

new MutationObserver(productionNav).observe(document.body,{childList:true,subtree:true});
productionNav();
window.HarmonyProduction=Object.freeze({state:PR,paymentFor,differenceFor,weekBounds,groupReport,groupedCollections,canSeeReceiptValues,canSeePaymentValues});
})();
