const HarmonyAppUsage=(()=>{
  const VERSION='v25.34',state={items:[],loadedAt:0,loading:null};
  let lastActivity=Date.now(),heartbeat=null;
  const isAdmin=()=>S?.profile?.role==='admin';
  const isWorker=()=>['collaborator','receiver'].includes(S?.profile?.role);
  const seconds=value=>Math.max(0,Number(value)||0);
  const duration=value=>{
    const total=seconds(value);
    if(total<60)return total?'menos de 1 min':'—';
    const hours=Math.floor(total/3600),minutes=Math.floor((total%3600)/60);
    return hours?`${hours}h ${minutes?minutes+'min':''}`.trim():`${minutes}min`;
  };
  const date=value=>value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Ainda não acessou';
  const status=item=>{
    if(!item.last_seen_at)return['never','Sem acesso'];
    const days=(Date.now()-new Date(item.last_seen_at).getTime())/86400000;
    if(days<=2)return['recent','Uso recente'];
    if(days<=7)return['attention','Pouco uso'];
    return['inactive','Sem uso recente'];
  };

  async function record(){
    if(!isWorker()||document.visibilityState!=='visible'||Date.now()-lastActivity>120000)return;
    try{await rpc('record_own_app_usage',{p_app_version:VERSION})}catch{}
  }
  function start(){
    if(!isWorker()){if(heartbeat)clearInterval(heartbeat);heartbeat=null;return}
    if(heartbeat)return;
    record();
    heartbeat=setInterval(record,60000);
  }
  async function load(force=false){
    if(!isAdmin())return[];
    if(state.loading)return state.loading;
    if(!force&&state.loadedAt&&Date.now()-state.loadedAt<60000)return state.items;
    state.loading=rpc('admin_list_app_usage_summary',{}).then(items=>{
      state.items=Array.isArray(items)?items:[];
      state.loadedAt=Date.now();
      return state.items;
    }).finally(()=>state.loading=null);
    return state.loading;
  }
  function rows(){
    return state.items.map(item=>{
      const [tone,label]=status(item);
      return `<article class="usage-row">
        <div><i class="avatar">${initials(item.full_name)}</i><span><b>${esc(item.full_name)}</b><small>${item.role==='receiver'?'Recebimento':'Produção'} · ${item.profile_status==='active'?'Ativa':'Inativa'}</small></span></div>
        <span><small>ÚLTIMO ACESSO</small><b>${date(item.last_seen_at)}</b></span>
        <span><small>HOJE</small><b>${duration(item.active_seconds_today)}</b></span>
        <span><small>7 DIAS</small><b>${duration(item.active_seconds_7d)}</b></span>
        <span><small>DIAS ATIVOS (30)</small><b>${Number(item.active_days_30d)||0}</b></span>
        <em class="usage-status ${tone}">${label}</em>
      </article>`;
    }).join('')||'<div class="empty">Nenhuma colaboradora cadastrada.</div>';
  }
  function renderPanel(){
    if(!isAdmin()||S.view!=='team'||document.querySelector('.app-usage-panel'))return;
    const page=document.querySelector('#page .page'),team=page?.querySelector('.team');
    if(!page||!team)return;
    const section=document.createElement('section');
    section.className='card app-usage-panel';
    section.innerHTML=`<header class="app-usage-head"><div><p class="eyebrow">ACOMPANHAMENTO ACOLHEDOR</p><h2>Uso do aplicativo</h2><span>Ajuda a perceber quem pode precisar de apoio, sem registrar telas, conteúdo ou localização.</span></div><button class="outline" type="button" data-refresh-usage>Atualizar</button></header><div class="usage-list">${rows()}</div><p class="usage-note">O tempo é aproximado e considera somente períodos com o aplicativo visível e em uso. Os dados começam a contar após esta versão.</p>`;
    page.insertBefore(section,team);
    section.querySelector('[data-refresh-usage]').onclick=async event=>{
      event.currentTarget.disabled=true;
      try{await load(true);section.querySelector('.usage-list').innerHTML=rows()}catch(error){alert(error.message)}
      finally{event.currentTarget.disabled=false}
    };
  }
  async function enhance(){
    start();
    if(!isAdmin()||S.view!=='team')return;
    try{await load();renderPanel()}catch{}
  }
  ['pointerdown','keydown','touchstart','scroll'].forEach(name=>addEventListener(name,()=>lastActivity=Date.now(),{passive:true}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){lastActivity=Date.now();record()}});
  new MutationObserver(()=>enhance()).observe(document.body,{childList:true,subtree:true});
  return Object.freeze({state,load,record,duration,status});
})();

