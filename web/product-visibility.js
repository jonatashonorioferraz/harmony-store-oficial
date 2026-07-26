(()=>{
  const isProductionCatalog=product=>['production','shared'].includes(product?.usage_scope);
  const isEcommerceCatalog=product=>['ecommerce','shared'].includes(product?.usage_scope);
  const isSharedCatalog=product=>product?.usage_scope==='shared';
  const isManagedCatalog=product=>isProductionCatalog(product)||isEcommerceCatalog(product);
  const requestScopes=()=>S.profile?.role==='receiver'?['ecommerce','shared']:['production','shared'];
  const isInRequestCatalog=product=>requestScopes().includes(product?.usage_scope);
  const visibleForRequests=product=>product.active&&isInRequestCatalog(product)&&(S.profile?.role!=='collaborator'||product.hidden_from_collaborators!==true);
  const isRequestAvailable=product=>!product?.availability_status||product.availability_status==='available';
  const availabilityLabels={
    available:'Disponível para solicitar',
    supplier_unavailable:'Fornecedor sem estoque',
    awaiting_restock:'Aguardando reposição',
    temporarily_paused:'Disponibilidade pausada'
  };
  const formatExpected=date=>date?new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`)):'';
  const availabilityMessage=product=>{
    const reason=product.availability_reason||availabilityLabels[product.availability_status]||'Aguardando reposição';
    const expected=formatExpected(product.availability_expected_on);
    return `${reason}${expected?` · Previsão de retorno: ${expected}`:''}`;
  };

  const originalRpc=rpc;
  rpc=async function(name,body){
    if(name==='admin_save_product'){
      const form=document.querySelector('#productForm');
      const status=form?.querySelector('[name="availability_status"]')?.value||'available';
      name='admin_save_product_v5';
      body={
        ...body,
        p_hidden_from_collaborators:Boolean(form?.querySelector('[name="hidden_from_collaborators"]')?.checked),
        p_availability_status:status,
        p_availability_reason:status==='available'?null:(form?.querySelector('[name="availability_reason"]')?.value.trim()||null),
        p_availability_expected_on:status==='available'?null:(form?.querySelector('[name="availability_expected_on"]')?.value||null),
        p_usage_scope:form?.querySelector('[name="usage_scope"]')?.value||'production'
      };
    }
    return originalRpc(name,body);
  };

  const originalProductModal=productModal;
  productModal=async function(product={}){
    await originalProductModal(product);
    const form=document.querySelector('#productForm .form');
    if(!form||form.querySelector('[name="hidden_from_collaborators"]'))return;
    const description=form.querySelector('label.wide');
    const purpose=document.createElement('label');
    purpose.innerHTML=`Finalidade operacional<select name="usage_scope" required><option value="production">Matéria-prima de produção</option><option value="ecommerce">Suprimento do e-commerce</option><option value="shared">Produção e e-commerce</option></select><small class="field-help">Itens compartilhados aparecem para produção e recebimento usando o mesmo estoque.</small>`;
    purpose.querySelector('select').value=['production','ecommerce','shared'].includes(product.usage_scope)?product.usage_scope:'production';
    form.insertBefore(purpose,description||form.querySelector('.form-actions'));
    const visibility=document.createElement('label');
    visibility.className='check product-visibility-check wide';
    visibility.innerHTML=`<input name="hidden_from_collaborators" type="checkbox" ${product.hidden_from_collaborators?'checked':''}><span><b>Ocultar para colaboradoras de produção</b><small>O produto continuará visível para os ADMs. O perfil de recebimento possui o catálogo separado de e-commerce.</small></span>`;
    form.insertBefore(visibility,description||form.querySelector('.form-actions'));
    const purposeSelect=purpose.querySelector('select'),visibilityInput=visibility.querySelector('input'),visibilityHelp=visibility.querySelector('small');
    visibilityInput.dataset.productionHidden=String(Boolean(product.hidden_from_collaborators));
    visibilityInput.onchange=()=>visibilityInput.dataset.productionHidden=String(visibilityInput.checked);
    const syncPurpose=()=>{
      if(purposeSelect.value==='ecommerce'){
        visibilityInput.checked=true;visibilityInput.disabled=true;
        visibilityHelp.textContent='Exclusivo do recebimento e oculto para colaboradoras de produção.';
      }else if(purposeSelect.value==='shared'){
        visibilityInput.checked=false;visibilityInput.disabled=true;
        visibilityHelp.textContent='Compartilhado: visível para produção e recebimento usando o mesmo estoque.';
      }else{
        visibilityInput.disabled=false;visibilityInput.checked=visibilityInput.dataset.productionHidden==='true';
        visibilityHelp.textContent='Opcionalmente, o ADM pode ocultar esta matéria-prima das colaboradoras.';
      }
    };
    purposeSelect.addEventListener('change',syncPurpose);syncPurpose();

    const availability=document.createElement('fieldset');
    availability.className='product-availability-fields wide';
    availability.innerHTML=`<legend>Disponibilidade para solicitação</legend><label>Situação<select name="availability_status"><option value="available">Disponível para solicitar</option><option value="supplier_unavailable">Fornecedor sem estoque</option><option value="awaiting_restock">Aguardando reposição</option><option value="temporarily_paused">Disponibilidade pausada</option></select></label><label class="availability-dependent">Motivo exibido<input name="availability_reason" maxlength="160" placeholder="Ex.: fornecedor sem estoque" value="${esc(product.availability_reason||'')}"></label><label class="availability-dependent">Previsão de retorno (opcional)<input name="availability_expected_on" type="date" value="${esc(product.availability_expected_on||'')}"></label><small class="availability-help">O produto continua visível no catálogo. Quando indisponível, a quantidade fica bloqueada até um ADM reativá-lo.</small>`;
    form.insertBefore(availability,visibility);
    const select=availability.querySelector('[name="availability_status"]');
    select.value=product.availability_status||'available';
    const sync=()=>{
      const unavailable=select.value!=='available';
      availability.classList.toggle('is-unavailable',unavailable);
      availability.querySelector('[name="availability_reason"]').required=unavailable;
      availability.querySelectorAll('.availability-dependent').forEach(field=>field.hidden=!unavailable);
    };
    select.addEventListener('change',sync);sync();
  };

  function decorateUnavailableCard(card,product,{editableExisting=false}={}){
    if(!card||isRequestAvailable(product))return;
    card.classList.add('product-temporarily-unavailable');
    card.dataset.availability='unavailable';
    const content=card.querySelector('div:not(.qty)')||card;
    const notice=document.createElement('div');
    notice.className='product-availability-notice';
    notice.innerHTML=`<strong>⚠️ Temporariamente indisponível</strong><span>${esc(availabilityMessage(product))}</span>`;
    content.appendChild(notice);
    const quantity=card.querySelector('[data-qty],[data-own-product]');
    card.querySelectorAll('[data-minus],[data-plus]').forEach(button=>button.disabled=true);
    if(!quantity)return;
    if(editableExisting&&Number(quantity.value)>0){
      quantity.readOnly=true;
      const remove=document.createElement('button');
      remove.type='button';remove.className='outline remove-unavailable-item';remove.textContent='Remover da solicitação';
      remove.onclick=()=>{quantity.value='0';quantity.dataset.removedUnavailable='true';card.classList.add('unavailable-removed');remove.textContent='Item removido ao salvar';remove.disabled=true};
      card.appendChild(remove);
    }else quantity.disabled=true;
  }

  const originalRenderNew=renderNew;
  renderNew=function(page){
    const fullProducts=S.products;
    const visible=fullProducts.filter(visibleForRequests);
    const requestable=new Set(visible.filter(isRequestAvailable).map(product=>product.id));
    Object.keys(S.cart).forEach(id=>{if(!requestable.has(id))delete S.cart[id]});
    S.products=visible;
    try{
      originalRenderNew(page);
      const displayed=visible.filter(product=>product.active);
      document.querySelectorAll('.catalog-layout > .products-grid > .product').forEach((card,index)=>{
        const product=displayed[index];
        if(product){card.dataset.productId=product.id;decorateUnavailableCard(card,product)}
      });
    }finally{S.products=fullProducts}
  };

  const originalRequestModal=requestModalV2;
  requestModalV2=async function(request){
    const fullProducts=S.products;
    const editingOwnRequest=S.profile?.role!=='admin'&&request.status==='pending'&&request.requested_by===S.profile?.id;
    if(editingOwnRequest)S.products=fullProducts.filter(visibleForRequests);
    try{await originalRequestModal(request)}finally{S.products=fullProducts}
    if(!editingOwnRequest)return;
    document.querySelectorAll('[data-own-product]').forEach(input=>{
      const product=fullProducts.find(item=>item.id===input.dataset.ownProduct);
      if((!isInRequestCatalog(product)||(S.profile?.role==='collaborator'&&product?.hidden_from_collaborators===true))&&Number(input.value||0)<=0){input.closest('.product')?.remove();return}
      decorateUnavailableCard(input.closest('.product'),product,{editableExisting:true});
    });
    const save=document.querySelector('#saveOwnRequest'),originalSave=save?.onclick;
    if(save&&originalSave)save.onclick=event=>{
      const blocked=[...document.querySelectorAll('[data-own-product]')].some(input=>{
        const product=fullProducts.find(item=>item.id===input.dataset.ownProduct);
        return !isRequestAvailable(product)&&Number(input.value)>0;
      });
      if(blocked)return alert('Remova os itens temporariamente indisponíveis antes de salvar esta alteração.');
      return originalSave.call(save,event);
    };
  };

  const originalRenderProducts=renderProducts;
  renderProducts=function(page){
    const fullProducts=S.products;
    S.products=fullProducts.filter(isManagedCatalog);
    try{originalRenderProducts(page)}finally{S.products=fullProducts}
    const displayed=fullProducts.filter(isManagedCatalog);
    document.querySelectorAll('.table article').forEach((row,index)=>{
      const product=displayed[index],copy=row.querySelector('.table-product b');
      if(!product||!copy)return;
      const purpose=document.createElement('small');
      purpose.className=`product-visibility-state product-scope-${product.usage_scope}`;
      purpose.textContent=isSharedCatalog(product)?'Uso compartilhado':product.usage_scope==='ecommerce'?'E-commerce':'Matéria-prima';
      copy.appendChild(purpose);
      if(!copy.querySelector('.product-visibility-state')){
        const state=document.createElement('small');
        state.className=`product-visibility-state ${product.hidden_from_collaborators?'hidden-for-collaborators':'shown-for-collaborators'}`;
        state.textContent=product.hidden_from_collaborators?'Oculto para colaboradoras de produção':'Visível para todos os perfis';
        copy.appendChild(state);
      }
      if(!isRequestAvailable(product)){
        row.classList.add('product-row-unavailable');
        const state=document.createElement('small');
        state.className='product-visibility-state unavailable-for-requests';
        state.textContent=`Temporariamente indisponível · ${availabilityLabels[product.availability_status]||'Aguardando reposição'}`;
        copy.appendChild(state);
      }
    });
  };

  window.HarmonyProductVisibility=Object.freeze({isProductionCatalog,isEcommerceCatalog,isSharedCatalog,isManagedCatalog,requestScopes,isInRequestCatalog,visibleForRequests,isRequestAvailable,availabilityMessage});
})();
