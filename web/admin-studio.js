(function(){
  'use strict';
  const root=document.documentElement;
  const allowed=()=>typeof S!=='undefined'&&S.profile?.role==='admin'&&S.profile.status==='active'&&!S.profile.must_change_password;
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const paths={home:'<path d="M3 10l9-8 9 8M5 9v12h5v-7h4v7h5V9"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6h5"/>',request:'<path d="M5 2h10l5 5v15H5zM14 2v6h6M9 12h7M9 16h7"/>',gear:'<path d="M9 3l1-2h4l1 2 3 1 2 3-1 3v4l1 3-2 3-3 1-1 2h-4l-1-2-3-1-2-3 1-3v-4L4 7l2-3z"/><circle cx="12" cy="12" r="4"/>',tag:'<path d="M21 12l-9 9L2 11V2h9z"/><circle cx="7" cy="7" r="1"/>',box:'<path d="M12 2l10 5v11l-10 5-10-5V7zM2 7l10 5 10-5M12 12v11M7 4.5l10 5"/>',team:'<circle cx="12" cy="7" r="3"/><path d="M5 21v-3a7 7 0 0114 0v3M4 4a3 3 0 000 6M20 4a3 3 0 010 6M2 14v5M22 14v5"/>',arrow:'<path d="M4 12h16M14 6l6 6-6 6"/>',chevron:'<path d="M9 5l7 7-7 7"/>',calendar:'<rect x="3" y="5" width="18" height="17" rx="2"/><path d="M7 2v6M17 2v6M3 11h18"/>',finance:'<path d="M3 21V11h4v10M10 21V3h4v18M17 21V7h4v14"/>',search:'<circle cx="10" cy="10" r="7"/><path d="M15 15l7 7"/>',bell:'<path d="M5 17h14l-2-4V8a5 5 0 00-10 0v5zM10 21h4M12 1v2"/>',sliders:'<path d="M3 5h18M3 12h18M3 19h18"/><circle cx="8" cy="5" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="19" r="2" fill="currentColor"/>',plus:'<path d="M12 3v18M3 12h18"/>',bolt:'<path d="M13 1L3 14h8l-1 9 11-14h-8z"/>',list:'<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',close:'<path d="M5 5l14 14M19 5L5 19"/>'};
  const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.arrow}</svg>`;
  const labels={home:'Vis\u00e3o geral',requests:'Solicita\u00e7\u00f5es','production-orders':'Produ\u00e7\u00e3o',products:'Produtos e estoque',team:'Colaboradoras','label-lots':'Lotes e etiquetas','commercial-calendar':'Calend\u00e1rio comercial','financial-contracts':'Financeiro',notifications:'Notifica\u00e7\u00f5es',profile:'Meu perfil',new:'Nova solicita\u00e7\u00e3o'};
  let owner=null,preferences={pulse:true,shortcuts:true,calendar:true};
  const initials=name=>String(name||'ADM').trim().split(/\s+/).map(word=>word[0]).filter(Boolean).filter((_,index,list)=>index===0||index===list.length-1).join('').toLocaleUpperCase('pt-BR');
  function snapshot(items,now=Date.now()){
    const open=(Array.isArray(items)?items:[]).filter(item=>['pending','separating','scheduled'].includes(item.status));
    const dated=open.map(item=>({item,time:typeof item.created_at==='string'&&item.created_at.trim()?Date.parse(item.created_at):NaN})).filter(row=>Number.isFinite(row.time)&&row.time<=now).sort((a,b)=>a.time-b.time||String(a.item.kind+':'+a.item.id).localeCompare(String(b.item.kind+':'+b.item.id)));
    return{total:open.length,pending:open.filter(item=>item.status==='pending').length,separating:open.filter(item=>item.status==='separating').length,scheduled:open.filter(item=>item.status==='scheduled').length,oldest:dated[0]?.item||null,days:dated.length?Math.floor((now-dated[0].time)/86400000):null,over24:dated.filter(row=>now-row.time>86400000).length};
  }
  function productionSnapshot(state){
    if(!state||state.loaded!==true||state.loading||!Array.isArray(state.orders))return null;
    const orders=state.orders.filter(order=>['draft','sent','viewed','acknowledged'].includes(order.status));
    const counts=[orders.filter(order=>order.status==='draft').length,orders.filter(order=>['sent','viewed'].includes(order.status)).length,orders.filter(order=>order.status==='acknowledged').length];
    return{total:orders.length,counts,percentages:counts.map(count=>orders.length?Math.round(count/orders.length*100):0)};
  }
  function navigate(view){if(!allowed())return;closeDialogs();S.view=view;renderApp()}
  function closeDialogs(){document.querySelectorAll?.('[data-studio-dialog]').forEach(dialog=>{dialog.close?.();dialog.remove()})}
  function dialog(title,body){
    closeDialogs();const element=document.createElement('dialog');element.className='studio-dialog';element.dataset.studioDialog='true';
    element.innerHTML=`<header><h2>${escape(title)}</h2><button type="button" aria-label="Fechar">${icon('close')}</button></header>${body}`;
    element.querySelector('header button').onclick=()=>element.close();element.addEventListener('close',()=>element.remove());document.body.append(element);element.showModal();return element;
  }
  function routeEntries(){
    const entries=new Map(Object.entries(labels));
    document.querySelectorAll('.sidebar nav [data-view]').forEach(button=>{if(button.dataset.view)entries.set(button.dataset.view,button.textContent.trim())});
    return [...entries];
  }
  function openSearch(){
    if(!allowed())return;
    const element=dialog('Buscar no sistema','<label class="studio-search-field">Encontre um m&oacute;dulo<input type="search" placeholder="Solicita&ccedil;&otilde;es, estoque, financeiro..." autocomplete="off"></label><div class="studio-search-results"></div>');
    const input=element.querySelector('input'),results=element.querySelector('.studio-search-results'),entries=routeEntries(),normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
    function paint(){const query=normalize(input.value);results.innerHTML=entries.filter(([,name])=>normalize(name).includes(query)).map(([view,name])=>`<button type="button" data-studio-route="${escape(view)}">${escape(name)}${icon('arrow')}</button>`).join('')||'<p>Nenhum m&oacute;dulo encontrado.</p>';bindRoutes(results)}
    input.oninput=paint;paint();input.focus();
  }
  function customize(){
    if(!allowed())return;
    const element=dialog('Personalizar painel',`<p>Escolha o que deseja ver na home. Os ajustes valem nesta sess&atilde;o, sem alterar seus dados.</p><div class="studio-preferences">${[['pulse','Pulso da produ\u00e7\u00e3o'],['shortcuts','Atalhos do ateli\u00ea'],['calendar','Calend\u00e1rio comercial']].map(([key,label])=>`<label><input type="checkbox" data-studio-option="${key}" ${preferences[key]?'checked':''}>${escape(label)}</label>`).join('')}</div><button type="button" class="studio-primary" data-studio-save>Aplicar ao painel</button>`);
    element.querySelector('[data-studio-save]').onclick=()=>{element.querySelectorAll('[data-studio-option]').forEach(input=>preferences[input.dataset.studioOption]=input.checked);element.close();if(S.view!=='home')navigate('home');else sync()};
  }
  function bindRoutes(host){host.querySelectorAll('[data-studio-route]').forEach(button=>button.onclick=()=>navigate(button.dataset.studioRoute))}
  function decorateShell(){
    const sidebar=document.querySelector('.sidebar');
    if(sidebar&&!sidebar.querySelector('.studio-brand')){
      const brand=document.createElement('button');brand.className='studio-brand';brand.type='button';brand.setAttribute('aria-label','Harmony Store Oficial, voltar para a home');brand.innerHTML='<span class="studio-monogram" aria-hidden="true">H</span><span class="studio-brand-name">Harmony</span><span class="studio-brand-sub">STORE OFICIAL</span>';brand.onclick=()=>navigate('home');sidebar.prepend(brand);
      const navigation=document.createElement('div');navigation.className='studio-nav';navigation.setAttribute('role','navigation');navigation.setAttribute('aria-label','Navega\u00e7\u00e3o administrativa');
      navigation.innerHTML=[['','home','home'],['','requests','request'],['OPERA\u00c7\u00c3O','production-orders','gear'],['','products','box'],['','team','team'],['','label-lots','tag'],['GEST\u00c3O','commercial-calendar','calendar'],['','financial-contracts','finance']].map(([group,view,name])=>`${group?`<p>${escape(group)}</p>`:''}<button type="button" data-studio-route="${view}" class="${S.view===view?'is-active':''}" ${S.view===view?'aria-current="page"':''}>${icon(name)}<span>${escape(labels[view])}</span>${view==='requests'?'<b class="studio-nav-count" hidden></b>':''}</button>`).join('');brand.after(navigation);bindRoutes(navigation);
      const native=sidebar.querySelector('nav');if(native){const more=document.createElement('details');more.className='studio-more';more.innerHTML='<summary>Todos os m&oacute;dulos <span aria-hidden="true">+</span></summary>';native.before(more);more.append(native)}
      const account=document.createElement('div');account.className='studio-account';account.innerHTML=`<button type="button" class="studio-account-person"><span class="studio-avatar">${escape(initials(S.profile.full_name))}</span><span><b>${escape(String(S.profile.full_name||'ADM').split(' ')[0])}</b><small>Administrador</small></span></button><button type="button" class="studio-account-settings" aria-label="Conta e configura&ccedil;&otilde;es">${icon('gear')}</button>`;sidebar.append(account);
      account.querySelector('.studio-account-person').onclick=()=>navigate('profile');account.querySelector('.studio-account-settings').onclick=()=>{const panel=dialog('Minha conta','<div class="studio-search-results"><button type="button" data-studio-route="profile">Meu perfil</button><button type="button" data-studio-logout>Sair do sistema</button></div>');bindRoutes(panel);panel.querySelector('[data-studio-logout]').onclick=()=>{closeDialogs();logout()}};
    }
    const topbar=document.querySelector('.topbar');if(!topbar)return;
    const stamp=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'short',year:'numeric'}).format(new Date());
    const signature=JSON.stringify([S.view,S.profile.id,stamp,window.HarmonyNotifications?.unread?.()??null]);
    let toolbar=topbar.querySelector('.studio-toolbar');if(!toolbar){toolbar=document.createElement('div');toolbar.className='studio-toolbar';topbar.append(toolbar)}
    if(toolbar.dataset.signature===signature)return;toolbar.dataset.signature=signature;
    const unread=window.HarmonyNotifications?.unread?.();
    toolbar.innerHTML=`<div class="studio-breadcrumb"><button type="button" data-studio-route="home" aria-label="In&iacute;cio">${icon('home')}</button><span>Harmony</span><i>/</i><strong>${escape(labels[S.view]||routeEntries().find(([view])=>view===S.view)?.[1]||'Gest\u00e3o')}</strong></div><span class="studio-today">${icon('calendar')}${escape(stamp)}</span><button type="button" class="studio-customize" aria-label="Personalizar painel">${icon('sliders')}<span>Personalizar painel</span></button><button type="button" class="studio-primary studio-new" data-studio-route="new">${icon('plus')}<span>Nova solicita&ccedil;&atilde;o</span></button><button type="button" class="studio-search" aria-label="Buscar no sistema">${icon('search')}<span>Buscar no sistema</span></button><button type="button" class="studio-bell" data-studio-route="notifications" aria-label="Notifica&ccedil;&otilde;es${Number.isInteger(unread)?', '+unread+' n\u00e3o lidas':''}">${icon('bell')}${unread>0?'<i></i>':''}</button><button type="button" class="studio-profile" data-studio-route="profile" aria-label="Meu perfil"><span class="studio-avatar">${escape(initials(S.profile.full_name))}</span><span aria-hidden="true">&#8964;</span></button>`;
    bindRoutes(toolbar);toolbar.querySelector('.studio-customize').onclick=customize;toolbar.querySelector('.studio-search').onclick=openSearch;
  }
  function age(item){const time=Date.parse(item.created_at||'');if(!Number.isFinite(time)||time>Date.now())return 'Conferir data';const days=Math.floor((Date.now()-time)/86400000);return days?`${days} ${days===1?'dia':'dias'}`:'Hoje'}
  function openItem(item){
    if(!allowed())return;
    const source=[...document.querySelectorAll('#adminRequestHub [data-hub-id]')].find(button=>button.dataset.hubId===String(item.id)&&button.dataset.hubKind===item.kind);
    if(source)return source.click();
    if(item.kind==='internal')return window.HarmonyInternalSupplies?.openRequest?.(item.id);
    const request=S.requests.find(row=>row.id===item.id);if(request)requestModalV2(request);
  }
  function focusOldest(){
    if(!allowed()||S.view!=='home')return;
    const host=document.getElementById('adminRequestHub');host?.querySelector('[data-hub-filter="all"]')?.click();
    const sort=host?.querySelector('#hubArrivalOrder');if(sort&&sort.value!=='oldest'){sort.value='oldest';sort.dispatchEvent(new Event('change',{bubbles:true}))}
    sync();const first=document.querySelector('.studio-request-row[data-oldest="true"]');if(first){first.scrollIntoView({block:'center',behavior:'auto'});first.focus({preventScroll:true})}
  }
  function queueMarkup(state,summary){
    const items=state.items.filter(item=>state.filter==='all'||item.kind===state.filter).slice().sort((a,b)=>state.order==='newest'?(b.queue_position||0)-(a.queue_position||0):(a.queue_position||Infinity)-(b.queue_position||Infinity));
    return `<div class="studio-panel-head"><div><h2><span class="studio-title-icon pink">${icon('list')}</span>Fila de solicita&ccedil;&otilde;es <b class="studio-count">${summary.total}</b></h2><p>${state.order==='newest'?'Mais recentes':'Mais antigas'} primeiro. Voc&ecirc; decide qual atender.</p></div><button type="button" class="studio-link" data-studio-route="requests">Ver todas ${icon('arrow')}</button></div><div class="studio-filters"><div>${[['all','Todas'],['production','Mat\u00e9ria-prima'],['internal','Suprimentos'],['ecommerce','E-commerce']].filter(([key])=>key!=='ecommerce'||state.items.some(item=>item.kind==='ecommerce')).map(([key,name])=>`<button type="button" data-studio-filter="${key}" aria-pressed="${state.filter===key}">${escape(name)}</button>`).join('')}</div><label><span class="studio-sr">Ordenar solicita&ccedil;&otilde;es</span><select data-studio-sort><option value="oldest" ${state.order==='oldest'?'selected':''}>Mais antigas</option><option value="newest" ${state.order==='newest'?'selected':''}>Mais recentes</option></select></label></div><div class="studio-row-head" aria-hidden="true"><span>ORDEM</span><span>SOLICITA&Ccedil;&Atilde;O</span><span>COLABORADORA</span><span>ESPERA</span><span>STATUS</span><span></span></div><div class="studio-queue-rows">${items.length?items.map(item=>{
      const oldest=summary.oldest?.id===item.id&&summary.oldest?.kind===item.kind,name=item.requester_name||'N\u00e3o informado',label={production:'Mat\u00e9ria-prima',internal:'Suprimentos',ecommerce:'E-commerce'}[item.kind]||'Solicita\u00e7\u00e3o',status={pending:'Pendente',separating:'Em separa\u00e7\u00e3o',scheduled:'Agendada'}[item.status]||item.status;
      return `<button type="button" class="studio-request-row ${oldest?'is-oldest':''}" data-studio-item="${escape(item.id)}" data-studio-kind="${escape(item.kind)}" data-oldest="${oldest}" aria-label="${escape(`${item.queue_position||'Sem posi\u00e7\u00e3o'} na fila. ${label} ${item.protocol??''}. ${name}. ${age(item)}. ${status}. Abrir detalhes.`)}"><span class="studio-order">${item.queue_position?String(item.queue_position).padStart(2,'0'):'&mdash;'}</span><span class="studio-request-title"><b>${escape(label)} &middot; #${escape(String(item.protocol??'').padStart(4,'0'))}</b>${oldest?'<small>Mais antiga</small>':''}</span><span class="studio-worker" title="${escape(name)}"><i>${escape(initials(name))}</i><b>${escape(name)}</b></span><span class="studio-age" title="${escape(item.created_at||'Data ausente')}">${escape(age(item))}</span><span class="studio-status ${escape(item.status)}">${icon(item.status==='pending'?'clock':item.status==='scheduled'?'calendar':'box')}${escape(status)}</span><span class="studio-row-arrow">${icon('chevron')}</span></button>`;
    }).join(''):'<p class="studio-empty">Nenhuma solicita&ccedil;&atilde;o neste filtro.</p>'}</div>`;
  }
  function calendarData(page){return [...page.querySelectorAll('#commercial-home .commercial-row')].slice(0,2).map(row=>({title:row.querySelector('.commercial-row-title')?.textContent?.trim()||'',day:row.querySelector('.commercial-date b')?.textContent?.trim()||'',month:row.querySelector('.commercial-date small')?.textContent?.trim()||'',meta:row.querySelector('.commercial-meta')?.textContent?.trim()||'',row})).filter(item=>item.title)}
  function paintHome(page,layout){
    const state=window.HarmonyRequestHub?.state,host=page.querySelector('#adminRequestHub');
    const ready=!!state&&!state.loading&&!state.error&&!!host?.querySelector('.admin-request-hub');
    const summary=ready?snapshot(state.items):null,production=productionSnapshot(window.HarmonyProductionOrders?.state);
    const stock=Array.isArray(S.products)?S.products.filter(item=>item.active!==false&&[item.physical_stock,item.reserved_stock,item.minimum_stock].every(value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value)))&&Number(item.physical_stock)-Number(item.reserved_stock)<=Number(item.minimum_stock)).length:null;
    const events=calendarData(page),calendarMessage=page.querySelector('#commercial-home .commercial-error,#commercial-home .commercial-empty,#commercial-home .commercial-status')?.textContent?.trim()||'';
    const signature=JSON.stringify([ready,state?.error,state?.filter,state?.order,state?.items,summary?.days,production,stock,events.map(({row:_,...event})=>event),calendarMessage,preferences]);
    if(layout.dataset.signature===signature)return;layout.dataset.signature=signature;
    const focus=summary?.oldest?`Solicita\u00e7\u00e3o #${String(summary.oldest.protocol??'').padStart(4,'0')} ${summary.days?`aguarda h\u00e1 ${summary.days} ${summary.days===1?'dia':'dias'}`:'enviada hoje'}`:state?.error?'Fila indispon\u00edvel nesta consulta':summary?.total?'Confira as datas de envio':summary?'Nenhuma solicita\u00e7\u00e3o em aberto':'Conferindo solicita\u00e7\u00f5es';
    layout.innerHTML=`<header class="studio-hero"><div><h1>Vis&atilde;o geral</h1><p>Prioridades, produ&ccedil;&atilde;o e planejamento em uma s&oacute; vis&atilde;o.</p></div><aside class="studio-focus" aria-label="Foco de hoje"><span class="studio-focus-clock">${icon('clock')}</span><div><small>FOCO DE HOJE</small><strong>${escape(focus)}</strong><p>Voc&ecirc; decide a ordem.</p></div>${summary?.oldest?'<button type="button" data-studio-oldest>Ver mais antiga '+icon('arrow')+'</button>':''}</aside></header>
      <section class="studio-metrics" aria-label="Indicadores da opera&ccedil;&atilde;o">${[['pink','request',summary?.total,'Solicita\u00e7\u00f5es abertas',summary?`${summary.over24} aguardam h\u00e1 mais de 24h`:'Consulta n\u00e3o confirmada','requests'],['blue','gear',production?.total,'Ordens de produ\u00e7\u00e3o',production?'Ordens na consulta atual':'Aguardando consulta do m\u00f3dulo','production-orders'],['gold','box',stock,'Aten\u00e7\u00f5es no estoque','Materiais no limite ou abaixo do m\u00ednimo','products']].map(([tone,name,count,title,note,route])=>`<button type="button" class="studio-metric ${tone}" data-studio-route="${route}"><span class="studio-metric-icon">${icon(name)}</span><span class="studio-metric-copy"><strong>${count===null||count===undefined?'&mdash;':String(count).padStart(2,'0')}</strong><b>${escape(title)}</b><small>${escape(note)}</small></span><span class="studio-metric-arrow">${icon('chevron')}</span><i class="studio-metric-accent"></i></button>`).join('')}</section>
      <div class="studio-main-grid"><section class="studio-panel studio-queue">${summary?queueMarkup(state,summary):`<div class="studio-panel-head"><h2><span class="studio-title-icon pink">${icon('list')}</span>Fila de solicita&ccedil;&otilde;es</h2></div><p class="studio-empty" role="status">${state?.error?'Fila indispon&iacute;vel. Nenhum total foi confirmado.':'Conferindo as solicita&ccedil;&otilde;es da consulta atual...'}</p><button type="button" class="studio-link" data-studio-refresh>Atualizar fila ${icon('arrow')}</button>`}</section>
      <aside class="studio-right"><section class="studio-panel studio-production" data-studio-section="pulse" ${preferences.pulse?'':'hidden'}><div class="studio-panel-head"><h2><span class="studio-title-icon rose">${icon('finance')}</span>Pulso da produ&ccedil;&atilde;o</h2><button type="button" class="studio-link" data-studio-route="production-orders">Acompanhar ${icon('arrow')}</button></div><div class="studio-stages">${[['request','Prepara&ccedil;&atilde;o'],['gear','Enviadas'],['box','Confirmadas']].map(([name,label])=>`<div><span>${icon(name)}</span><b>${label}</b></div>`).join('')}</div><div class="studio-production-bars">${['Rascunhos','Enviadas / vistas','Recebimento confirmado'].map((label,index)=>`<div class="studio-production-row tone-${index}"><span>${label}</span><div class="studio-bar"><i style="width:${production?.percentages[index]||0}%"></i></div><b>${production?production.percentages[index]+'%':'&mdash;'}</b></div>`).join('')}</div><p class="studio-production-note">${production?'Distribui&ccedil;&atilde;o das ordens consultadas. Confirma&ccedil;&atilde;o n&atilde;o significa produ&ccedil;&atilde;o conclu&iacute;da.':'Dados ainda n&atilde;o confirmados. Abra Produ&ccedil;&atilde;o para consultar.'}</p></section>
      <section class="studio-panel studio-shortcuts" data-studio-section="shortcuts" ${preferences.shortcuts?'':'hidden'}><h2><span class="studio-title-icon bolt">${icon('bolt')}</span>Atalhos do ateli&ecirc;</h2><div>${[['label-lots','tag','Emitir etiquetas'],['products','box','Ver estoque'],['team','team','Colaboradoras']].map(([route,name,label])=>`<button type="button" data-studio-route="${route}">${icon(name)}<span>${label}</span><i>${icon('chevron')}</i></button>`).join('')}</div></section></aside></div>
      <section class="studio-panel studio-calendar" data-studio-section="calendar" ${preferences.calendar?'':'hidden'}><div class="studio-panel-head"><h2><span class="studio-title-icon calendar">${icon('calendar')}</span>Calend&aacute;rio comercial</h2><span class="studio-gold-line"></span><button type="button" class="studio-link" data-studio-route="commercial-calendar">Abrir calend&aacute;rio ${icon('arrow')}</button></div><div class="studio-events">${events.length?events.map((event,index)=>`<button type="button" class="studio-event tone-${index}" data-studio-event="${index}"><span class="studio-event-date"><b>${escape(event.day)}</b><small>${escape(event.month)}</small></span><span class="studio-event-copy"><b>${escape(event.title)}</b><small>${escape(event.meta||'Abrir planejamento da campanha')}</small></span>${icon('calendar')}</button>`).join(''):`<p class="studio-calendar-empty">${escape(calendarMessage||'Consultando as pr\u00f3ximas oportunidades. Acesse o calend\u00e1rio para acompanhar.')}</p>`}</div></section>`;
    bindRoutes(layout);layout.querySelector('[data-studio-oldest]')?.addEventListener('click',focusOldest);
    layout.querySelector('[data-studio-refresh]')?.addEventListener('click',()=>window.HarmonyRequestHub?.mount?.(true));
    layout.querySelectorAll('[data-studio-filter]').forEach(button=>button.onclick=()=>host.querySelector(`[data-hub-filter="${button.dataset.studioFilter}"]`)?.click());
    const sort=layout.querySelector('[data-studio-sort]');if(sort)sort.onchange=()=>{const original=host.querySelector('#hubArrivalOrder');if(original){original.value=sort.value;original.dispatchEvent(new Event('change',{bubbles:true}))}};
    layout.querySelectorAll('[data-studio-item]').forEach(button=>button.onclick=()=>{const item=state.items.find(row=>String(row.id)===button.dataset.studioItem&&row.kind===button.dataset.studioKind);if(item)openItem(item)});
    layout.querySelectorAll('[data-studio-event]').forEach(button=>button.onclick=()=>{const event=events[Number(button.dataset.studioEvent)];const action=event.row.querySelector('button');if(action)action.click();else navigate('commercial-calendar')});
    const badge=document.querySelector('.studio-nav-count');if(badge){badge.hidden=!summary?.total;badge.textContent=summary?String(summary.total):''}
  }
  function decorateHome(){
    const page=document.querySelector('#page > .page');if(!page)return;
    page.classList.add('admin-studio-home');let layout=page.querySelector(':scope > .studio-layout');
    if(!layout){layout=document.createElement('div');layout.className='studio-layout';page.prepend(layout)}
    let extra=page.querySelector(':scope > .studio-extra');if(!extra){extra=document.createElement('details');extra.className='studio-extra';extra.innerHTML='<summary>Mais informa&ccedil;&otilde;es da opera&ccedil;&atilde;o</summary><div class="studio-extra-content"></div>';page.append(extra)}
    for(const child of [...page.children]){if(child===layout||child===extra||child.matches('.page-head,.metrics,#adminRequestHub,#commercial-home'))continue;extra.querySelector('.studio-extra-content').append(child)}
    paintHome(page,layout);
  }
  function sync(){
    const active=allowed()&&!!document.querySelector('#app > .shell');root.toggleAttribute('data-admin-studio',active);
    if(!active){owner=null;closeDialogs();return}
    if(owner!==S.profile.id){owner=S.profile.id;preferences={pulse:true,shortcuts:true,calendar:true};closeDialogs()}
    decorateShell();if(S.view==='home')decorateHome();
  }
  const previousRenderApp=renderApp;
  renderApp=function(...args){if(!allowed())root.removeAttribute('data-admin-studio');try{return previousRenderApp.apply(this,args)}finally{sync()}};
  const previousRenderPage=renderPage;
  renderPage=async function(...args){const id=S.profile?.id;try{return await previousRenderPage.apply(this,args)}finally{if(id===S.profile?.id)sync()}};
  let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;sync()})});
  const app=document.getElementById('app');if(app)observer.observe(app,{childList:true,subtree:true});
  window.HarmonyAdminStudio=Object.freeze({sync,snapshot,productionSnapshot});sync();
})();
