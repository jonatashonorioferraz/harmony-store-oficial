function normalizeSearch(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

const listControlState={};

function addRefreshControl(){
  if(!S?.profile||document.querySelector('#refreshData'))return;
  const actions=document.querySelector('.page-head .head-actions');
  if(!actions)return;
  const button=document.createElement('button');
  button.type='button';
  button.id='refreshData';
  button.className='outline compact-action';
  button.textContent='↻ Atualizar';
  button.onclick=async()=>{
    button.disabled=true;
    button.textContent='Atualizando…';
    try{await loadData();renderApp();toast('Dados atualizados.')}catch(error){alert(error.message);button.disabled=false;button.textContent='↻ Atualizar'}
  };
  actions.prepend(button);
}

function createListToolbar({container,items,placeholder,statuses,getStatus,key=S.view,mountBefore=container,toolbarClass=''}){
  if(!container||!mountBefore||document.querySelector(`.list-toolbar[data-list-toolbar="${key}"]`))return;
  const saved=listControlState[key]||{term:'',status:''};
  const toolbar=document.createElement('div');
  toolbar.className=`list-toolbar ${toolbarClass}`.trim();
  toolbar.dataset.listToolbar=key;
  toolbar.innerHTML=`<label class="list-search"><span>Buscar</span><input type="search" placeholder="${placeholder}" autocomplete="off"></label>${statuses?`<label class="list-status"><span>Filtrar</span><select><option value="">Todos</option>${statuses.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>`:''}<small class="result-count" aria-live="polite"></small>`;
  mountBefore.parentNode.insertBefore(toolbar,mountBefore);
  const input=toolbar.querySelector('input'),select=toolbar.querySelector('select'),count=toolbar.querySelector('.result-count');
  input.value=saved.term||'';
  if(select)select.value=saved.status||'';
  const filter=()=>{
    const term=normalizeSearch(input.value),status=select?.value||'';
    listControlState[key]={term:input.value,status};
    let visible=0;
    items.forEach(item=>{
      const matchesText=!term||normalizeSearch(item.textContent).includes(term);
      const matchesStatus=!status||getStatus?.(item)===status;
      item.hidden=!(matchesText&&matchesStatus);
      if(!item.hidden)visible++;
    });
    count.textContent=`${visible} ${visible===1?'resultado':'resultados'}`;
    container.classList.toggle('filtered-empty',visible===0);
  };
  input.addEventListener('input',filter);
  select?.addEventListener('change',filter);
  filter();
}

function addListControls(){
  if(!S?.profile)return;
  if(S.view==='new'){
    const container=document.querySelector('.catalog-layout > .products-grid'),mountBefore=document.querySelector('.catalog-layout');
    const products=S.products.filter(product=>product.active&&(S.profile?.role!=='collaborator'||product.hidden_from_collaborators!==true)),items=[...container?.querySelectorAll('.product')||[]];
    items.forEach((item,index)=>item.dataset.filterCategory=products[index]?.category_id||'uncategorized');
    const statuses=S.categories.filter(category=>category.active&&products.some(product=>product.category_id===category.id)).map(category=>[category.id,category.name]);
    if(products.some(product=>!product.category_id))statuses.push(['uncategorized','Sem categoria']);
    createListToolbar({container,items,placeholder:'Nome, cor, unidade ou descrição',statuses,getStatus:item=>item.dataset.filterCategory,key:'new-products',mountBefore,toolbarClass:'catalog-search-toolbar card'});
  }
  if(S.view==='requests'){
    const container=document.querySelector('.requests');
    createListToolbar({
      container,
      items:[...document.querySelectorAll('.requests article')],
      placeholder:'Protocolo, solicitante ou observação',
      statuses:[['pending','Pendentes'],['separating','Em separação'],['scheduled','Agendadas'],['delivered','Entregues'],['cancelled','Canceladas']],
      getStatus:item=>[...item.querySelector('.badge')?.classList||[]].find(value=>labels[value])||'',
      key:'requests'
    });
  }
  if(S.view==='products'){
    const container=document.querySelector('.table');
    createListToolbar({
      container,
      items:[...document.querySelectorAll('.table article')],
      placeholder:'Nome, unidade ou estoque',
      statuses:[['normal','Estoque normal'],['low','Estoque baixo']],
      getStatus:item=>item.querySelector('.badge')?.classList.contains('low')?'low':'normal',
      key:'products'
    });
  }
  if(S.view==='team'){
    const container=document.querySelector('.team');
    createListToolbar({
      container,
      items:[...document.querySelectorAll('.team .person')],
      placeholder:'Nome, login, setor ou Harmony ID',
      statuses:[['active','Ativos'],['inactive','Inativos']],
      getStatus:item=>item.querySelector('.badge')?.classList.contains('inactive')?'inactive':'active',
      key:'team'
    });
  }
  if(S.view==='categories'){
    const container=document.querySelector('.categories'),items=[...container?.querySelectorAll('.tile')||[]];
    items.forEach((item,index)=>item.dataset.filterStatus=S.categories[index]?.active?'active':'inactive');
    createListToolbar({container,items,placeholder:'Nome da categoria',statuses:[['active','Ativas'],['inactive','Inativas']],getStatus:item=>item.dataset.filterStatus,key:'categories'});
  }
  if(S.view==='fields'){
    const container=document.querySelector('.fields'),items=[...container?.querySelectorAll('.tile')||[]];
    items.forEach((item,index)=>item.dataset.filterScope=S.fields[index]?.scope||'product');
    createListToolbar({container,items,placeholder:'Nome ou tipo do campo',statuses:[['product','Produtos'],['profile','Colaboradoras']],getStatus:item=>item.dataset.filterScope,key:'fields'});
  }
  if(S.view==='production'){
    const receipts=document.querySelector('.receipt-collections');
    if(receipts)createListToolbar({container:receipts,items:[...receipts.querySelectorAll('.collection-card')],placeholder:'Colaboradora, caixa, modelo ou cor',statuses:[['open','Em aberto'],['closed','Semana fechada']],getStatus:item=>item.querySelector('.production-closed')?'closed':'open',key:'production-receipts'});
    const models=document.querySelector('.finished-model-grid');
    if(models)createListToolbar({container:models,items:[...models.querySelectorAll('.finished-model')],placeholder:'Nome, cor ou valor',statuses:[['active','Ativos'],['inactive','Inativos']],getStatus:item=>item.querySelector('.badge')?.classList.contains('inactive')?'inactive':'active',key:'production-models'});
    const closings=document.querySelector('.closing-list');
    if(closings)createListToolbar({container:closings,items:[...closings.querySelectorAll('article')],placeholder:'Colaboradora, produção ou pagamento',statuses:[['open','Em aberto'],['closed','Fechados'],['paid','Pagos']],getStatus:item=>item.querySelector('.production-paid')?'paid':item.querySelector('.production-closed')?'closed':'open',key:'production-weeks'});
  }
  if(S.view==='intelligence'){
    const suppliers=document.querySelector('.supplier-grid');
    if(suppliers)createListToolbar({container:suppliers,items:[...suppliers.querySelectorAll('.supplier-card')],placeholder:'Fornecedor, contato ou material',statuses:[['active','Ativos'],['inactive','Inativos']],getStatus:item=>item.querySelector('.badge')?.classList.contains('inactive')?'inactive':'active',key:'intelligence-suppliers'});
    const purchases=document.querySelector('.purchase-list');
    if(purchases)createListToolbar({container:purchases,items:[...purchases.querySelectorAll('article')],placeholder:'Pedido, fornecedor ou previsão',statuses:[['draft','Rascunhos'],['ordered','Enviados'],['received','Recebidos'],['cancelled','Cancelados']],getStatus:item=>[...item.querySelector('.badge')?.classList||[]].find(value=>value.startsWith('purchase-'))?.replace('purchase-','')||'',key:'intelligence-purchases'});
  }
}

function updateConnectionBanner(){
  let banner=document.querySelector('#connectionBanner');
  if(navigator.onLine){banner?.remove();return}
  if(banner)return;
  banner=document.createElement('div');
  banner.id='connectionBanner';
  banner.className='connection-banner';
  banner.setAttribute('role','status');
  banner.textContent='Sem conexão. Você pode consultar telas já carregadas; alterações serão liberadas quando a internet voltar.';
  document.body.appendChild(banner);
}

function addAdminCancelControl(){
  if(S?.profile?.role!=='admin'||document.querySelector('#cancelReq'))return;
  const request=typeof requestFromOpenModal==='function'?requestFromOpenModal():null;
  if(!request||['delivered','cancelled'].includes(request.status))return;
  const deleteButton=document.querySelector('#deleteReq');
  if(!deleteButton)return;
  const button=document.createElement('button');
  button.type='button';
  button.id='cancelReq';
  button.className='outline full';
  button.textContent='Cancelar e manter no histórico';
  button.onclick=async()=>{
    const reason=prompt('Informe o motivo do cancelamento:');
    if(reason===null)return;
    button.disabled=true;
    try{await rpc('admin_cancel_request',{p_request_id:request.id,p_reason:reason});await refreshClose('Solicitação cancelada e mantida no histórico.')}catch(error){alert(error.message);button.disabled=false}
  };
  deleteButton.parentNode.insertBefore(button,deleteButton);
}

const expressiveMenuIcons={
  home:'🏠',
  new:'📝',
  requests:'📋',
  products:'🧼',
  categories:'🎨',
  team:'👥',
  fields:'🛠️',
  audit:'📜',
  profile:'👤'
};

const harmonyRoleThemes={
  admin:{label:'Administração',icon:'✦',color:'#d84f91'},
  receiver:{label:'Recebimento',icon:'◈',color:'#6797e9'},
  collaborator:{label:'Ateliê',icon:'♡',color:'#c95d94'},
  guest:{label:'Harmony Store',icon:'✦',color:'#d84f91'}
};

function applyHarmonyRoleTheme(){
  const role=S?.profile?.role||'guest',theme=harmonyRoleThemes[role]||harmonyRoleThemes.guest;
  document.documentElement.dataset.role=role;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.color);
  const topbar=document.querySelector('.topbar');
  if(topbar&&!topbar.querySelector('.role-theme-pill')){
    const pill=document.createElement('span');
    pill.className='role-theme-pill';
    pill.innerHTML=`<i>${theme.icon}</i>${theme.label}`;
    topbar.appendChild(pill);
  }
}

function enhanceLoginAtmosphere(){
  const story=document.querySelector('.login .story');
  if(!story||story.querySelector('.soap-bubbles'))return;
  const bubbles=document.createElement('div');
  bubbles.className='soap-bubbles';
  bubbles.setAttribute('aria-hidden','true');
  bubbles.innerHTML=Array.from({length:9},(_,index)=>`<i style="--bubble:${index}"></i>`).join('');
  story.appendChild(bubbles);
}

function animateFreshElements(){
  document.querySelectorAll('.metric,.card,.production-metrics article,.production-section,.intelligence-metrics article').forEach((element,index)=>{
    if(element.dataset.harmonyAnimated)return;
    element.dataset.harmonyAnimated='true';
    element.style.setProperty('--enter-order',String(Math.min(index,7)));
    element.classList.add('harmony-enter');
  });
}

function addButtonFeedback(){
  if(document.body.dataset.harmonyFeedback)return;
  document.body.dataset.harmonyFeedback='true';
  document.addEventListener('pointerdown',event=>{
    const button=event.target.closest('button');
    if(!button||button.disabled)return;
    button.classList.remove('harmony-tap');
    void button.offsetWidth;
    button.classList.add('harmony-tap');
  });
}

function enhanceMobileMenu(){
  document.querySelectorAll('.nav[data-view]').forEach(button=>{
    const icon=button.querySelector('i'),value=expressiveMenuIcons[button.dataset.view];
    if(icon&&value&&icon.textContent!==value)icon.textContent=value;
  });
  const navRoot=document.querySelector('.sidebar nav'),active=navRoot?.querySelector('.nav.active');
  if(navRoot&&active&&matchMedia('(max-width:720px)').matches&&navRoot.dataset.activeView!==active.dataset.view){
    navRoot.dataset.activeView=active.dataset.view;
    requestAnimationFrame(()=>active.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}));
  }
}

