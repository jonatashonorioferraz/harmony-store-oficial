function normalizeSearch(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

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

function createListToolbar({container,items,placeholder,statuses,getStatus}){
  if(!container||container.previousElementSibling?.classList.contains('list-toolbar'))return;
  const toolbar=document.createElement('div');
  toolbar.className='list-toolbar';
  toolbar.innerHTML=`<label class="list-search"><span>Buscar</span><input type="search" placeholder="${placeholder}" autocomplete="off"></label>${statuses?`<label class="list-status"><span>Filtrar</span><select><option value="">Todos</option>${statuses.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>`:''}<small class="result-count" aria-live="polite"></small>`;
  container.parentNode.insertBefore(toolbar,container);
  const input=toolbar.querySelector('input'),select=toolbar.querySelector('select'),count=toolbar.querySelector('.result-count');
  const filter=()=>{
    const term=normalizeSearch(input.value),status=select?.value||'';
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
  if(S.view==='requests'){
    const container=document.querySelector('.requests');
    createListToolbar({
      container,
      items:[...document.querySelectorAll('.requests article')],
      placeholder:'Protocolo, solicitante ou observação',
      statuses:[['pending','Pendentes'],['separating','Em separação'],['scheduled','Agendadas'],['delivered','Entregues'],['cancelled','Canceladas']],
      getStatus:item=>[...item.querySelector('.badge')?.classList||[]].find(value=>labels[value])||''
    });
  }
  if(S.view==='products'){
    const container=document.querySelector('.table');
    createListToolbar({
      container,
      items:[...document.querySelectorAll('.table article')],
      placeholder:'Nome, unidade ou estoque',
      statuses:[['normal','Estoque normal'],['low','Estoque baixo']],
      getStatus:item=>item.querySelector('.badge')?.classList.contains('low')?'low':'normal'
    });
  }
  if(S.view==='team'){
    const container=document.querySelector('.team');
    createListToolbar({
      container,
      items:[...document.querySelectorAll('.team .person')],
      placeholder:'Nome, login, setor ou Harmony ID',
      statuses:[['active','Ativos'],['inactive','Inativos']],
      getStatus:item=>item.querySelector('.badge')?.classList.contains('inactive')?'inactive':'active'
    });
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

function enhanceMobileMenu(){
  document.querySelectorAll('.nav[data-view]').forEach(button=>{
    const icon=button.querySelector('i'),value=expressiveMenuIcons[button.dataset.view];
    if(icon&&value&&icon.textContent!==value)icon.textContent=value;
  });
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
    message.textContent='“Um sonho que virou realidade. Deus é bom tempo todo.”';
    story.insertBefore(message,story.querySelector('.artisan'));
  }
  if(box&&!box.querySelector('.brand-message')){
    const message=document.createElement('blockquote');
    message.className='brand-message brand-message-mobile';
    message.textContent='“Um sonho que virou realidade. Deus é bom tempo todo.”';
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

function improveApp(){addRefreshControl();addListControls();addAdminCancelControl();enhanceMobileMenu();enhanceBrandPresentation();enhanceLoginMessage();enhanceLoginMascot();updateConnectionBanner()}
window.addEventListener('online',()=>{updateConnectionBanner();if(S?.profile)toast('Conexão restabelecida.')});
window.addEventListener('offline',updateConnectionBanner);
new MutationObserver(improveApp).observe(document.body,{childList:true,subtree:true});
improveApp();
