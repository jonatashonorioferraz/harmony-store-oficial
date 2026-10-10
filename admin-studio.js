(function(){
  'use strict';
  const root=document.documentElement;
  const allowed=()=>typeof S!=='undefined'&&S.profile?.role==='admin'&&S.profile.status==='active'&&!S.profile.must_change_password;
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icons={clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',tag:'<path d="M20 13l-7 7L3 10V3h7z"/><circle cx="7.5" cy="7.5" r="1"/>',box:'<path d="M12 3l9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5"/>',team:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0112 0v3M16 5a3 3 0 010 6M18 15a5 5 0 013 4v2"/>',arrow:'<path d="M5 12h14M14 7l5 5-5 5"/>'};
  const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.arrow}</svg>`;
  function snapshot(items,now=Date.now()){
    const open=(Array.isArray(items)?items:[]).filter(item=>['pending','separating','scheduled'].includes(item.status));
    const dated=open.map(item=>({item,time:typeof item.created_at==='string'&&item.created_at.trim()?Date.parse(item.created_at):NaN})).filter(row=>Number.isFinite(row.time)&&row.time<=now).sort((a,b)=>a.time-b.time||String(a.item.kind+':'+a.item.id).localeCompare(String(b.item.kind+':'+b.item.id)));
    return{total:open.length,pending:open.filter(item=>item.status==='pending').length,separating:open.filter(item=>item.status==='separating').length,scheduled:open.filter(item=>item.status==='scheduled').length,oldest:dated[0]?.item||null,days:dated.length?Math.floor((now-dated[0].time)/86400000):null};
  }
  function navigate(view){if(!allowed())return;S.view=view;renderApp()}
  function focusOldest(){
    if(!allowed()||S.view!=='home')return;
    const host=document.getElementById('adminRequestHub');
    host?.querySelector('[data-hub-filter="all"]')?.click();
    const sort=host?.querySelector('#hubArrivalOrder');
    if(sort&&sort.value!=='oldest'){sort.value='oldest';sort.dispatchEvent(new Event('change',{bubbles:true}))}
    const first=host?.querySelector('.hub-oldest')||host?.querySelector('.hub-request-card');
    if(first){first.scrollIntoView({block:'center',behavior:'auto'});first.focus({preventScroll:true})}
  }
  function paintSummary(page){
    const hub=page.querySelector('#adminRequestHub'),state=window.HarmonyRequestHub?.state;
    const ready=!!hub?.querySelector('.admin-request-hub')&&!!state&&!state.loading&&!state.error;
    const summary=ready?snapshot(state.items):null;
    const focus=page.querySelector('.admin-studio-focus'),pulse=page.querySelector('.admin-studio-pulse');
    if(!focus||!pulse)return;
    const signature=JSON.stringify([ready,state?.error||'',summary]);
    if(focus.dataset.summary===signature)return;
    focus.dataset.summary=signature;
    let title='Conferindo a fila de solicita\u00e7\u00f5es',note='Aguarde a consulta atual.',action='';
    if(state?.error){title='Fila indispon\u00edvel nesta consulta';note='Use Atualizar na central de pend\u00eancias.'}
    else if(summary?.oldest){
      const age=summary.days===0?'enviada hoje':`aguarda h\u00e1 ${summary.days} ${summary.days===1?'dia':'dias'}`;
      title=`Solicita\u00e7\u00e3o #${String(summary.oldest.protocol??'').padStart(4,'0')} ${age}`;
      note='Voc\u00ea decide a ordem.';
      action='<button type="button" class="admin-studio-focus-link">Ver mais antiga '+icon('arrow')+'</button>';
    }else if(summary){title=summary.total?'Confira as datas de envio':'Nenhuma solicita\u00e7\u00e3o em aberto';note=summary.total?'N\u00e3o foi poss\u00edvel confirmar a mais antiga.':'Fila consultada. Continue acompanhando sua opera\u00e7\u00e3o.'}
    focus.innerHTML=`<span class="admin-studio-focus-icon">${icon('clock')}</span><div><small>FOCO DE HOJE</small><strong>${escape(title)}</strong><p>${escape(note)}</p>${action}</div>`;
    focus.querySelector('button')?.addEventListener('click',focusOldest);
    pulse.innerHTML=`<div class="admin-studio-panel-title"><span class="admin-studio-section-mark"></span><h2>Pulso da opera&ccedil;&atilde;o</h2></div><p class="admin-studio-caption">Solicita&ccedil;&otilde;es abertas por etapa</p><div class="admin-studio-pulse-rows">${[['pending','Aguardando separa&ccedil;&atilde;o'],['separating','Em separa&ccedil;&atilde;o'],['scheduled','Agendadas']].map(([key,label])=>`<div class="admin-studio-pulse-row"><span>${label}</span><strong>${summary?summary[key]:'&mdash;'}</strong><div class="admin-studio-track" aria-hidden="true"><i style="width:${summary?.total?Math.round(summary[key]/summary.total*100):0}%"></i></div></div>`).join('')}</div><p class="admin-studio-caption">${summary?'Contagem da fila atual, n&atilde;o de unidades produzidas.':'Dados ainda n&atilde;o confirmados nesta consulta.'}</p><button type="button" class="admin-studio-text-link">Acompanhar solicita&ccedil;&otilde;es ${icon('arrow')}</button>`;
    pulse.querySelector('button').addEventListener('click',()=>navigate('requests'));
  }
  function decorateHome(){
    const page=document.querySelector('#page > .page');
    if(!page)return;
    const head=page.querySelector(':scope > .page-head'),hub=page.querySelector('#adminRequestHub');
    if(!head||!hub)return;
    if(!page.classList.contains('admin-studio-home')){
      page.classList.add('admin-studio-home');head.classList.add('admin-studio-hero');
      const title=head.querySelector('h1'),subtitle=head.querySelector(':scope > div:first-child > span'),eyebrow=head.querySelector('.eyebrow');
      if(title)title.textContent='Vis\u00e3o geral';
      if(subtitle)subtitle.textContent='Prioridades, produ\u00e7\u00e3o e planejamento em uma s\u00f3 vis\u00e3o.';
      if(eyebrow)eyebrow.textContent='HARMONY / ESPA\u00c7O ADM';
      const focus=document.createElement('aside');focus.className='admin-studio-focus';focus.setAttribute('aria-label','Foco de hoje');head.append(focus);
      const workspace=document.createElement('div');workspace.className='admin-studio-workspace';
      const metrics=page.querySelector(':scope > .metrics');
      if(metrics)metrics.after(workspace);else head.after(workspace);
      workspace.append(hub);
      const rail=document.createElement('aside');rail.className='admin-studio-rail';rail.setAttribute('aria-label','Resumo e atalhos administrativos');
      rail.innerHTML=`<section class="card admin-studio-pulse"></section><section class="card admin-studio-shortcuts"><div class="admin-studio-panel-title"><span class="admin-studio-section-mark"></span><h2>Atalhos do ateli&ecirc;</h2></div><div class="admin-studio-shortcut-grid">${[['label-lots','tag','Emitir etiquetas'],['products','box','Ver estoque'],['team','team','Colaboradoras']].map(([view,name,label])=>`<button type="button" data-studio-view="${view}">${icon(name)}<span>${label}</span><span class="admin-studio-shortcut-arrow" aria-hidden="true">&#8599;</span></button>`).join('')}</div></section>`;
      rail.querySelectorAll('[data-studio-view]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.studioView)));
      workspace.append(rail);
    }
    paintSummary(page);
  }
  function sync(){
    const active=allowed()&&!!document.querySelector('#app > .shell');
    root.toggleAttribute('data-admin-studio',active);
    if(!active)return;
    if(S.view==='home')decorateHome();
  }
  const previousRenderApp=renderApp;
  renderApp=function(...args){
    if(!allowed())root.removeAttribute('data-admin-studio');
    try{return previousRenderApp.apply(this,args)}finally{sync()}
  };
  const previousRenderPage=renderPage;
  renderPage=async function(...args){
    const id=S.profile?.id;
    try{return await previousRenderPage.apply(this,args)}finally{if(id===S.profile?.id)sync()}
  };
  let queued=false;
  const observer=new MutationObserver(()=>{
    if(queued)return;
    queued=true;queueMicrotask(()=>{queued=false;sync()});
  });
  const app=document.getElementById('app');
  if(app)observer.observe(app,{childList:true,subtree:true});
  window.HarmonyAdminStudio=Object.freeze({sync,snapshot});
  sync();
})();
