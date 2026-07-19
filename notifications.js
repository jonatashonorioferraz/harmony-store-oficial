const HarmonyNotifications=(()=>{
  const state={items:[],loaded:false,loading:null,filter:'all',lastLoaded:0};
  const priorityLabels={normal:'Informativo',important:'Importante',urgent:'Urgente'};
  const priorityIcons={normal:'🌷',important:'🔔',urgent:'🚨'};
  const isPrimary=()=>Boolean(S?.profile?.role==='admin'&&S.profile.is_primary_admin);
  const unread=()=>isPrimary()?0:state.items.filter(item=>!item.read_at).length;
  const date=value=>value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'';

  async function load(force=false){
    if(!S?.profile)return[];
    if(state.loading)return state.loading;
    if(!force&&state.loaded&&Date.now()-state.lastLoaded<30000)return state.items;
    state.loading=rpc('list_app_notifications',{p_limit:150}).then(items=>{
      state.items=Array.isArray(items)?items:[];
      state.loaded=true;state.lastLoaded=Date.now();updateBadge();return state.items;
    }).finally(()=>state.loading=null);
    return state.loading;
  }

  function updateBadge(){
    const button=document.querySelector('[data-view="notifications"]');
    if(!button)return;
    let badge=button.querySelector('.notification-count'),count=unread();
    if(!badge){badge=document.createElement('b');badge.className='notification-count';button.appendChild(badge)}
    const value=count>99?'99+':String(count);
    if(badge.textContent!==value)badge.textContent=value;
    badge.hidden=count===0;
    button.setAttribute('aria-label',count?`Notificações, ${count} não lidas`:'Notificações');
  }

  function addNavigation(){
    if(!S?.profile||document.querySelector('[data-view="notifications"]'))return;
    const nav=document.querySelector('.sidebar nav');if(!nav)return;
    const account=[...nav.querySelectorAll(':scope > small')].find(item=>item.textContent.trim()==='CONTA');
    const button=document.createElement('button');
    button.className=`nav ${S.view==='notifications'?'active':''}`;button.dataset.view='notifications';
    button.innerHTML='<i>🔔</i><span>Notificações</span><b class="notification-count" hidden>0</b>';
    button.onclick=()=>{S.view='notifications';renderApp()};
    nav.insertBefore(button,account||null);updateBadge();
  }

  function card(item,{compact=false}={}){
    const own=!isPrimary(),isUnread=own&&!item.read_at;
    return `<article class="notification-card priority-${esc(item.priority)} ${isUnread?'is-unread':''} ${compact?'is-compact':''}" data-notification-id="${item.id}" tabindex="0" role="button">
      <i class="notification-symbol" aria-hidden="true">${priorityIcons[item.priority]||'🔔'}</i>
      <div class="notification-copy"><div class="notification-meta"><span>${priorityLabels[item.priority]||'Aviso'}</span><time>${date(item.created_at)}</time></div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p>${item.due_at?`<strong>⏰ Prazo: ${date(item.due_at)}</strong>`:''}${isPrimary()?`<small>${item.audience==='global'?`Envio global · ${item.read_count||0} de ${item.recipient_count||0} leram`:`Para ${esc(item.target_name||'colaboradora')} · ${item.read_count?'lida':'ainda não lida'}`}</small>`:`<small>Enviado por ${esc(item.sender_name||'Harmony Store')}</small>`}</div>
      ${isUnread?'<span class="unread-dot" title="Não lida"></span>':''}
    </article>`;
  }

  function bindCards(root=document){
    root.querySelectorAll('[data-notification-id]').forEach(element=>{
      const open=()=>openDetail(state.items.find(item=>item.id===element.dataset.notificationId));
      element.onclick=open;element.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open()}};
    });
  }

  async function openDetail(item){
    if(!item)return;
    if(!isPrimary()&&!item.read_at){
      try{item.read_at=await rpc('mark_app_notification_read',{p_notification_id:item.id});updateBadge()}catch{}
    }
    $('#modal').innerHTML=`<div class="modal"><div class="modal-box notification-detail priority-${esc(item.priority)}"><div class="modal-head"><div><p class="eyebrow">${priorityIcons[item.priority]||'🔔'} ${priorityLabels[item.priority]||'NOTIFICAÇÃO'}</p><h2>${esc(item.title)}</h2></div><button type="button" data-close aria-label="Fechar">×</button></div><p class="notification-detail-body">${esc(item.body)}</p>${item.due_at?`<div class="notification-deadline"><i>⏰</i><div><small>PRAZO INFORMADO</small><b>${date(item.due_at)}</b></div></div>`:''}<footer><span>Enviada em ${date(item.created_at)}</span><span>Por ${esc(item.sender_name||'Harmony Store')}</span></footer><button class="primary full" data-close>Entendi</button></div></div>`;
    document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>{$('#modal').innerHTML='';if(S.view==='notifications')renderCenter()});
  }

  function centerList(){
    const items=state.items.filter(item=>state.filter!=='unread'||!item.read_at);
    return items.map(item=>card(item)).join('')||'<div class="empty">Nenhuma notificação encontrada.</div>';
  }

  function renderCenter(){
    if(S.view!=='notifications')return;
    const page=$('#page');if(!page)return;
    page.innerHTML=`<div class="page notifications-page">${head('COMUNICAÇÃO','Central de Notificações',isPrimary()?'Envie avisos e acompanhe a leitura da equipe.':'Confira os avisos importantes enviados pela Harmony Store.',isPrimary()?'<button class="primary" id="newGlobalNotification">＋ Notificação global</button>':'')}<section class="notification-hero card"><div><i>🔔</i><span><small>${isPrimary()?'PAINEL DE COMUNICAÇÃO':'SEUS AVISOS'}</small><b>${isPrimary()?state.items.length:unread()} ${isPrimary()?'envios registrados':'não lidas'}</b></span></div><p>${isPrimary()?'As mensagens ficam registradas no aplicativo mesmo quando o push do celular estiver desativado.':'Toque em cada aviso para abrir, ler os detalhes e confirmar a leitura.'}</p></section>${!isPrimary()?`<div class="notification-toolbar"><div class="segmented"><button class="${state.filter==='all'?'active':''}" data-notification-filter="all">Todas</button><button class="${state.filter==='unread'?'active':''}" data-notification-filter="unread">Não lidas</button></div>${unread()?'<button class="outline" id="markAllNotifications">Marcar todas como lidas</button>':''}</div>`:''}<section class="notification-list">${centerList()}</section></div>`;
    $('#newGlobalNotification')?.addEventListener('click',()=>openComposer());
    document.querySelectorAll('[data-notification-filter]').forEach(button=>button.onclick=()=>{state.filter=button.dataset.notificationFilter;renderCenter()});
    $('#markAllNotifications')?.addEventListener('click',async event=>{event.currentTarget.disabled=true;try{await rpc('mark_all_app_notifications_read',{});state.items.forEach(item=>item.read_at=item.read_at||new Date().toISOString());updateBadge();renderCenter();toast('Notificações marcadas como lidas.')}catch(error){alert(error.message);event.currentTarget.disabled=false}});
    bindCards(page);
    page.dataset.notificationsRendered=`${state.lastLoaded}-${state.filter}`;
  }

  function addHomePanel(){
    if(!S?.profile||S.view!=='home'||document.querySelector('.home-notifications'))return;
    const page=document.querySelector('#page .page'),anchor=page?.querySelector('.metrics');if(!page||!anchor)return;
    const visible=isPrimary()?state.items.slice(0,2):state.items.filter(item=>!item.read_at).slice(0,3);
    const section=document.createElement('section');section.className='home-notifications';
    section.innerHTML=`<header><div><span>${isPrimary()?'COMUNICAÇÃO DA EQUIPE':'AVISOS IMPORTANTES'}</span><h2>${isPrimary()?'Notificações enviadas':'Você tem '+unread()+' aviso'+(unread()===1?'':'s')+' para ler'}</h2></div><button class="outline" type="button">Ver central</button></header>${visible.length?`<div>${visible.map(item=>card(item,{compact:true})).join('')}</div>`:'<p class="home-notifications-empty">Tudo certo por aqui. Nenhum aviso novo no momento.</p>'}`;
    section.querySelector('header button').onclick=()=>{S.view='notifications';renderApp()};
    anchor.insertAdjacentElement('beforebegin',section);bindCards(section);
  }

  function addTeamControls(){
    if(!isPrimary()||S.view!=='team')return;
    const headActions=document.querySelector('.page-head .head-actions');
    if(headActions&&!document.querySelector('#newGlobalNotification')){
      const button=document.createElement('button');button.type='button';button.id='newGlobalNotification';button.className='outline';button.textContent='🔔 Aviso global';button.onclick=()=>openComposer();headActions.prepend(button);
    }
    document.querySelectorAll('.team .person').forEach((person,index)=>{
      const profile=S.team[index];if(!profile||profile.role==='admin'||person.querySelector('[data-notify-user]'))return;
      const actions=person.querySelector('.actions');if(!actions)return;
      const button=document.createElement('button');button.type='button';button.className='ghost';button.dataset.notifyUser=profile.id;button.textContent='🔔 Notificar';button.onclick=()=>openComposer(profile);actions.prepend(button);
    });
  }

  const tomorrowLocal=()=>{const d=new Date(Date.now()+86400000),pad=value=>String(value).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T18:00`};
  function applyTemplate(form,value){
    if(value==='request-reminder'){
      form.title.value='Lembrete: solicitação para a próxima coleta';
      form.body.value='Olá! Envie sua solicitação de matéria-prima até o prazo informado para prepararmos tudo com organização para a próxima coleta.';
      form.priority.value='urgent';form.due_at.value=tomorrowLocal();
    }else if(value==='collection'){
      form.title.value='Informação sobre a próxima coleta';
      form.body.value='Temos uma informação importante sobre a próxima coleta. Confira este aviso e organize sua produção com antecedência.';
      form.priority.value='important';
    }else if(value==='general'){
      form.title.value='Comunicado Harmony Store';form.body.value='';form.priority.value='normal';
    }
  }

  function openComposer(profile=null){
    if(!isPrimary())return;
    const individual=Boolean(profile);
    $('#modal').innerHTML=`<div class="modal"><form class="modal-box notification-compose" id="notificationForm"><div class="modal-head"><div><p class="eyebrow">🔔 COMUNICAÇÃO INTERNA</p><h2>${individual?'Notificar '+esc(profile.full_name):'Nova notificação global'}</h2></div><button type="button" data-close aria-label="Fechar">×</button></div><div class="notification-compose-guide"><i>✨</i><p>A mensagem ficará salva no aplicativo e também será enviada ao celular de quem ativou as notificações.</p></div><div class="form"><label class="wide">Modelo rápido<select name="template"><option value="">Escrever do zero</option><option value="request-reminder">Lembrete de solicitação</option><option value="collection">Informação de coleta</option><option value="general">Comunicado geral</option></select></label>${individual?`<input type="hidden" name="audience" value="individual"><input type="hidden" name="recipient_id" value="${profile.id}"><div class="notification-recipient wide"><i class="avatar">${initials(profile.full_name)}</i><div><small>DESTINATÁRIA</small><b>${esc(profile.full_name)}</b><span>${esc(profile.department||'Produção')}</span></div></div>`:'<input type="hidden" name="audience" value="global"><div class="notification-recipient global wide"><i>👥</i><div><small>DESTINATÁRIAS</small><b>Todas as colaboradoras ativas</b><span>Inclui colaboradoras de produção e recebimento</span></div></div>'}<label class="wide">Título<input name="title" maxlength="100" required placeholder="Ex.: Solicitação para a coleta de amanhã"></label><label>Prioridade<select name="priority"><option value="important">🔔 Importante</option><option value="urgent">🚨 Urgente</option><option value="normal">🌷 Informativo</option></select></label><label>Prazo (opcional)<input name="due_at" type="datetime-local"></label><label class="wide">Mensagem<textarea name="body" minlength="10" maxlength="1200" required placeholder="Escreva uma orientação clara e objetiva…"></textarea><small class="character-count">0 / 1200</small></label><div class="notification-preview wide" aria-live="polite"></div><div class="form-actions"><button type="button" class="outline" data-close>Cancelar</button><button class="primary">🔔 Enviar notificação</button></div></div></form></div>`;
    document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$('#modal').innerHTML='');
    const form=$('#notificationForm'),preview=form.querySelector('.notification-preview'),counter=form.querySelector('.character-count');
    const updatePreview=()=>{counter.textContent=`${form.body.value.length} / 1200`;preview.innerHTML=`<small>PRÉVIA</small><div class="priority-${esc(form.priority.value)}"><i>${priorityIcons[form.priority.value]}</i><span><b>${esc(form.title.value||'Título da notificação')}</b><p>${esc(form.body.value||'Sua mensagem aparecerá aqui.')}</p></span></div>`};
    form.template.onchange=()=>{applyTemplate(form,form.template.value);updatePreview()};form.title.oninput=updatePreview;form.body.oninput=updatePreview;form.priority.onchange=updatePreview;updatePreview();
    form.onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;button.textContent='Enviando…';const values=new FormData(form);try{
      const result=await rpc('primary_admin_send_notification',{p_title:values.get('title'),p_body:values.get('body'),p_priority:values.get('priority'),p_audience:values.get('audience'),p_recipient_id:values.get('recipient_id')||null,p_due_at:values.get('due_at')?new Date(values.get('due_at')).toISOString():null});
      const saved=Array.isArray(result)?result[0]:result;let push={sent:0};
      try{push=await sendAdminPush(saved.notification_id)}catch{}
      $('#modal').innerHTML='';await load(true);if(S.view==='notifications')renderCenter();else renderApp();
      toast(`Notificação enviada para ${saved.recipient_count} pessoa${Number(saved.recipient_count)===1?'':'s'}${push.sent?` · ${push.sent} push`:''}.`);
    }catch(error){alert(error.message);button.disabled=false;button.textContent='🔔 Enviar notificação'}};
  }

  async function sendAdminPush(notificationId){
    await ensureSession();
    const response=await fetch(API+'/functions/v1/send-push',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+S.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({event:'admin_message',notification_id:notificationId})});
    return json(response);
  }

  async function enhance(){
    if(!S?.profile)return;
    if(initialView==='notifications'&&!initialViewHandled){
      initialViewHandled=true;
      if(S.view!=='notifications'){S.view='notifications';renderApp();return}
    }
    addNavigation();
    try{await load()}catch{return}
    if(S.view==='notifications'){
      const page=$('#page'),version=`${state.lastLoaded}-${state.filter}`;
      if(page?.dataset.notificationsRendered!==version)renderCenter();
    }else{addHomePanel();addTeamControls();updateBadge()}
  }

  const initialView=new URLSearchParams(location.search).get('view');
  let initialViewHandled=false;
  new MutationObserver(()=>enhance()).observe(document.body,{childList:true,subtree:true});
  setInterval(()=>{if(S?.profile&&document.visibilityState==='visible')load(true).then(()=>{updateBadge();if(S.view==='home'){document.querySelector('.home-notifications')?.remove();addHomePanel()}}).catch(()=>{})},60000);
  return Object.freeze({state,load,unread,openComposer,renderCenter});
})();