function enhanceBrandPresentation(){
  document.querySelectorAll('img[src="logo.jpg"]').forEach(image=>{
    image.src='brand-mark.png';
    image.classList.add('harmony-brand-mark');
  });
}

function enhanceLoginMessage(){
  const story=document.querySelector('.login .story'),box=document.querySelector('.login-box');
  if(story&&!story.querySelector('.brand-message')){
    const message=document.createElement('blockquote');
    message.className='brand-message brand-message-desktop';
    message.textContent='“Um Sonho que virou realidade. Deus é bom o tempo todo”';
    story.insertBefore(message,story.querySelector('.artisan'));
  }
  if(box&&!box.querySelector('.brand-message')){
    const message=document.createElement('blockquote');
    message.className='brand-message brand-message-mobile';
    message.textContent='“Um Sonho que virou realidade. Deus é bom o tempo todo”';
    box.appendChild(message);
  }
}

function enhanceLoginMascot(){
  const story=document.querySelector('.login .story'),box=document.querySelector('.login-box');
  if(story&&!story.querySelector('.login-mascot-desktop')){
    const mascot=document.createElement('img');
    mascot.src='mascote-artesa.png';
    mascot.alt='Mascote artesã loira da Harmony Store';
    mascot.className='login-mascot login-mascot-desktop';
    story.appendChild(mascot);
  }
  if(box&&!box.querySelector('.login-mascot-mobile')){
    const mascot=document.createElement('img');
    mascot.src='mascote-artesa.png';
    mascot.alt='Mascote artesã loira da Harmony Store';
    mascot.className='login-mascot login-mascot-mobile';
    const message=box.querySelector('.brand-message-mobile');
    if(message)box.insertBefore(mascot,message);else box.appendChild(mascot);
  }
}

