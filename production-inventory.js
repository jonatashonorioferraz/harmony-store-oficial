(()=>{
'use strict';

const PI={loaded:false,loading:null,balance:[],boxes:[],boxCount:0,models:[],colors:[],workers:[],movements:[],byWorker:[],tab:'balance',query:'',colorId:'',onlyAvailable:false,from:'',to:'',workerId:''};
const LIVE_COUNTER_INTERVAL=20000;
let liveCounterTimer=null,liveCounterBusy=false;
const canManage=()=>['admin','receiver'].includes(S?.profile?.role);
const n=value=>Number(value||0);
const qty=value=>n(value).toLocaleString('pt-BR')+' un.';
const boxCode=value=>'CX-'+String(n(value)).padStart(6,'0');
const today=()=>new Date().toISOString().slice(0,10);
const br=value=>value?new Date(value+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const when=value=>value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
const imageUrl=path=>path?API+'/storage/v1/object/public/product-images/'+String(path).split('/').map(encodeURIComponent).join('/'):'';
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
const movementLabels={entry:'Entrada',exit:'Transferência',adjustment_in:'Ajuste positivo',adjustment_out:'Ajuste negativo'};

function reset(){stopLiveCounter();Object.assign(PI,{loaded:false,loading:null,balance:[],boxes:[],boxCount:0,models:[],colors:[],workers:[],movements:[],byWorker:[]})}

async function load(force=false){
  if(!canManage()){reset();return}
  if(PI.loaded&&!force)return;
  if(PI.loading)return PI.loading;
  PI.loading=(async()=>{
    const [models,colors,workers,balance,boxes,boxCount,movements,byWorker]=await Promise.all([
      rpc('list_finished_product_models',{}),
      rpc('list_finished_production_colors',{}),
      rpc('list_production_inventory_workers',{}),
      rpc('list_production_inventory_balance',{p_query:null,p_color_id:null,p_only_available:false}),
      rpc('list_available_production_inventory_boxes',{}),
      rpc('get_production_inventory_available_box_count',{}),
      rpc('list_production_inventory_movements_v2',{p_from:PI.from||null,p_to:PI.to||null,p_worker_id:null,p_model_id:null,p_color_id:null}),
      rpc('list_production_inventory_by_worker',{p_from:PI.from||null,p_to:PI.to||null,p_worker_id:PI.workerId||null})
    ]);
    Object.assign(PI,{models,colors,workers,balance,boxes,boxCount:n(boxCount),movements,byWorker,loaded:true});
    updateLiveCounter();
  })().finally(()=>PI.loading=null);
  return PI.loading;
}

async function refresh(message){PI.loaded=false;await load(true);await render();if(message)toast(message)}

function stopLiveCounter(){
  if(liveCounterTimer)clearInterval(liveCounterTimer);
  liveCounterTimer=null;
}

function updateLiveCounter(value=PI.boxCount){
  const count=Math.max(0,n(value)),number=document.querySelector('#inventoryLiveBoxCount'),label=document.querySelector('#inventoryLiveBoxLabel'),updated=document.querySelector('#inventoryLiveBoxUpdated');
  PI.boxCount=count;
  if(number)number.textContent=count.toLocaleString('pt-BR');
  if(label)label.textContent=count===1?'caixa disponível':'caixas disponíveis';
  if(updated)updated.textContent='Atualizado agora';
}

const catalogSignature=rows=>JSON.stringify((rows||[]).map(row=>[row.id,row.name||row.full_name,row.active,row.image_path,row.hex_code]));
function refreshEntryCatalogOptions(){
  const form=document.querySelector('#inventoryEntryForm');if(!form)return;
  const replace=(select,items,placeholder,label)=>{const selected=select.value;select.innerHTML=`<option value="">${placeholder}</option>${items.map(item=>`<option value="${item.id}">${esc(item[label])}</option>`).join('')}`;if(items.some(item=>item.id===selected))select.value=selected};
  replace(form.model_id,PI.models.filter(model=>model.active),'Selecione','name');
  replace(form.color_id,PI.colors.filter(color=>color.active),'Selecione','name');
  replace(form.worker_id,PI.workers,'Selecione a colaboradora','full_name');
  form.model_id.dispatchEvent(new Event('change'));
}

async function syncLiveCounter(){
  if(S.view!=='production-inventory'||!canManage()){stopLiveCounter();return}
  if(liveCounterBusy)return;
  liveCounterBusy=true;
  try{
    const [boxCount,models,colors,workers]=await Promise.all([
      rpc('get_production_inventory_available_box_count',{}),
      rpc('list_finished_product_models',{}),
      rpc('list_finished_production_colors',{}),
      rpc('list_production_inventory_workers',{})
    ]),count=n(boxCount),catalogChanged=catalogSignature(models)!==catalogSignature(PI.models)||catalogSignature(colors)!==catalogSignature(PI.colors)||catalogSignature(workers)!==catalogSignature(PI.workers);
    Object.assign(PI,{models,colors,workers});
    if(catalogChanged)refreshEntryCatalogOptions();
    if(PI.tab==='boxes'&&count!==PI.boxes.length){
      PI.boxes=await rpc('list_available_production_inventory_boxes',{});
      const gallery=document.querySelector('#inventoryBoxGallery');
      if(gallery){gallery.innerHTML=boxCards();bindBoxGalleryActions()}
    }
    updateLiveCounter(count);
  }catch{
    const updated=document.querySelector('#inventoryLiveBoxUpdated');
    if(updated)updated.textContent='Nova tentativa automática em instantes';
  }finally{liveCounterBusy=false}
}

function startLiveCounter(){
  stopLiveCounter();
  updateLiveCounter();
  liveCounterTimer=setInterval(syncLiveCounter,LIVE_COUNTER_INTERVAL);
}

function liveCounter(){
  const count=Math.max(0,n(PI.boxCount));
  return `<aside class="production-inventory-live-counter" aria-label="Contador em tempo real de caixas disponíveis"><span class="production-inventory-live-icon" aria-hidden="true">📦</span><span class="production-inventory-live-copy"><small>ESTOQUE EM TEMPO REAL</small><strong><span id="inventoryLiveBoxCount">${count.toLocaleString('pt-BR')}</span> <span id="inventoryLiveBoxLabel">${count===1?'caixa disponível':'caixas disponíveis'}</span></strong><em id="inventoryLiveBoxUpdated">Atualizado agora</em></span><i aria-hidden="true"></i></aside>`;
}

function injectNav(){
  if(!canManage())return;
  const root=document.querySelector('.sidebar nav');if(!root)return;
  let button=root.querySelector('[data-view="production-inventory"]');
  if(!button){
    button=document.createElement('button');button.className='nav';button.dataset.view='production-inventory';
    button.innerHTML='<i>🧼</i>Inventário de produção';
    button.onclick=()=>{S.view='production-inventory';renderApp()};
    const production=root.querySelector('[data-view="production"]'),profile=root.querySelector('[data-view="profile"]');
    if(production)production.insertAdjacentElement('afterend',button);else root.insertBefore(button,profile||null);
  }
  button.classList.toggle('active',S.view==='production-inventory');
}

function injectHomeShortcut(){
  if(!canManage()||S.view!=='home')return;
  const page=document.querySelector('#page .page');
  if(!page||page.querySelector('#productionInventoryShortcut'))return;
  const button=document.createElement('button');
  button.id='productionInventoryShortcut';button.className='production-inventory-home-shortcut';button.type='button';
  button.setAttribute('aria-label','Abrir Inventário de Produção');
  button.innerHTML='<span class="inventory-shortcut-sparkles" aria-hidden="true">✦</span><b>Inventário de Produção</b><span class="inventory-shortcut-arrow" aria-hidden="true">›</span>';
  button.onclick=()=>{S.view='production-inventory';renderApp()};
  const anchor=page.querySelector('.metrics');page.insertBefore(button,anchor||page.children[1]||null);
}

function tabs(){return `<nav class="production-inventory-tabs" aria-label="Áreas do inventário"><button class="${PI.tab==='balance'?'active':''}" data-inventory-tab="balance">📦 Saldo atual</button><button class="${PI.tab==='boxes'?'active':''}" data-inventory-tab="boxes">🗃️ Caixas em estoque</button><button class="${PI.tab==='movements'?'active':''}" data-inventory-tab="movements">↔ Movimentações</button><button class="${PI.tab==='workers'?'active':''}" data-inventory-tab="workers">👩‍🎨 Por colaboradora</button></nav>`}

function metrics(){
  const available=PI.balance.filter(row=>n(row.quantity)>0),total=available.reduce((sum,row)=>sum+n(row.quantity),0),models=new Set(available.map(row=>row.model_id)).size,producers=new Set(PI.byWorker.map(row=>row.worker_id)).size;
  return `<div class="production-inventory-metrics"><article><small>UNIDADES EM ESTOQUE</small><b>${total.toLocaleString('pt-BR')}</b><span>Saldo físico atual</span></article><article><small>MODELOS COM SALDO</small><b>${models}</b><span>Organizados por cor</span></article><article><small>COMBINAÇÕES</small><b>${available.length}</b><span>Modelo + cor</span></article><article><small>COLABORADORAS</small><b>${producers}</b><span>Com entradas registradas</span></article></div>`;
}

function boxCards(){
  return PI.boxes.map((entry,index)=>`<article class="production-inventory-crate-card" data-box-id="${entry.id}"><div class="production-inventory-crate-code"><i aria-hidden="true"></i><b>${esc(entry.box_code||boxCode(entry.box_number))}</b><i aria-hidden="true"></i></div><div class="production-inventory-crate-shell">${index===0?'<span class="production-inventory-newest-box">ÚLTIMA CADASTRADA</span>':''}<div class="production-inventory-crate-label"><div class="production-inventory-crate-product"><span class="production-inventory-crate-photo">${entry.image_path?`<img src="${esc(imageUrl(entry.image_path))}" alt="${esc(entry.model_name)}">`:'<i aria-hidden="true">🧼</i>'}</span><span><b>${esc(entry.model_name)}</b><small><i style="--inventory-color:${esc(entry.color_hex)}"></i>${esc(entry.color_name)}</small></span></div><div class="production-inventory-crate-quantity"><small>QUANTIDADE</small><strong>${qty(entry.current_quantity)}</strong></div><div class="production-inventory-crate-meta"><span><small>PRODUÇÃO</small><b>${esc(entry.worker_name)}</b></span><span><small>ENTRADA</small><b>${br(entry.entry_on)}</b></span></div></div></div><button type="button" class="production-inventory-crate-transfer" data-inventory-box-transfer="${entry.id}" aria-label="Transferir a caixa ${esc(entry.box_code||boxCode(entry.box_number))} completa para o e-commerce">Transferir caixa</button></article>`).join('')||'<div class="empty production-inventory-boxes-empty">Nenhuma caixa disponível no estoque neste momento.</div>';
}

function boxesView(){
  return `<section class="card production-inventory-section production-inventory-box-gallery-section"><div class="card-head"><div><p class="eyebrow">ESTOQUE FÍSICO</p><h2>Caixas disponíveis</h2><span>A última caixa cadastrada aparece primeiro. Cada caixa é transferida integralmente.</span></div><span class="production-inventory-box-order">↓ Mais novas primeiro</span></div><div class="production-inventory-box-gallery" id="inventoryBoxGallery">${boxCards()}</div></section>`;
}

function balanceRows(){
  const term=normalize(PI.query),rows=PI.balance.filter(row=>(!term||normalize(row.model_name).includes(term)||normalize(row.color_name).includes(term))&&(!PI.colorId||row.color_id===PI.colorId)&&(!PI.onlyAvailable||n(row.quantity)>0));
  return rows.map(row=>`<button class="production-inventory-row ${n(row.quantity)?'has-stock':'no-stock'}" data-inventory-detail="${row.model_id}" data-color-id="${row.color_id}"><span class="production-inventory-photo">${row.image_path?`<img src="${esc(imageUrl(row.image_path))}" alt="${esc(row.model_name)}">`:'<i>🧼</i>'}</span><span class="production-inventory-model"><b>${esc(row.model_name)}</b><small>${n(row.entry_count)} caixa(s) disponível(is)</small></span><span class="production-inventory-color"><i style="--inventory-color:${esc(row.color_hex)}"></i><b>${esc(row.color_name)}</b></span><strong>${qty(row.quantity)}</strong><span class="production-inventory-open">Ver detalhes →</span></button>`).join('')||'<div class="empty">Nenhum saldo corresponde aos filtros escolhidos.</div>';
}

function balanceView(){
  return `${metrics()}<section class="card production-inventory-section"><div class="production-inventory-toolbar"><label>Buscar modelo ou cor<input id="inventorySearch" type="search" value="${esc(PI.query)}" placeholder="Digite algumas letras" autocomplete="off"></label><label>Cor<select id="inventoryColor"><option value="">Todas as cores</option>${PI.colors.map(color=>`<option value="${color.id}" ${PI.colorId===color.id?'selected':''}>${esc(color.name)}</option>`).join('')}</select></label><label class="production-inventory-check"><input id="inventoryOnlyAvailable" type="checkbox" ${PI.onlyAvailable?'checked':''}>Somente com saldo</label><span id="inventoryResultCount"></span></div><div class="production-inventory-list-head"><span>Produto</span><span>Modelo</span><span>Cor</span><span>Saldo atual</span><span>Ação</span></div><div id="inventoryBalanceRows">${balanceRows()}</div></section>`;
}

function periodFilters(){return `<section class="card production-inventory-period"><label>De<input id="inventoryFrom" type="date" value="${esc(PI.from)}"></label><label>Até<input id="inventoryTo" type="date" value="${esc(PI.to)}"></label>${PI.tab==='workers'?`<label>Colaboradora<select id="inventoryWorker"><option value="">Todas</option>${PI.workers.map(worker=>`<option value="${worker.id}" ${PI.workerId===worker.id?'selected':''}>${esc(worker.full_name)}</option>`).join('')}</select></label>`:''}<button class="primary compact-action" id="applyInventoryPeriod">Aplicar filtros</button><button class="outline compact-action" id="clearInventoryPeriod">Limpar</button></section>`}

function movementView(){
  return `${periodFilters()}<section class="card production-inventory-section"><div class="card-head"><div><p class="eyebrow">RASTREABILIDADE</p><h2>Histórico de movimentações</h2><span>Entradas, saídas e ajustes, sem apagar o histórico.</span></div><button class="outline compact-action" data-inventory-print="movements">Gerar PDF</button></div><div class="table-wrap"><table class="production-inventory-table"><thead><tr><th>Data</th><th>Movimento</th><th>Modelo / cor</th><th>Colaboradora / caixa</th><th>Quantidade</th><th>Saldo da caixa</th><th>Responsável</th></tr></thead><tbody>${PI.movements.map(row=>`<tr><td>${br(row.occurred_on)}<small>${when(row.created_at)}</small></td><td><span class="inventory-movement ${row.movement_type}">${movementLabels[row.movement_type]||row.movement_type}</span><small>${esc(row.reason||'')}</small></td><td><b>${esc(row.model_name)}</b><span class="production-inventory-color"><i style="--inventory-color:${esc(row.color_hex)}"></i>${esc(row.color_name)}</span></td><td>${esc(row.worker_name)}<small><b>${esc(row.box_code||boxCode(row.box_number))}</b> · ${esc(row.box_reference||'Localização não informada')}</small></td><td><strong>${['exit','adjustment_out'].includes(row.movement_type)?'−':'+'}${qty(row.quantity)}</strong></td><td>${qty(row.balance_before)} → <b>${qty(row.balance_after)}</b></td><td>${esc(row.created_by_name)}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">Nenhuma movimentação neste período.</td></tr>'}</tbody></table></div></section>`;
}

function workersView(){
  const grouped=new Map();PI.byWorker.forEach(row=>{const group=grouped.get(row.worker_id)||{id:row.worker_id,name:row.worker_name,rows:[],received:0,current:0};group.rows.push(row);group.received+=n(row.received_quantity);group.current+=n(row.current_quantity);grouped.set(row.worker_id,group)});
  return `${periodFilters()}<section class="card production-inventory-section"><div class="card-head"><div><p class="eyebrow">ORIGEM DA PRODUÇÃO</p><h2>Produção registrada por colaboradora</h2><span>Histórico operacional, sem valores ou regras de pagamento.</span></div><button class="outline compact-action" data-inventory-print="workers">Gerar PDF</button></div><div class="production-inventory-workers">${[...grouped.values()].map(group=>`<details ${PI.workerId?'open':''}><summary><span class="avatar">${esc(group.name.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase())}</span><span><b>${esc(group.name)}</b><small>${group.rows.length} modelo(s)/cor(es)</small></span><span><small>ENTRADAS</small><strong>${qty(group.received)}</strong></span><span><small>SALDO IDENTIFICADO</small><strong>${qty(group.current)}</strong></span><i>⌄</i></summary><div class="table-wrap"><table class="production-inventory-table"><thead><tr><th>Modelo</th><th>Cor</th><th>Entradas</th><th>Saldo atual</th><th>Lotes</th><th>Última entrada</th></tr></thead><tbody>${group.rows.map(row=>`<tr><td><b>${esc(row.model_name)}</b></td><td><span class="production-inventory-color"><i style="--inventory-color:${esc(row.color_hex)}"></i>${esc(row.color_name)}</span></td><td>${qty(row.received_quantity)}</td><td><strong>${qty(row.current_quantity)}</strong></td><td>${n(row.entry_count)}</td><td>${br(row.latest_entry_on)}</td></tr>`).join('')}</tbody></table></div></details>`).join('')||'<div class="empty">Nenhuma entrada encontrada para os filtros selecionados.</div>'}</div></section>`;
}

async function render(){
  const page=document.querySelector('#page');if(!page||S.view!=='production-inventory'||!canManage())return;
  page.innerHTML='<div class="loading-inline">Carregando Inventário de Produção…</div>';
  try{
    await load();if(S.view!=='production-inventory')return;
    const body=PI.tab==='boxes'?boxesView():PI.tab==='movements'?movementView():PI.tab==='workers'?workersView():balanceView();
    page.innerHTML=`<div class="page production-inventory-page">${head('CONTROLE INTERNO','Inventário de Produção','Saldo dos mini sabonetes acabados, com origem por colaboradora, caixa e data. Não altera pagamentos nem matérias-primas.','<button class="outline" data-inventory-print="balance">📄 Relatório PDF</button><button class="primary" id="newInventoryEntry">＋ Registrar nova caixa</button>')}${liveCounter()}${tabs()}${body}</div>`;
    bind();startLiveCounter();
  }catch(error){page.innerHTML=`<div class="page">${head('INVENTÁRIO DE PRODUÇÃO','Atualização necessária','O módulo foi preparado, mas o banco ainda precisa receber a migração.') }<section class="card intelligence-error"><h2>Banco ainda não atualizado</h2><p>${esc(error.message)}</p></section></div>`}
}

function bind(){
  document.querySelectorAll('[data-inventory-tab]').forEach(button=>button.onclick=async()=>{PI.tab=button.dataset.inventoryTab;if(PI.tab!=='balance'){PI.loaded=false}await render()});
  document.querySelector('#newInventoryEntry')?.addEventListener('click',()=>entryModal());
  document.querySelectorAll('[data-inventory-detail]').forEach(button=>button.onclick=()=>openDetail(button.dataset.inventoryDetail,button.dataset.colorId));
  const search=document.querySelector('#inventorySearch'),color=document.querySelector('#inventoryColor'),available=document.querySelector('#inventoryOnlyAvailable');
  const filter=()=>{PI.query=search?.value||'';PI.colorId=color?.value||'';PI.onlyAvailable=Boolean(available?.checked);const root=document.querySelector('#inventoryBalanceRows');if(root)root.innerHTML=balanceRows();document.querySelectorAll('[data-inventory-detail]').forEach(button=>button.onclick=()=>openDetail(button.dataset.inventoryDetail,button.dataset.colorId));const count=document.querySelector('#inventoryResultCount');if(count)count.textContent=`${root?.querySelectorAll('[data-inventory-detail]').length||0} resultado(s)`};
  if(search){search.oninput=filter;search.onsearch=filter}if(color)color.onchange=filter;if(available)available.onchange=filter;filter();
  document.querySelector('#applyInventoryPeriod')?.addEventListener('click',async()=>{PI.from=document.querySelector('#inventoryFrom')?.value||'';PI.to=document.querySelector('#inventoryTo')?.value||'';PI.workerId=document.querySelector('#inventoryWorker')?.value||'';if(PI.from&&PI.to&&PI.from>PI.to)return alert('A data inicial não pode ser posterior à data final.');PI.loaded=false;await render()});
  document.querySelector('#clearInventoryPeriod')?.addEventListener('click',async()=>{PI.from=PI.to=PI.workerId='';PI.loaded=false;await render()});
  document.querySelectorAll('[data-inventory-print]').forEach(button=>button.onclick=()=>printReport(button.dataset.inventoryPrint,button));
  bindBoxGalleryActions();
}

function bindBoxGalleryActions(){
  document.querySelectorAll('[data-inventory-box-transfer]').forEach(button=>button.onclick=()=>{
    const entry=PI.boxes.find(item=>item.id===button.dataset.inventoryBoxTransfer);
    if(entry)actionModal(entry,'transfer',entry.model_id,entry.color_id,'boxes');
  });
}

function closeModal(){document.querySelector('#modal').innerHTML=''}
function modalCloseBindings(){document.querySelectorAll('[data-inventory-close]').forEach(button=>button.onclick=closeModal)}

function entryModal(){
  const activeModels=PI.models.filter(model=>model.active),activeColors=PI.colors.filter(color=>color.active);
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box large production-inventory-modal" id="inventoryEntryForm"><div class="modal-head"><div><p class="eyebrow">ENTRADA DE PRODUTO ACABADO</p><h2>Registrar nova caixa</h2><span>Cada cadastro representa uma caixa física exclusiva no estoque.</span></div><button type="button" data-inventory-close>×</button></div><div class="production-inventory-box-generator"><div><small>CÓDIGO ÚNICO DA CAIXA</small><strong id="inventoryBoxCode">Aguardando geração</strong><span>O código é permanente, não pode ser repetido nem reutilizado.</span></div><button type="button" class="outline" id="generateInventoryBoxCode">✨ Gerar código</button></div><div class="production-inventory-entry-preview"><span id="inventoryEntryPhoto"><i>🧼</i></span><div><small>PRODUTO SELECIONADO</small><b id="inventoryEntryName">Selecione um modelo</b><span id="inventoryEntryColor">A cor aparecerá aqui.</span></div></div><div class="form"><label>Modelo<select name="model_id" required><option value="">Selecione</option>${activeModels.map(model=>`<option value="${model.id}">${esc(model.name)}</option>`).join('')}</select></label><label>Cor<select name="color_id" required><option value="">Selecione</option>${activeColors.map(color=>`<option value="${color.id}">${esc(color.name)}</option>`).join('')}</select></label><label>Quantidade<input name="quantity" type="number" inputmode="numeric" min="1" step="1" required></label><label>Produzido por<select name="worker_id" required><option value="">Selecione a colaboradora</option>${PI.workers.map(worker=>`<option value="${worker.id}">${esc(worker.full_name)}</option>`).join('')}</select></label><label>Data de entrada<input name="entry_on" type="date" max="${today()}" value="${today()}" required></label><label>Localização física<input name="box_reference" maxlength="100" placeholder="Ex.: Prateleira A (opcional)"></label><label class="wide">Observações<textarea name="notes" maxlength="1200" placeholder="Opcional: acabamento, lote ou condição da caixa"></textarea></label><div class="form-actions"><button type="button" class="outline" data-inventory-close>Cancelar</button><button class="primary">Salvar caixa no inventário</button></div></div></form></div>`;
  modalCloseBindings();const form=document.querySelector('#inventoryEntryForm'),model=form.model_id,color=form.color_id,generateButton=document.querySelector('#generateInventoryBoxCode');let generatedBoxNumber=0;
  const preview=()=>{const selectedModel=PI.models.find(item=>item.id===model.value),selectedColor=PI.colors.find(item=>item.id===color.value);document.querySelector('#inventoryEntryPhoto').innerHTML=selectedModel?.image_path?`<img src="${esc(imageUrl(selectedModel.image_path))}" alt="">`:'<i>🧼</i>';document.querySelector('#inventoryEntryName').textContent=selectedModel?.name||'Selecione um modelo';document.querySelector('#inventoryEntryColor').innerHTML=selectedColor?`<i style="--inventory-color:${esc(selectedColor.hex_code)}"></i>${esc(selectedColor.name)}`:'A cor aparecerá aqui.'};model.onchange=preview;color.onchange=preview;
  generateButton.onclick=async()=>{generateButton.disabled=true;generateButton.textContent='Gerando…';try{generatedBoxNumber=n(await rpc('generate_production_inventory_box_number',{}));document.querySelector('#inventoryBoxCode').textContent=boxCode(generatedBoxNumber);generateButton.textContent='✓ Código gerado';generateButton.classList.add('generated')}catch(error){alert(error.message);generateButton.disabled=false;generateButton.textContent='✨ Gerar código'}};
  form.onsubmit=async event=>{event.preventDefault();const button=event.submitter,data=new FormData(form),quantity=Number(data.get('quantity'));if(!generatedBoxNumber)return alert('Clique em Gerar código antes de salvar a caixa.');if(!Number.isInteger(quantity)||quantity<1)return alert('Informe uma quantidade inteira maior que zero.');button.disabled=true;try{const created=await rpc('create_production_inventory_entry_v2',{p_model_id:data.get('model_id'),p_color_id:data.get('color_id'),p_worker_id:data.get('worker_id'),p_quantity:quantity,p_entry_on:data.get('entry_on'),p_box_number:generatedBoxNumber,p_box_reference:data.get('box_reference')||null,p_notes:data.get('notes')||null}),saved=Array.isArray(created)?created[0]:created;closeModal();await refresh(`Caixa ${saved?.box_code||boxCode(generatedBoxNumber)} registrada com rastreabilidade completa.`)}catch(error){alert(error.message);button.disabled=false}};
}

async function openDetail(modelId,colorId){
  document.querySelector('#modal').innerHTML='<div class="modal"><section class="modal-box large"><div class="loading-inline">Carregando caixas…</div></section></div>';
  try{
    const entries=await rpc('list_production_inventory_entries_v3',{p_model_id:modelId,p_color_id:colorId,p_include_depleted:true}),row=PI.balance.find(item=>item.model_id===modelId&&item.color_id===colorId),available=entries.filter(entry=>n(entry.current_quantity)>0),byWorker=new Map();
    entries.forEach(entry=>{const item=byWorker.get(entry.worker_id)||{name:entry.worker_name,original:0,current:0};item.original+=n(entry.original_quantity);item.current+=n(entry.current_quantity);byWorker.set(entry.worker_id,item)});
    document.querySelector('#modal').innerHTML=`<div class="modal"><section class="modal-box large production-inventory-detail" id="inventoryDetail"><div class="modal-head"><div><p class="eyebrow">DETALHE DO ESTOQUE</p><h2>${esc(row?.model_name||entries[0]?.model_name||'Produto')}</h2><span class="production-inventory-color"><i style="--inventory-color:${esc(row?.color_hex||entries[0]?.color_hex||'#D9A3BE')}"></i>${esc(row?.color_name||entries[0]?.color_name||'')}</span></div><div class="actions"><button type="button" class="outline compact-action" id="printInventoryDetail">📄 PDF</button><button type="button" data-inventory-close>×</button></div></div><div class="production-inventory-detail-hero"><span>${row?.image_path?`<img src="${esc(imageUrl(row.image_path))}" alt="">`:'<i>🧼</i>'}</span><div><small>SALDO TOTAL DESTA COR</small><b>${qty(row?.quantity||0)}</b><p>${available.length} caixa(s) disponível(is). Cada caixa é transferida inteira para o estoque do e-commerce.</p></div></div><section class="production-inventory-origin"><h3>Quantidade identificada por colaboradora</h3><div>${[...byWorker.values()].map(item=>`<article><b>${esc(item.name)}</b><span>Produziu ${qty(item.original)}</span><strong>${qty(item.current)} em saldo</strong></article>`).join('')||'<div class="empty">Sem entradas registradas.</div>'}</div></section><section><div class="card-head"><div><p class="eyebrow">CAIXAS DO ESTOQUE</p><h2>Histórico detalhado</h2></div></div><div class="production-inventory-lots">${entries.map(entry=>`<article class="${entry.transferred_at?'transferred':n(entry.current_quantity)?'available':'depleted'}"><header><div><small>CÓDIGO PERMANENTE</small><b>${esc(entry.box_code||boxCode(entry.box_number))}</b><em>${esc(entry.box_reference?`Localização: ${entry.box_reference}`:'Localização não informada')}</em></div><span>${entry.transferred_at?'Transferida ao e-commerce':n(entry.current_quantity)?'Disponível':'Sem saldo'}</span></header><dl><div><dt>Produzido por</dt><dd>${esc(entry.worker_name)}</dd></div><div><dt>Entrada</dt><dd>${br(entry.entry_on)}</dd></div><div><dt>Quantidade inicial</dt><dd>${qty(entry.original_quantity)}</dd></div><div><dt>Saldo da caixa</dt><dd><strong>${qty(entry.current_quantity)}</strong></dd></div></dl>${entry.transferred_at?`<p class="production-inventory-transfer-note">Transferida completa em ${br(entry.transferred_on)} por ${esc(entry.transferred_by_name||'responsável não identificado')}.</p>`:''}${entry.notes?`<p>${esc(entry.notes)}</p>`:''}<footer><small>Registrado por ${esc(entry.created_by_name)} em ${when(entry.created_at)}</small><div class="actions">${n(entry.current_quantity)&&!entry.transferred_at?`<button class="primary compact-action" data-inventory-transfer="${entry.id}">Transferir caixa completa</button>`:''}${!entry.transferred_at?`<button class="outline compact-action" data-inventory-adjust="${entry.id}">Ajustar contagem</button>`:''}<button class="ghost compact-action" data-inventory-edit-entry="${entry.id}">Editar dados</button></div></footer></article>`).join('')||'<div class="empty">Nenhuma caixa registrada.</div>'}</div></section></section></div>`;
    modalCloseBindings();document.querySelector('#printInventoryDetail').onclick=button=>printDetail(row,entries,button.currentTarget);document.querySelectorAll('[data-inventory-transfer]').forEach(button=>button.onclick=()=>transferModal(entries.find(entry=>entry.id===button.dataset.inventoryTransfer),modelId,colorId));document.querySelectorAll('[data-inventory-adjust]').forEach(button=>button.onclick=()=>adjustModal(entries.find(entry=>entry.id===button.dataset.inventoryAdjust),modelId,colorId));document.querySelectorAll('[data-inventory-edit-entry]').forEach(button=>button.onclick=()=>editMetadataModal(entries.find(entry=>entry.id===button.dataset.inventoryEditEntry),modelId,colorId));
  }catch(error){alert(error.message);closeModal()}
}

function actionModal(entry,kind,modelId,colorId,source='detail'){
  const isTransfer=kind==='transfer',title=isTransfer?'Transferir caixa completa':'Ajustar contagem física',field=isTransfer?`<section class="production-inventory-transfer-summary"><small>DESTINO</small><b>Estoque do e-commerce</b><strong>${qty(entry.current_quantity)}</strong><span>Todo o saldo desta caixa será retirado do Inventário de Produção.</span></section>`:`<label>Quantidade física conferida<input name="quantity" type="number" inputmode="numeric" min="0" step="1" value="${entry.current_quantity}" required></label>`;
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box" id="inventoryActionForm"><div class="modal-head"><div><p class="eyebrow">CAIXA ${esc(entry.box_code||boxCode(entry.box_number))}</p><h2>${title}</h2><span>${esc(entry.worker_name)} · ${esc(entry.box_reference||'Localização não informada')} · saldo ${qty(entry.current_quantity)}</span></div><button type="button" data-inventory-back>×</button></div><div class="form">${field}<label>Data<input name="occurred_on" type="date" max="${today()}" value="${today()}" required></label>${isTransfer?'':`<label class="wide">Motivo<input name="reason" maxlength="240" placeholder="Ex.: Conferência física da caixa" required></label>`}<label class="wide">Observações<textarea name="notes" maxlength="1200" placeholder="Opcional"></textarea></label><div class="form-actions"><button type="button" class="outline" data-inventory-back>Voltar</button><button class="${isTransfer?'primary':'outline'}">${isTransfer?'Transferir caixa completa':'Salvar ajuste auditado'}</button></div></div></form></div>`;
  const back=()=>source==='boxes'?closeModal():openDetail(modelId,colorId);
  document.querySelectorAll('[data-inventory-back]').forEach(button=>button.onclick=back);document.querySelector('#inventoryActionForm').onsubmit=async event=>{event.preventDefault();const button=event.submitter,data=new FormData(event.currentTarget),quantity=Number(data.get('quantity'));if(!isTransfer&&(!Number.isInteger(quantity)||quantity<0))return alert('Informe uma quantidade inteira válida.');if(isTransfer&&!confirm(`Transferir a caixa ${entry.box_code||boxCode(entry.box_number)} completa, com ${qty(entry.current_quantity)}, para o estoque do e-commerce?`))return;button.disabled=true;try{if(isTransfer)await rpc('transfer_production_inventory_box_to_ecommerce',{p_entry_id:entry.id,p_occurred_on:data.get('occurred_on'),p_notes:data.get('notes')||null});else await rpc('adjust_production_inventory_entry',{p_entry_id:entry.id,p_counted_quantity:quantity,p_occurred_on:data.get('occurred_on'),p_reason:data.get('reason'),p_notes:data.get('notes')||null});PI.loaded=false;await load(true);if(source==='boxes'){closeModal();await render()}else await openDetail(modelId,colorId);toast(isTransfer?'Caixa completa transferida para o estoque do e-commerce.':'Contagem ajustada e registrada no histórico.')}catch(error){alert(error.message);button.disabled=false}};
}
const transferModal=(entry,modelId,colorId)=>actionModal(entry,'transfer',modelId,colorId);
const adjustModal=(entry,modelId,colorId)=>actionModal(entry,'adjust',modelId,colorId);

function editMetadataModal(entry,modelId,colorId){
  document.querySelector('#modal').innerHTML=`<div class="modal"><form class="modal-box" id="inventoryMetadataForm"><div class="modal-head"><div><p class="eyebrow">CORREÇÃO AUDITADA</p><h2>Editar dados da caixa ${esc(entry.box_code||boxCode(entry.box_number))}</h2><span>O código da caixa é permanente. A quantidade é corrigida somente em Ajustar contagem.</span></div><button type="button" data-inventory-back>×</button></div><div class="form"><label>Produzido por<select name="worker_id" required>${PI.workers.map(worker=>`<option value="${worker.id}" ${worker.id===entry.worker_id?'selected':''}>${esc(worker.full_name)}</option>`).join('')}</select></label><label>Data de entrada<input name="entry_on" type="date" max="${today()}" value="${entry.entry_on}" required></label><label class="wide">Localização física<input name="box_reference" maxlength="100" value="${esc(entry.box_reference||'')}" placeholder="Ex.: Prateleira A (opcional)"></label><label class="wide">Observações<textarea name="notes" maxlength="1200">${esc(entry.notes||'')}</textarea></label><div class="form-actions"><button type="button" class="outline" data-inventory-back>Voltar</button><button class="primary">Salvar correção</button></div></div></form></div>`;
  document.querySelectorAll('[data-inventory-back]').forEach(button=>button.onclick=()=>openDetail(modelId,colorId));document.querySelector('#inventoryMetadataForm').onsubmit=async event=>{event.preventDefault();const button=event.submitter,data=new FormData(event.currentTarget);button.disabled=true;try{await rpc('update_production_inventory_entry_metadata',{p_entry_id:entry.id,p_worker_id:data.get('worker_id'),p_entry_on:data.get('entry_on'),p_box_reference:data.get('box_reference')||null,p_notes:data.get('notes')||null});PI.loaded=false;await load(true);await openDetail(modelId,colorId);toast('Dados da caixa corrigidos com auditoria.')}catch(error){alert(error.message);button.disabled=false}};
}

const printCss=`@page{size:A4 portrait;margin:9mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;color:#3f3038;background:#fff;font:9px Arial,sans-serif}.inventory-sheet{width:100%}.inventory-sheet header{display:flex;align-items:center;gap:9px;border-bottom:2px solid #e95599;padding-bottom:7px}.inventory-sheet header img{width:44px;height:44px;object-fit:cover;border-radius:50%}.inventory-sheet header small{color:#d64d8e;font-weight:900;letter-spacing:.1em}.inventory-sheet h1{margin:2px 0;font:700 18px Georgia,serif}.inventory-sheet header p{margin:0;color:#7d6b74}.inventory-sheet .print-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:7px 0}.inventory-sheet .print-summary span{padding:6px;background:#fff2f8;border-radius:6px}.inventory-sheet .print-summary small{display:block;color:#b43a74;font-size:6px}.inventory-sheet table{width:100%;border-collapse:collapse}.inventory-sheet th{text-align:left;padding:5px;background:#fbe8f1;color:#9e3566;font-size:7px}.inventory-sheet td{padding:5px;border-bottom:1px solid #f0dce5;vertical-align:top}.inventory-sheet td b{display:block}.inventory-sheet td small{display:block;color:#7c6b73;margin-top:2px}.inventory-sheet tr{break-inside:avoid;page-break-inside:avoid}.inventory-sheet .swatch{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px;background:var(--print-color);border:1px solid #aaa}.inventory-sheet footer{margin-top:20px;padding-top:6px;border-top:1px solid #ddd;color:#777;text-align:center}`;
function sheet(title,subtitle,rows,columns,summary=''){
  return `<main class="inventory-sheet"><header><img src="logo.jpg" alt=""><div><small>HARMONY STORE OFICIAL · INVENTÁRIO DE PRODUÇÃO</small><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div></header>${summary}<table><thead><tr>${columns.map(column=>`<th>${esc(column)}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${columns.length}">Nenhum registro encontrado.</td></tr>`}</tbody></table><footer>Documento operacional gerado em ${when(new Date().toISOString())} · sem valores financeiros</footer></main>`;
}
function reportHtml(type){
  if(type==='movements')return sheet('Relatório de movimentações',`${PI.from?br(PI.from):'Início'} a ${PI.to?br(PI.to):'Hoje'}`,PI.movements.map(row=>`<tr><td>${br(row.occurred_on)}</td><td><b>${esc(movementLabels[row.movement_type])}</b><small>${esc(row.reason||'')}</small></td><td><b>${esc(row.model_name)}</b><small><i class="swatch" style="--print-color:${esc(row.color_hex)}"></i>${esc(row.color_name)}</small></td><td><b>${esc(row.box_code||boxCode(row.box_number))}</b><small>${esc(row.worker_name)} · ${esc(row.box_reference||'Localização não informada')}</small></td><td>${qty(row.quantity)}</td><td>${qty(row.balance_after)}</td><td>${esc(row.created_by_name)}</td></tr>`).join(''),['Data','Movimento','Modelo / cor','Caixa / origem','Quantidade','Saldo caixa','Responsável']);
  if(type==='workers')return sheet('Produção por colaboradora',`${PI.from?br(PI.from):'Início'} a ${PI.to?br(PI.to):'Hoje'}`,PI.byWorker.map(row=>`<tr><td><b>${esc(row.worker_name)}</b></td><td>${esc(row.model_name)}</td><td><i class="swatch" style="--print-color:${esc(row.color_hex)}"></i>${esc(row.color_name)}</td><td>${qty(row.received_quantity)}</td><td>${qty(row.current_quantity)}</td><td>${row.entry_count}</td><td>${br(row.latest_entry_on)}</td></tr>`).join(''),['Colaboradora','Modelo','Cor','Entradas','Saldo','Lotes','Última entrada']);
  const rows=PI.balance.filter(row=>!PI.onlyAvailable||n(row.quantity)>0);return sheet('Saldo atual de produtos acabados','Organizado alfabeticamente por modelo e cor',rows.map(row=>`<tr><td><b>${esc(row.model_name)}</b></td><td><i class="swatch" style="--print-color:${esc(row.color_hex)}"></i>${esc(row.color_name)}</td><td><b>${qty(row.quantity)}</b></td><td>${row.entry_count}</td><td>${row.producer_count}</td><td>${br(row.oldest_entry_on)}</td></tr>`).join(''),['Modelo','Cor','Saldo atual','Lotes','Colaboradoras','Entrada mais antiga'],`<div class="print-summary"><span><small>UNIDADES</small><b>${qty(rows.reduce((sum,row)=>sum+n(row.quantity),0))}</b></span><span><small>MODELOS</small><b>${new Set(rows.map(row=>row.model_id)).size}</b></span><span><small>MODELO + COR</small><b>${rows.length}</b></span></div>`);
}
function detailHtml(row,entries){return sheet(`${row.model_name} · ${row.color_name}`,'Rastreabilidade por colaboradora, data e caixa',entries.map(entry=>`<tr><td><b>${esc(entry.box_code||boxCode(entry.box_number))}</b></td><td><b>${esc(entry.worker_name)}</b></td><td>${br(entry.entry_on)}</td><td>${esc(entry.box_reference||'Não informada')}</td><td>${qty(entry.original_quantity)}</td><td><b>${qty(entry.current_quantity)}</b></td><td>${entry.transferred_at?`Transferida ao e-commerce em ${br(entry.transferred_on)}`:'No Inventário de Produção'}</td><td>${esc(entry.notes||'')}</td></tr>`).join(''),['Código da caixa','Produzido por','Entrada','Localização','Inicial','Saldo','Situação','Observação'],`<div class="print-summary"><span><small>MODELO</small><b>${esc(row.model_name)}</b></span><span><small>COR</small><b>${esc(row.color_name)}</b></span><span><small>SALDO</small><b>${qty(row.quantity)}</b></span></div>`)}

const mobilePrint=()=>matchMedia('(max-width: 900px)').matches||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
async function waitAssets(root){await Promise.race([Promise.all([...root.querySelectorAll('img')].map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.onload=resolve;image.onerror=resolve}))),new Promise(resolve=>setTimeout(resolve,6000))])}
async function printHtml(html,button){
  const original=button?.innerHTML;if(button){button.disabled=true;button.textContent='Preparando PDF…'}
  try{
    if(mobilePrint()){
      const root=document.createElement('div');root.id='productionInventoryPrintRoot';root.innerHTML=html;document.body.appendChild(root);await waitAssets(root);await window.HarmonyPrint.printCurrentDocument('production-inventory-printing',()=>root.remove());return;
    }
    const win=window.open('about:blank','_blank');if(!win)return alert('Permita pop-ups para gerar o PDF do Inventário de Produção.');const base=location.href.replace(/[^/]*([?#].*)?$/,'');win.document.open();win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><base href="${esc(base)}"><title>Inventário de Produção</title><style>${printCss}</style></head><body>${html}</body></html>`);win.document.close();await waitAssets(win.document);win.focus();win.print();const cleanup=()=>{if(!win.closed)win.close()};win.addEventListener('afterprint',cleanup,{once:true});setTimeout(cleanup,300000);
  }finally{if(button){button.disabled=false;button.innerHTML=original}}
}
const printReport=(type,button)=>printHtml(reportHtml(type),button);
const printDetail=(row,entries,button)=>printHtml(detailHtml(row,entries),button);

const previousRenderPage=renderPage;renderPage=async function(){if(S.view==='production-inventory'&&canManage()){if(!document.querySelector('.production-inventory-page'))PI.loaded=false;return render()}return previousRenderPage()};
new MutationObserver(()=>{injectNav();injectHomeShortcut()}).observe(document.body,{childList:true,subtree:true});injectNav();injectHomeShortcut();
})();
