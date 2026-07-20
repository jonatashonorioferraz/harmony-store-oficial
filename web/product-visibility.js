(()=>{
  const isProductionCatalog=product=>product.usage_scope==='production';
  const visibleForRequests=product=>product.active&&isProductionCatalog(product)&&(S.profile?.role!=='collaborator'||product.hidden_from_collaborators!==true);

  const originalRpc=rpc;
  rpc=async function(name,body){
    if(name==='admin_save_product'){
      name='admin_save_product_v2';
      body={...body,p_hidden_from_collaborators:Boolean(document.querySelector('#productForm [name="hidden_from_collaborators"]')?.checked)};
    }
    return originalRpc(name,body);
  };

  const originalProductModal=productModal;
  productModal=async function(product={}){
    await originalProductModal(product);
    const form=document.querySelector('#productForm .form');
    if(!form||form.querySelector('[name="hidden_from_collaborators"]'))return;
    const description=form.querySelector('label.wide');
    const field=document.createElement('label');
    field.className='check product-visibility-check wide';
    field.innerHTML=`<input name="hidden_from_collaborators" type="checkbox" ${product.hidden_from_collaborators?'checked':''}><span><b>Ocultar para colaboradoras de produção</b><small>O produto continuará visível para ADM principal, outros ADMs e colaboradoras de recebimento.</small></span>`;
    form.insertBefore(field,description||form.querySelector('.form-actions'));
  };

  const originalRenderNew=renderNew;
  renderNew=function(page){
    const fullProducts=S.products;
    const allowed=new Set(fullProducts.filter(visibleForRequests).map(product=>product.id));
    Object.keys(S.cart).forEach(id=>{if(!allowed.has(id))delete S.cart[id]});
    S.products=fullProducts.filter(visibleForRequests);
    try{return originalRenderNew(page)}finally{S.products=fullProducts}
  };

  const originalRequestModal=requestModalV2;
  requestModalV2=async function(request){
    const fullProducts=S.products;
    const editingOwnRequest=S.profile?.role!=='admin'&&request.status==='pending'&&request.requested_by===S.profile?.id;
    if(editingOwnRequest)S.products=fullProducts.filter(visibleForRequests);
    try{await originalRequestModal(request)}finally{S.products=fullProducts}
    if(!editingOwnRequest)return;
    document.querySelectorAll('[data-own-product]').forEach(input=>{
      const product=S.products.find(item=>item.id===input.dataset.ownProduct);
      if((!isProductionCatalog(product)||(S.profile?.role==='collaborator'&&product?.hidden_from_collaborators===true))&&Number(input.value||0)<=0)input.closest('.product')?.remove();
    });
  };

  const originalRenderProducts=renderProducts;
  renderProducts=function(page){
    const fullProducts=S.products;
    S.products=fullProducts.filter(isProductionCatalog);
    try{originalRenderProducts(page)}finally{S.products=fullProducts}
    const displayed=fullProducts.filter(isProductionCatalog);
    document.querySelectorAll('.table article').forEach((row,index)=>{
      const product=displayed[index],copy=row.querySelector('.table-product b');
      if(!product||!copy||copy.querySelector('.product-visibility-state'))return;
      const state=document.createElement('small');
      state.className=`product-visibility-state ${product.hidden_from_collaborators?'hidden-for-collaborators':'shown-for-collaborators'}`;
      state.textContent=product.hidden_from_collaborators?'Oculto para colaboradoras de produção':'Visível para todos os perfis';
      copy.appendChild(state);
    });
  };

  window.HarmonyProductVisibility=Object.freeze({isProductionCatalog,visibleForRequests});
})();