function enhanceDailyWelcome(){
  if(!S?.profile||S.view!=='home'||!window.HarmonyDaily)return;
  const page=document.querySelector('#page .page'),pageHead=page?.querySelector('.page-head');
  if(!page||!pageHead||page.querySelector('.daily-welcome'))return;
  const now=new Date(),dateCode=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,firstName=String(S.profile.full_name||'').trim().split(/\s+/)[0]||'bem-vinda';
  const roleMessage=S.profile.role==='admin'
    ?'Painel organizado, ideias no lugar e um novo dia para cuidar da nossa história.'
    :S.profile.role==='receiver'
      ?'Olhar atento, caixas por perto e carinho em cada conferência. Vamos começar?'
      :'Seu cantinho de produção está prontinho. Vamos criar coisas lindas hoje?';
  const card=document.createElement('section');
  card.className='daily-welcome';
  card.setAttribute('aria-label','Boas-vindas e mensagem do dia');
  card.innerHTML=`<div class="daily-welcome-copy"><div class="daily-kicker"><span>HOJE NA HARMONY</span><time datetime="${dateCode}">${esc(now.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'}))}</time></div><h2>${esc(window.HarmonyDaily.greetingForDate(now))}, <em>${esc(firstName)}</em>! <i aria-hidden="true">🌷</i></h2><p>${esc(roleMessage)}</p></div><blockquote><i aria-hidden="true">✦</i><div><small>MENSAGEM DO DIA</small><p>${esc(window.HarmonyDaily.messageForDate(now))}</p></div></blockquote><div class="daily-decor" aria-hidden="true"><i>✦</i><i>♡</i><i>·</i></div>`;
  pageHead.insertAdjacentElement('afterend',card);
}

function improveApp(){applyHarmonyRoleTheme();addRefreshControl();addListControls();addAdminCancelControl();enhanceMobileMenu();enhanceBrandPresentation();enhanceLoginMessage();enhanceLoginMascot();enhanceLoginAtmosphere();enhanceDailyWelcome();animateFreshElements();addButtonFeedback();updateConnectionBanner()}
window.addEventListener('online',()=>{updateConnectionBanner();if(S?.profile)toast('Conexão restabelecida.')});
window.addEventListener('offline',updateConnectionBanner);
new MutationObserver(improveApp).observe(document.body,{childList:true,subtree:true});
improveApp();
