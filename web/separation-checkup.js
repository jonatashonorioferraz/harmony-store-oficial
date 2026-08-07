(()=>{
const CHECK={busy:false};
const isAdmin=()=>S?.profile?.role==='admin';
const product=id=>S.products.find(item=>item.id===id);
const number=value=>Number(value||0);
const quantity=(value,unit='')=>`${number(value).toLocaleString('pt-BR',{maximumFractionDigits:3})}${unit?' '+unit:''}`;
const productName=id=>product(id)?.name||'Produto';
const safe=value=>esc(value??'');

async function enhanceRequestModal(){
  const box=document.querySelector('[data-separation-request]');
  if(!box||box.dataset.checkupEnhanced||!isAdmin())return;
  const requestId=box.dataset.separationRequest,status=box.dataset.separationStatus;
  if(!['pending','separating'].includes(status))return;
  box.dataset.checkupEnhanced='loading';
  let checks=[];
  try{checks=await rpc('list_material_separation_checkup',{p_request_id:requestId})||[]}
  catch(error){box.dataset.checkupEnhanced='error';console.warn('Check-up indisponível',error);return}
  if(!box.isConnected)return;
  const byItem=new Map(checks.map(item=>[item.request_item_id,item]));
  const rows=[...box.querySelectorAll('[data-item]')];
  const save=box.querySelector('#prepareReq');
  if(!save||!rows.length)return;
  const section=box.querySelector('.request-detail>section');
  const summary=document.createElement('div');summary.className='separation-summary';
  summary.innerHTML='<div><span>CHECK-UP DE SEPARAÇÃO</span><b data-checkup-progress></b><small>Todos os itens precisam ser conferidos.</small></div><button type="button" class="outline" data-stock-control>📊 Divergências e reposições</button>';
  section.insertBefore(summary,section.firstChild);

  const itemState=row=>byItem.get(row.dataset.item)?.status||'pending';
  const paint=row=>{
    const state=itemState(row);row.classList.remove('check-pending','check-separated','check-out-of-stock');row.classList.add(`check-${state.replaceAll('_','-')}`);
    const checkbox=row.querySelector('[data-check-separated]');if(checkbox)checkbox.checked=state==='separated';
    const locked=state==='out_of_stock',approved=row.querySelector('[data-approved]'),removed=row.querySelector('[data-removed]');
    if(locked){if(approved){approved.value='0';approved.disabled=true}if(removed){removed.checked=true;removed.disabled=true}if(checkbox)checkbox.disabled=true}
    const badge=row.querySelector('[data-check-state]');if(badge){badge.className=`separation-state ${state.replaceAll('_','-')}`;badge.textContent=state==='separated'?'✓ Separado':state==='out_of_stock'?'✕ Sem estoque':'Aguardando conferência'}
  };
  const refresh=()=>{
    rows.forEach(paint);const done=rows.filter(row=>['separated','out_of_stock'].includes(itemState(row))).length;
    summary.querySelector('[data-checkup-progress]').textContent=`${done} de ${rows.length} itens conferidos`;
    save.disabled=done!==rows.length;save.textContent=done===rows.length?'✓ Finalizar separação':`Confira os ${rows.length-done} itens restantes`;
  };
  const setState=async(row,next,note='')=>{
    if(CHECK.busy)return;CHECK.busy=true;row.classList.add('is-saving');
    try{
      const result=await rpc('admin_set_material_separation_item',{p_request_id:requestId,p_request_item_id:row.dataset.item,p_status:next,p_note:note||null});
      byItem.set(row.dataset.item,{request_item_id:row.dataset.item,status:next,note});
      if(next==='out_of_stock'){
        const approved=row.querySelector('[data-approved]'),removed=row.querySelector('[data-removed]');if(approved){approved.value='0';approved.disabled=true}if(removed){removed.checked=true;removed.disabled=true}
        toast(result?.replenishment_id?'Estoque zerado e reposição criada automaticamente.':'Estoque zerado e reposição atualizada.');
      }else toast(next==='separated'?'Item marcado como separado.':'Conferência desmarcada.');
      refresh();
    }catch(error){alert(error.message);refresh()}
    finally{CHECK.busy=false;row.classList.remove('is-saving')}
  };

  rows.forEach(row=>{
    const controls=document.createElement('div');controls.className='separation-controls';controls.innerHTML=`<span class="separation-state" data-check-state></span><label class="separation-check"><input type="checkbox" data-check-separated> <b>Separado</b></label><button type="button" class="separation-shortage" data-check-out>Sem estoque</button><button type="button" class="separation-discrepancy" data-check-divergence>⚖ Divergência</button>`;
    row.appendChild(controls);
    controls.querySelector('[data-check-separated]').onchange=event=>setState(row,event.currentTarget.checked?'separated':'pending');
    controls.querySelector('[data-check-out]').onclick=async()=>{
      if(itemState(row)==='out_of_stock')return alert('Este item já foi registrado como sem estoque.');
      const note=prompt('Explique a falta de estoque (ex.: contagem física zerada):');if(note===null)return;if(note.trim().length<3)return alert('Informe um motivo para gerar a reposição.');
      if(!confirm('Confirmar estoque zero? O saldo será zerado, a divergência registrada e uma reposição será criada.'))return;
      await setState(row,'out_of_stock',note.trim());
    };
    controls.querySelector('[data-check-divergence]').onclick=async()=>{
      const found=prompt('Qual foi a quantidade encontrada na contagem física?');if(found===null)return;const counted=Number(String(found).replace(',','.'));if(!Number.isFinite(counted)||counted<0)return alert('Informe uma quantidade válida.');
      const reason=prompt('Explique a divergência encontrada:');if(reason===null)return;
      try{await rpc('admin_record_stock_discrepancy',{p_request_id:requestId,p_request_item_id:row.dataset.item,p_counted_stock:counted,p_reason:reason});toast('Divergência registrada para verificação.')}
      catch(error){alert(error.message)}
    };
  });
  summary.querySelector('[data-stock-control]').onclick=openStockControl;
  save.onclick=async()=>{
    if(save.disabled)return;
    const payload=rows.map(row=>({item_id:row.dataset.item,approved_quantity:+row.querySelector('[data-approved]').value,removed:row.querySelector('[data-removed]').checked,admin_note:row.querySelector('[data-note]').value}));
    save.disabled=true;
    try{await rpc('admin_finalize_material_separation',{p_request_id:requestId,p_items:payload,p_admin_notes:box.querySelector('#adminNotes').value});await refreshClose('Check-up concluído e separação finalizada.')}
    catch(error){alert(error.message);save.disabled=false}
  };
  box.dataset.checkupEnhanced='true';refresh();
}

function csv(rows){
  const content='\ufeff'+rows.map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(';')).join('\r\n');
  const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));link.download=`harmony-divergencias-${new Date().toISOString().slice(0,10)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
async function openStockControl(){
  if(!isAdmin())return;
  const [divergences,replenishments]=await Promise.all([rest('stock_discrepancies?select=*&order=recorded_at.desc&limit=500'),rest('stock_replenishment_requests?select=*&order=created_at.desc&limit=500')]);
  const openDivergences=divergences.filter(item=>item.status==='open'),openReplenishments=replenishments.filter(item=>['open','in_progress'].includes(item.status));
  document.querySelector('#modal').innerHTML=`<div class="modal"><section class="modal-box large stock-control-modal"><div class="modal-head no-print"><div><p class="eyebrow">CONFERÊNCIA DE ESTOQUE</p><h2>Divergências e reposições</h2></div><button type="button" data-stock-close>×</button></div><div class="stock-control-kpis no-print"><article><b>${openDivergences.length}</b><span>Divergências abertas</span></article><article><b>${openReplenishments.length}</b><span>Reposições pendentes</span></article><article><b>${divergences.length}</b><span>Ocorrências registradas</span></article></div><div id="stockControlReport"><section class="stock-control-section"><div class="card-head"><div><p class="eyebrow">AUDITORIA</p><h3>Divergências de estoque</h3></div><div class="actions no-print"><button class="outline" data-export-divergences>Exportar Excel</button><button class="outline" data-print-stock>Salvar em PDF</button></div></div><div class="stock-control-table"><header><span>Produto</span><span>Sistema</span><span>Contado</span><span>Diferença</span><span>Data e responsável</span><span>Situação</span></header>${divergences.map(item=>{const actor=S.team.find(person=>person.id===item.recorded_by)||S.profile;return `<article class="${item.status}"><span><b>${safe(productName(item.product_id))}</b><small>${safe(item.reason)}</small></span><span>${quantity(item.system_stock,product(item.product_id)?.unit)}</span><span>${quantity(item.counted_stock,product(item.product_id)?.unit)}</span><strong class="${number(item.difference)<0?'negative':'positive'}">${number(item.difference)>0?'+':''}${quantity(item.difference,product(item.product_id)?.unit)}</strong><span>${new Date(item.recorded_at).toLocaleString('pt-BR')}<small>${safe(actor?.full_name||'ADM')}</small></span><span><b>${item.status==='open'?'Pendente':item.status==='adjusted'?'Ajustada':'Revisada'}</b>${item.status==='open'?`<button class="ghost no-print" data-resolve-discrepancy="${item.id}">Concluir análise</button>`:''}</span></article>`}).join('')||'<div class="empty">Nenhuma divergência registrada.</div>'}</div></section><section class="stock-control-section"><div class="card-head"><div><p class="eyebrow">ABASTECIMENTO</p><h3>Solicitações automáticas de reposição</h3></div></div><div class="replenishment-list">${replenishments.map(item=>`<article class="${item.status}"><div><span class="replenishment-kind">${item.replenishment_type==='production'?'🏭 Produção':'🛒 Compra'}</span><h4>${safe(productName(item.product_id))}</h4><p>${safe(item.reason)}</p></div><b>${quantity(item.requested_quantity,product(item.product_id)?.unit)}</b><span>${item.status==='open'?'Aguardando':item.status==='in_progress'?'Em andamento':item.status==='completed'?'Concluída':'Cancelada'}</span>${['open','in_progress'].includes(item.status)?`<div class="actions no-print">${item.status==='open'?`<button class="outline" data-replenishment-progress="${item.id}">Iniciar</button>`:''}<button class="primary" data-replenishment-complete="${item.id}">Concluir</button></div>`:''}</article>`).join('')||'<div class="empty">Nenhuma reposição registrada.</div>'}</div></section></div></section></div>`;
  const close=()=>document.querySelector('#modal').innerHTML='';document.querySelector('[data-stock-close]').onclick=close;
  document.querySelector('[data-export-divergences]').onclick=()=>csv([['Produto','Estoque no sistema','Contagem física','Diferença','Motivo','Data','Status'],...divergences.map(item=>[productName(item.product_id),item.system_stock,item.counted_stock,item.difference,item.reason,new Date(item.recorded_at).toLocaleString('pt-BR'),item.status])]);
  document.querySelector('[data-print-stock]').onclick=()=>window.HarmonyPrint?.printCurrentDocument('stock-control-printing');
  document.querySelectorAll('[data-resolve-discrepancy]').forEach(button=>button.onclick=async()=>{const note=prompt('Informe a conclusão da verificação:');if(note===null)return;const adjusted=confirm('O estoque também foi ajustado no cadastro? Clique OK para marcar como ajustado ou Cancelar para apenas revisado.');try{await rpc('admin_resolve_stock_discrepancy',{p_discrepancy_id:button.dataset.resolveDiscrepancy,p_status:adjusted?'adjusted':'reviewed',p_note:note});await openStockControl()}catch(error){alert(error.message)}});
  document.querySelectorAll('[data-replenishment-progress]').forEach(button=>button.onclick=async()=>{await rpc('admin_update_replenishment_status',{p_replenishment_id:button.dataset.replenishmentProgress,p_status:'in_progress',p_note:null});await openStockControl()});
  document.querySelectorAll('[data-replenishment-complete]').forEach(button=>button.onclick=async()=>{const note=prompt('Observação da conclusão (opcional):');if(note===null)return;await rpc('admin_update_replenishment_status',{p_replenishment_id:button.dataset.replenishmentComplete,p_status:'completed',p_note:note});await openStockControl()});
}

function enhanceProducts(){
  if(!isAdmin()||S.view!=='products'||document.querySelector('[data-open-stock-control]'))return;
  const actions=document.querySelector('.page-head .head-actions');if(!actions)return;
  const button=document.createElement('button');button.type='button';button.className='outline';button.dataset.openStockControl='';button.textContent='⚖ Conferência de estoque';button.onclick=openStockControl;actions.prepend(button);
}

new MutationObserver(()=>{enhanceRequestModal();enhanceProducts()}).observe(document.body,{childList:true,subtree:true});
window.HarmonySeparationCheckup=Object.freeze({openStockControl});
})();
