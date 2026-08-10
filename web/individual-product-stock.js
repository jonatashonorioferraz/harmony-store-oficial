(()=>{
  const MODE_SHARED='shared',MODE_COLLABORATOR='collaborator';
  const number=value=>Number(value||0);
  const quantity=value=>number(value).toLocaleString('pt-BR',{maximumFractionDigits:3});
  const firstName=name=>String(name||'Colaboradora').trim().split(/\s+/)[0];
  const ownerName=id=>S.team?.find(person=>person.id===id)?.full_name
    ||S.personalizedStocks?.find(stock=>stock.collaborator_id===id)?.full_name
    ||(id===S.profile?.id?S.profile.full_name:'Colaboradora');
  const managedProducts=()=>S.products.filter(product=>window.HarmonyProductVisibility?.isManagedCatalog
    ?window.HarmonyProductVisibility.isManagedCatalog(product)
    :['production','ecommerce','shared'].includes(product.usage_scope));
  const ownerBalance=(productId,ownerId)=>S.personalizedStocks?.find(stock=>
    stock.product_id===productId&&stock.collaborator_id===ownerId);
  const productBalance=(product,ownerId)=>{
    if(product?.stock_control_mode!==MODE_COLLABORATOR)return product;
    const stock=ownerBalance(product.id,ownerId);
    return {...product,
      physical_stock:number(stock?.physical_stock),
      reserved_stock:number(stock?.reserved_stock),
      minimum_stock:number(stock?.minimum_stock??product.minimum_stock),
      available_stock:number(stock?.available_stock)
    };
  };

  const originalLoadData=loadData;
  loadData=async function(){
    await originalLoadData();
    try{
      if(S.profile?.role==='admin'){
        S.personalizedStocks=await rpc('admin_list_all_product_collaborator_stock',{});
        S.individualStockReady=true;
        return;
      }
      const balances=await rpc('list_my_product_stock',{});
      S.personalizedStocks=balances.map(stock=>({...stock,collaborator_id:S.profile.id,full_name:S.profile.full_name}));
      S.individualStockReady=true;
      const byProduct=new Map(balances.map(stock=>[stock.product_id,stock]));
      S.products=S.products.map(product=>{
        if(product.stock_control_mode!==MODE_COLLABORATOR)return product;
        const stock=byProduct.get(product.id);
        return {...product,
          physical_stock:number(stock?.physical_stock),reserved_stock:number(stock?.reserved_stock),
          minimum_stock:number(stock?.minimum_stock??product.minimum_stock),available_stock:number(stock?.available_stock)};
      });
    }catch(error){
      S.individualStockReady=false;S.personalizedStocks=[];
      console.warn('[Harmony] Estoque individual indisponível; o aplicativo seguirá em modo compatível.',error);
    }
  };

  const originalRpc=rpc;
  rpc=async function(name,body){
    const productSave=name==='admin_save_product';
    const mode=document.querySelector('#productForm [name="stock_control_mode"]')?.value||MODE_SHARED;
    const result=await originalRpc(name,body);
    if(productSave&&S.individualStockReady){
      await originalRpc('admin_set_product_stock_control_mode',{p_product_id:result,p_mode:mode});
    }
    return result;
  };

  const originalProductModal=productModal;
  productModal=async function(product={}){
    await originalProductModal(product);
    const form=document.querySelector('#productForm'),fields=form?.querySelector('.form');
    if(!S.individualStockReady||!form||!fields||form.querySelector('[name="stock_control_mode"]'))return;
    const physical=form.querySelector('[name="physical_stock"]'),reserved=form.querySelector('[name="reserved_stock"]');
    const physicalLabel=physical?.closest('label'),reservedLabel=reserved?.closest('label');
    const control=document.createElement('fieldset');
    control.className='individual-stock-choice wide';
    control.innerHTML=`<legend>Controle do estoque</legend><label>Tipo de saldo<select name="stock_control_mode"><option value="shared">Compartilhado entre os perfis</option><option value="collaborator">Individual por colaboradora</option></select></label><div class="individual-stock-choice-copy"><b>Produtos personalizados</b><span>Use o estoque individual para etiquetas ou outros materiais fabricados com o nome de cada colaboradora.</span></div>`;
    fields.insertBefore(control,physicalLabel||fields.querySelector('.form-actions'));
    const select=control.querySelector('select');
    select.value=product.stock_control_mode===MODE_COLLABORATOR?MODE_COLLABORATOR:MODE_SHARED;
    const sync=()=>{
      const individualized=select.value===MODE_COLLABORATOR;
      control.classList.toggle('is-individual',individualized);
      [physicalLabel,reservedLabel].forEach(label=>label?.classList.toggle('individual-stock-shared-field',individualized));
      if(physical){physical.disabled=individualized;if(individualized)physical.value='0'}
      if(reserved){reserved.disabled=individualized;if(individualized)reserved.value='0'}
      const minimum=form.querySelector('[name="minimum_stock"]')?.closest('label');
      if(minimum){minimum.firstChild.textContent=individualized?'Estoque mínimo padrão por colaboradora':'Estoque mínimo'}
    };
    select.addEventListener('change',sync);sync();
    form.addEventListener('submit',event=>{
      if(select.value!==MODE_COLLABORATOR||product.stock_control_mode===MODE_COLLABORATOR)return;
      if(number(product.physical_stock)>0||number(product.reserved_stock)>0){
        event.preventDefault();event.stopImmediatePropagation();
        alert('Antes de ativar o estoque individual, deixe o estoque físico e o reservado compartilhado em zero. Depois informe o saldo de cada colaboradora.');
      }
    },true);
    if(product.id&&product.stock_control_mode===MODE_COLLABORATOR){
      const actions=form.querySelector('.form-actions'),manage=document.createElement('button');
      manage.type='button';manage.className='outline individual-stock-manage-inline';
      manage.textContent='👥 Gerenciar estoques individuais';
      manage.onclick=()=>openManager(product);
      actions?.prepend(manage);
    }
  };

  async function openManager(product){
    if(S.profile?.role!=='admin')return;
    const stocks=await rpc('admin_list_product_collaborator_stock',{p_product_id:product.id});
    const modal=document.querySelector('#modal');
    modal.innerHTML=`<div class="modal"><form class="modal-box large individual-stock-modal" id="individualStockForm"><div class="modal-head"><div><p class="eyebrow">ESTOQUE PERSONALIZADO</p><h2>${esc(product.name)}</h2><span>Cada saldo pertence exclusivamente à colaboradora identificada.</span></div><button type="button" class="modal-close" data-close aria-label="Fechar">×</button></div><div class="individual-stock-summary"><article><small>COLABORADORAS</small><b>${stocks.filter(stock=>stock.profile_status==='active').length}</b></article><article><small>ESTOQUE FÍSICO</small><b data-personalized-total>${quantity(stocks.reduce((sum,stock)=>sum+number(stock.physical_stock),0))} ${esc(product.unit)}</b></article><article><small>RESERVADO</small><b>${quantity(stocks.reduce((sum,stock)=>sum+number(stock.reserved_stock),0))} ${esc(product.unit)}</b></article></div><div class="individual-stock-list">${stocks.map(stock=>`<article class="individual-stock-row ${stock.profile_status==='inactive'?'is-inactive':''}" data-personalized-row data-collaborator-id="${stock.collaborator_id}"><div class="individual-stock-person"><i>${esc(firstName(stock.full_name).slice(0,1).toUpperCase())}</i><span><b>${esc(stock.full_name)}</b><small>${stock.profile_status==='active'?'Cadastro ativo':'Cadastro inativo · histórico preservado'}</small></span></div><label>Estoque físico<input name="physical_stock" type="number" min="${number(stock.reserved_stock)}" step="0.001" value="${number(stock.physical_stock)}" required></label><div class="individual-stock-reserved"><small>RESERVADO</small><b>${quantity(stock.reserved_stock)} ${esc(product.unit)}</b></div><label>Estoque mínimo<input name="minimum_stock" type="number" min="0" step="0.001" value="${number(stock.minimum_stock)}" required></label><div class="individual-stock-available ${number(stock.available_stock)<=number(stock.minimum_stock)?'is-low':''}"><small>DISPONÍVEL</small><b data-row-available>${quantity(stock.available_stock)} ${esc(product.unit)}</b></div></article>`).join('')||'<div class="empty">Nenhuma colaboradora de produção cadastrada.</div>'}</div><label class="individual-stock-reason">Motivo da entrada ou ajuste<textarea name="reason" minlength="3" required placeholder="Ex.: entrada de etiquetas personalizadas recebidas da gráfica"></textarea></label><div class="individual-stock-guidance"><b>Como funciona</b><span>Reservas e entregas são movimentadas automaticamente. Nesta tela, ajuste somente o estoque físico contado e o mínimo desejado.</span></div><div class="form-actions"><button type="button" class="outline" data-close>Cancelar</button><button class="primary">Salvar estoques individuais</button></div></form></div>`;
    modal.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>modal.innerHTML='');
    const form=modal.querySelector('#individualStockForm');
    const refreshTotals=()=>{
      let total=0;
      form.querySelectorAll('[data-personalized-row]').forEach(row=>{
        const physical=number(row.querySelector('[name="physical_stock"]').value),
          reservedValue=number(stocks.find(stock=>stock.collaborator_id===row.dataset.collaboratorId)?.reserved_stock),
          available=Math.max(0,physical-reservedValue);
        total+=physical;row.querySelector('[data-row-available]').textContent=`${quantity(available)} ${product.unit}`;
      });
      form.querySelector('[data-personalized-total]').textContent=`${quantity(total)} ${product.unit}`;
    };
    form.querySelectorAll('[name="physical_stock"]').forEach(input=>input.addEventListener('input',refreshTotals));
    form.onsubmit=async event=>{
      event.preventDefault();const button=event.submitter;
      const balances=[...form.querySelectorAll('[data-personalized-row]')].map(row=>({
        collaborator_id:row.dataset.collaboratorId,
        physical_stock:number(row.querySelector('[name="physical_stock"]').value),
        minimum_stock:number(row.querySelector('[name="minimum_stock"]').value)
      }));
      if(!balances.length)return alert('Cadastre ao menos uma colaboradora de produção.');
      button.disabled=true;
      try{
        await rpc('admin_save_product_collaborator_stocks',{p_product_id:product.id,p_balances:balances,p_reason:form.reason.value});
        modal.innerHTML='';await loadData();renderApp();toast('Estoques individuais atualizados com segurança.');
      }catch(error){alert(error.message);button.disabled=false}
    };
  }

  function decorateAdminProductRows(){
    if(!S.individualStockReady||S.profile?.role!=='admin'||S.view!=='products')return;
    const products=managedProducts();
    document.querySelectorAll('.table > article').forEach((row,index)=>{
      const product=products[index];
      if(!product||product.stock_control_mode!==MODE_COLLABORATOR||row.dataset.individualStock==='true')return;
      row.dataset.individualStock='true';
      const stocks=(S.personalizedStocks||[]).filter(stock=>stock.product_id===product.id&&stock.profile_status==='active');
      const physical=stocks.reduce((sum,stock)=>sum+number(stock.physical_stock),0),
        reservedValue=stocks.reduce((sum,stock)=>sum+number(stock.reserved_stock),0),available=physical-reservedValue,
        low=stocks.filter(stock=>number(stock.available_stock)<=number(stock.minimum_stock)).length;
      const columns=[...row.children];
      if(columns[1])columns[1].textContent=quantity(physical);
      if(columns[2])columns[2].textContent=quantity(reservedValue);
      if(columns[3])columns[3].textContent=quantity(available);
      if(columns[4]){columns[4].className=`badge ${low?'low':'normal'}`;columns[4].textContent=low?`${low} ${low===1?'saldo baixo':'saldos baixos'}`:'Todos normais'}
      const copy=row.querySelector('.table-product b'),label=document.createElement('small');
      label.className='individual-stock-label';label.textContent='👥 Estoque individual por colaboradora';copy?.appendChild(label);
      const actions=row.querySelector('.actions'),button=document.createElement('button');
      button.type='button';button.className='primary individual-stock-manage';button.textContent='Gerenciar estoques';button.onclick=()=>openManager(product);actions?.prepend(button);
    });
  }

  const originalRenderProducts=renderProducts;
  renderProducts=function(page){originalRenderProducts(page);decorateAdminProductRows()};

  function decorateCatalog(){
    if(!S.individualStockReady||S.profile?.role==='admin')return;
    document.querySelectorAll('.catalog-layout .product[data-product-id]').forEach(card=>{
      const product=S.products.find(item=>item.id===card.dataset.productId);
      if(!product||product.stock_control_mode!==MODE_COLLABORATOR||card.querySelector('.individual-stock-catalog-note'))return;
      const available=number(product.physical_stock)-number(product.reserved_stock),copy=card.querySelector('div:not(.qty)'),value=copy?.querySelector('b');
      const note=document.createElement('div');note.className=`individual-stock-catalog-note ${available<=0?'is-empty':''}`;
      note.innerHTML=available<=0?'<strong>Sem estoque para você</strong><span>Este material é personalizado com o seu nome.</span>':`<strong>Exclusivo para você</strong><span>${quantity(available)} ${esc(product.unit)} disponíveis no seu estoque.</span>`;
      copy?.appendChild(note);if(value&&available<=0)value.textContent='Sem estoque para você';
    });
  }

  const originalRenderNew=renderNew;
  renderNew=function(page){originalRenderNew(page);decorateCatalog()};

  async function withOwnerBalances(ownerId,callback){
    if(S.profile?.role!=='admin')return callback();
    const original=S.products;
    S.products=original.map(product=>productBalance(product,ownerId));
    try{return await callback()}finally{S.products=original}
  }

  const originalRequestModal=requestModalV2;
  requestModalV2=async function(request){
    const result=await withOwnerBalances(request.requested_by,()=>originalRequestModal(request));
    const owner=ownerName(request.requested_by);
    document.querySelectorAll('#modal [data-item]').forEach(row=>{
      const itemId=row.dataset.item;
      rest(`request_items?id=eq.${itemId}&select=product_id,stock_owner_id`).then(items=>{
        const item=items[0],product=S.products.find(entry=>entry.id===item?.product_id);
        if(!item?.stock_owner_id||product?.stock_control_mode!==MODE_COLLABORATOR||row.querySelector('.individual-request-owner'))return;
        const balance=ownerBalance(product.id,item.stock_owner_id),badge=document.createElement('small');
        badge.className='individual-request-owner';badge.textContent=`👤 Estoque de ${firstName(owner)} · ${quantity(balance?.available_stock)} ${product.unit} disponíveis`;
        row.querySelector('.request-item-copy')?.appendChild(badge);
      }).catch(()=>{});
    });
    document.querySelectorAll('#modal [data-own-product]').forEach(input=>{
      const product=S.products.find(item=>item.id===input.dataset.ownProduct);
      if(product?.stock_control_mode!==MODE_COLLABORATOR)return;
      const card=input.closest('.product'),note=document.createElement('small');note.className='individual-request-owner';
      note.textContent=number(product.physical_stock)-number(product.reserved_stock)>0?'Estoque exclusivo para você':'Sem estoque para você';card?.querySelector('div')?.appendChild(note);
    });
    return result;
  };

  if(typeof openPrimaryRequestEditor==='function'){
    const originalPrimaryEditor=openPrimaryRequestEditor;
    openPrimaryRequestEditor=async function(request,items){return withOwnerBalances(request.requested_by,()=>originalPrimaryEditor(request,items))};
  }

  const originalRest=rest;
  rest=async function(path,options){
    const result=await originalRest(path,options);
    if(path.startsWith('stock_discrepancies?'))S.personalizedStockDiscrepancies=result;
    if(path.startsWith('stock_replenishment_requests?'))S.personalizedStockReplenishments=result;
    return result;
  };

  function decorateStockControlReports(){
    const modal=document.querySelector('.stock-control-modal');
    if(!modal||modal.dataset.personalized==='true')return;
    modal.dataset.personalized='true';
    modal.querySelectorAll('.stock-control-table article').forEach((row,index)=>{
      const item=S.personalizedStockDiscrepancies?.[index];if(!item?.stock_owner_id)return;
      const note=document.createElement('small');note.className='individual-report-owner';note.textContent=`Estoque de ${ownerName(item.stock_owner_id)}`;
      row.querySelector('span')?.appendChild(note);
    });
    modal.querySelectorAll('.replenishment-list article').forEach((row,index)=>{
      const item=S.personalizedStockReplenishments?.[index];if(!item?.stock_owner_id)return;
      const note=document.createElement('small');note.className='individual-report-owner';note.textContent=`Personalizado para ${ownerName(item.stock_owner_id)}`;
      row.querySelector('h4')?.after(note);
    });
  }

  new MutationObserver(()=>{decorateAdminProductRows();decorateCatalog();decorateStockControlReports()})
    .observe(document.body,{childList:true,subtree:true});
  window.HarmonyIndividualProductStock=Object.freeze({openManager,ownerBalance,productBalance});
})();
