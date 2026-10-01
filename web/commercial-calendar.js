/* Admin-only commercial planning. All mutations go through guarded RPCs. */
(function(){
  'use strict';
  const C=window.HarmonyCommercialCore;
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const $=(root,selector)=>root.querySelector(selector);
  const money=value=>(value/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const labels={recurring:'Data recorrente',predicted:'Campanha prevista',confirmed:'Fonte revisada',internal:'Plano interno',opportunity:'Planejamento sazonal'};
  const statuses={planning:'Em preparação',ready:'Pronta',live:'Em execução',completed:'Concluída',cancelled:'Cancelada'};
  let cache=null,cacheAt=0,cacheOwner=null,dialog=null,epoch=0,preferredChannel='';
  function admin(){return typeof S!=='undefined'&&S.profile?.role==='admin'&&S.profile?.status!=='inactive'}
  function reset(){epoch++;preferredChannel='';cache=null;cacheAt=0;cacheOwner=null;if(dialog){dialog.close();dialog.remove();dialog=null}}
  function go(){S.view='commercial-calendar';renderApp()}
  async function data(force=false){
    if(!admin())throw new Error('Acesso administrativo necessário.');
    const id=S.profile.id,now=C.today();
    if(cacheOwner!==id)reset();
    if(!force&&cache&&Date.now()-cacheAt<300000)return cache;
    const requestEpoch=epoch;
    try{
      const result=await rpc('commercial_calendar_dashboard',{p_from:C.add(now,-60),p_to:C.add(now,370)});
      if(!admin()||S.profile.id!==id||epoch!==requestEpoch)throw new Error('Sessão alterada.');
      const current={...result,unavailable:false};
      cache=current;cacheOwner=id;cacheAt=Date.now();return current;
    }catch(error){
      if(!admin()||S.profile.id!==id||epoch!==requestEpoch)throw error;
      return {unavailable:true,events:[],plans:[],owners:[],sources:[],error:'Não foi possível consultar os planos e a pesquisa. As datas-base abaixo não dependem dessa conexão.'};
    }
  }
  function events(d){
    const y=Number(C.today().slice(0,4)),now=C.today();
    return C.merge([...C.baseline(y-1),...C.baseline(y),...C.baseline(y+1)],d.events,d.plans)
      .filter(e=>e.start_date>=C.add(now,-60)&&e.start_date<=C.add(now,370));
  }
  function research(d){
    if(d.unavailable)return '<div class="commercial-status is-urgent" role="status"><div><b>Sincronização indisponível</b><p>'+escape(d.error)+'</p></div></div>';
    const r=C.research(d.settings,d.last_run,d.last_success_at);
    return '<div class="commercial-status is-'+r.level+'"><div><span class="commercial-kicker">'+escape(C.activation(d.settings))+'</span><b>'+escape(r.label)+'</b><p>'+escape(r.detail)+'</p></div></div>';
  }
  function pill(e){return '<span class="commercial-pill is-'+e.status+'">'+escape(labels[e.status]||e.status)+'</span>'}
  function dayBox(e){const parts=C.format(e.start_date).split(' ');return '<div class="commercial-date"><b>'+escape(e.start_date.slice(8))+'</b><small>'+escape(parts[2]||'')+'</small></div>'}
  function row(e){
    const sign=C.signal(e),ready=C.readiness(e);
    return '<article class="commercial-row">'+dayBox(e)+'<div><span class="commercial-row-title">'+escape(e.title)+'</span><div class="commercial-meta">'+pill(e)+'<span>'+escape(e.channel)+'</span><span>'+escape(sign.label)+'</span></div>'+(e.plan?'<div class="commercial-meta"><span>'+escape(statuses[e.plan.status])+'</span><span>'+ready.done+'/4 etapas</span></div>':'')+'</div><button class="commercial-btn" data-event="'+escape(e.key)+'" aria-label="Abrir '+escape(e.title)+'">Planejar</button></article>';
  }
  function bindRows(root,items,d,onChange){
    root.querySelectorAll('[data-event]').forEach(button=>button.onclick=()=>openEvent(items.find(e=>e.key===button.dataset.event),d,onChange));
  }
  function channelOverview(d,all){
    return '<section class="commercial-coverage" aria-label="Cobertura dos marketplaces">'+C.MARKETPLACES.map(channel=>{
      const state=C.coverage(channel,d),items=C.channelEvents(all,channel).filter(e=>C.between(C.today(),e.start_date)>=0&&C.between(C.today(),e.start_date)<=90);
      const confirmed=items.filter(e=>e.status==='confirmed').length;
      const pending=(d.events||[]).filter(e=>e.channel===channel&&e.status==='pending').length;
      return '<button class="commercial-channel is-'+state.level+'" data-channel-open="'+escape(channel)+'"><span class="commercial-row-title">'+escape(channel)+'</span><span class="commercial-channel-status">'+escape(state.label)+'</span>'+(state.detail?'<span class="commercial-muted">'+escape(state.detail)+'</span>':'')+'<span class="commercial-muted">'+(d.unavailable?'Dados de pesquisa indisponíveis':confirmed+' fontes revisadas · '+pending+' para revisar')+'</span><span class="commercial-channel-link">Planejar '+items.length+' oportunidades nos próximos 90 dias</span></button>';
    }).join('')+'</section><p class="commercial-notice">Oportunidades sazonais são ideias de planejamento, não campanhas anunciadas. Anúncios restritos ao portal do vendedor podem não estar acessíveis à pesquisa pública.</p>';
  }
  function bindChannels(root,onSelect){
    root.querySelectorAll('[data-channel-open]').forEach(button=>button.onclick=()=>onSelect(button.dataset.channelOpen));
  }
  async function renderHome(root){
    if(!root||!admin())return;
    const id=S.profile.id;
    root.innerHTML='<section class="commercial commercial-home commercial-panel" aria-busy="true"><p class="commercial-kicker">Agenda comercial</p><p>Carregando oportunidades...</p></section>';
    let d;try{d=await data()}catch{return}
    if(!root.isConnected||!admin()||S.profile.id!==id)return;
    const all=events(d),upcoming=all.filter(e=>C.between(C.today(),e.start_date)>=0&&!['cancelled','completed'].includes(e.plan?.status));
    const focus=upcoming.find(e=>C.readiness(e).done<4)||upcoming[0],urgent=upcoming.filter(e=>C.between(C.today(),e.start_date)<=30),pending=(d.events||[]).filter(e=>e.status==='pending').length;
    root.innerHTML='<section class="commercial commercial-home commercial-panel commercial-reveal"><div class="commercial-top"><div><p class="commercial-kicker">Antecipar para vender melhor</p><h2>Próximas oportunidades</h2></div><button class="commercial-btn" data-open>Ver agenda comercial</button></div><div class="commercial-home-grid"><div>'+
      (focus?'<div class="commercial-highlight"><span class="commercial-kicker">'+escape(C.signal(focus).label)+'</span><h3>'+escape(focus.title)+'</h3><p>'+escape(C.format(focus.start_date))+' · '+escape(focus.channel)+'</p>'+pill(focus)+'<p style="margin-top:10px">'+escape(C.ideas(focus)[0])+'.</p><button class="commercial-btn is-primary" data-event="'+escape(focus.key)+'">Preparar campanha</button></div>':'<p>Nenhuma data-base nesta janela.</p>')+
      '<div style="margin-top:14px">'+research(d)+'</div></div><div class="commercial-list">'+upcoming.slice(0,3).map(row).join('')+'</div></div><div class="commercial-metrics"><span><b>'+urgent.length+'</b>datas nos próximos 30 dias</span><span><b>'+(d.unavailable?'Indisponível':pending)+'</b>propostas para revisar</span><span>Alertas de preparação: 60, 30, 15 e 7 dias</span></div>'+channelOverview(d,all)+'</section>';
    bindChannels(root,channel=>{preferredChannel=channel;go()});
    $(root,'[data-open]').onclick=go;
    bindRows(root,all,d,()=>renderHome(root));
  }
  async function render(root,force=false){
    if(!admin()){root.innerHTML='<div class="commercial commercial-empty">Acesso restrito à administração.</div>';return}
    const id=S.profile.id;
    root.innerHTML='<div class="page commercial"><p role="status">Carregando agenda comercial...</p></div>';
    let d;try{d=await data(force)}catch{return}
    if(!root.isConnected||!admin()||S.profile.id!==id||S.view!=='commercial-calendar')return;
    const all=events(d),now=C.today();
    root.innerHTML='<div class="page commercial commercial-reveal"><header class="page-head"><div><p class="eyebrow">PLANEJAMENTO COMERCIAL</p><h1>Oportunidades à frente.</h1><span>Datas, preparação e fontes no mesmo lugar. Nenhuma campanha é publicada automaticamente.</span></div><div class="commercial-actions"><button class="commercial-btn" data-refresh>Atualizar dados</button><button class="commercial-btn is-primary" data-new '+(d.unavailable?'disabled':'')+'>Novo plano interno</button></div></header>'+
      research(d)+channelOverview(d,all)+'<div class="commercial-tabs" aria-label="Áreas da agenda"><button data-tab="agenda" aria-pressed="true">Agenda</button><button data-tab="plans" aria-pressed="false">Planos da equipe</button><button data-tab="review" aria-pressed="false">Revisar fontes ('+(d.unavailable?'?':(d.events||[]).filter(e=>e.status==='pending').length)+')</button><button data-tab="sources" aria-pressed="false">Pesquisa e orçamento</button></div>'+
      '<div class="commercial-toolbar"><label>Buscar oportunidade<input data-search type="search" placeholder="Nome da data ou campanha"></label><label>Canal<select data-channel><option value="">Todos</option>'+C.CHANNELS.map(v=>'<option>'+escape(v)+'</option>').join('')+'</select></label><label>Horizonte<select data-days><option value="30">Próximos 30 dias</option><option value="90" selected>Próximos 90 dias</option><option value="370">Próximos 12 meses</option><option value="past">Últimos 60 dias</option></select></label></div><section class="commercial-panel" data-content></section><p class="commercial-notice">Datas recorrentes seguem regras de calendário. Campanhas previstas não são anúncios confirmados. Prazos de produção e envio são estimativas em dias corridos; valide a operação antes de prometer entregas.</p></div>';
    let tab='agenda';
    $(root,'[data-channel]').value=preferredChannel;
    bindChannels(root,channel=>{preferredChannel=channel;$(root,'[data-channel]').value=channel;tab='agenda';root.querySelectorAll('[data-tab]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.tab===tab)));draw()});
    const content=$(root,'[data-content]');
    function draw(){
      $(root,'.commercial-toolbar').hidden=!['agenda','plans'].includes(tab);
      if(tab==='review'){drawReview(content,d,()=>render(root,true));return}
      if(tab==='sources'){drawSources(content,d);return}
      const query=$(root,'[data-search]').value.trim().toLocaleLowerCase('pt-BR'),channel=$(root,'[data-channel]').value,horizon=$(root,'[data-days]').value;
      const list=C.channelEvents(all,channel).filter(e=>{
        const days=C.between(now,e.start_date);
        return (tab!=='plans'||e.plan)&&(horizon==='past'?days<0&&days>=-60:days>=0&&days<=Number(horizon))&&(!channel||e.channel===channel)&&(!query||e.title.toLocaleLowerCase('pt-BR').includes(query));
      });
      let previous='';
      content.innerHTML=(tab==='plans'&&d.unavailable?'<p class="commercial-error">Planos indisponíveis. Não é possível concluir que não existam registros.</p>':'')+
        list.map(e=>{const month=e.start_date.slice(0,7),heading=month!==previous?'<div class="commercial-section-title"><h3>'+escape(new Date(e.start_date+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC',month:'long',year:'numeric'}))+'</h3></div>':'';previous=month;return heading+row(e)}).join('')+
        (!list.length?'<div class="commercial-empty">Nenhum item para estes filtros.</div>':'');
      bindRows(content,list,d,()=>render(root,true));
    }
    root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;root.querySelectorAll('[data-tab]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));draw()});
    $(root,'[data-search]').oninput=draw;$(root,'[data-channel]').onchange=()=>{preferredChannel=$(root,'[data-channel]').value;draw()};$(root,'[data-days]').onchange=draw;
    $(root,'[data-refresh]').onclick=()=>render(root,true);
    $(root,'[data-new]').onclick=()=>openEvent({key:'manual:'+crypto.randomUUID(),title:'',start_date:C.add(now,60),end_date:C.add(now,60),channel:'Loja própria',status:'internal',theme:'oferta'},d,()=>render(root,true),true);
    draw();
  }
  function drawSources(root,d){
    if(d.unavailable){root.innerHTML='<div class="commercial-empty">Configuração indisponível. Tente atualizar os dados.</div>';return}
    const s=d.settings;
    root.innerHTML='<div class="commercial-grid"><div><p class="commercial-kicker">Transparência</p><h3>Como a agenda se mantém atualizada</h3><div class="commercial-list">'+[
      ['01','Calendário-base','Regras anuais recalculam as datas móveis. Isso não confirma edições de marketplace.'],
      ['02','Pesquisa pública','Quando aprovada e ativada, um ciclo diário pesquisa Shopee, Mercado Livre e SHEIN separadamente, com no máximo uma consulta por canal, sem dados privados da empresa.'],
      ['03','Revisão humana','Uma descoberta vira proposta. Um administrador confere a fonte e decide se ela entra na agenda.'],
      ['04','Planejamento','Responsável, checklist e prazos ficam registrados; nada cria anúncios ou movimenta estoque.']
    ].map(x=>'<div class="commercial-row"><div class="commercial-date"><b>'+x[0]+'</b></div><div><b>'+x[1]+'</b><p class="commercial-muted">'+x[2]+'</p></div></div>').join('')+'</div><h3 style="margin-top:20px">Fontes autorizadas</h3><ul>'+(d.sources||[]).map(s=>'<li>'+escape(s.label)+' <small>('+escape(s.domain)+')</small></li>').join('')+'</ul><p class="commercial-notice">Busca pública tem cobertura limitada: anúncios atrás de login, regionais ou ainda não publicados podem não aparecer. Esta lista não garante que todos os eventos do e-commerce serão encontrados.</p></div><aside class="commercial-side"><p class="commercial-kicker">Pesquisa com controle</p><h3>'+money(s.monthly_budget_cents)+' / mês</h3><p>'+(s.enabled?'Controle interno ativo. Não é um limite garantido da fatura do provedor.':'Ativação desligada. Depende de configuração aprovada.')+'</p><dl><dt>Mês do controle</dt><dd>'+escape(String(s.budget_month).slice(0,7))+'</dd><dt>Reservado no mês</dt><dd>'+money(s.reserved_cents)+'</dd><dt>Reserva por tentativa</dt><dd>'+money(s.reserve_per_run_cents)+'</dd><dt>Programação do ciclo</dt><dd>Diária, 07h de Brasília; até 3 consultas, uma por marketplace</dd><dt>Última tentativa</dt><dd>'+escape(d.last_run?.finished_at?new Date(d.last_run.finished_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Sem término registrado')+'</dd><dt>Última conclusão integral</dt><dd>'+escape(d.last_success_at?new Date(d.last_success_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Nenhuma registrada')+'</dd></dl><p>Reserva não é cobrança efetiva. Câmbio, impostos e preços do provedor podem alterar a fatura. Tentativas com falha também consomem a reserva para evitar repetições sem limite.</p><p>Sem chave no navegador, sem busca a cada abertura e sem ativação por este painel.</p></aside></div>';
  }
  function drawReview(root,d,onChange){
    if(d.unavailable){root.innerHTML='<div class="commercial-empty">Revisão indisponível. Atualize os dados para consultar propostas.</div>';return}
    const proposals=(d.events||[]).filter(e=>e.status==='pending');
    root.innerHTML='<p class="commercial-kicker">Nada entra sem revisão</p><h3>Propostas encontradas nas fontes</h3><p class="commercial-notice">Abra a fonte e confira o ano, a data e as condições. Confirmar atualiza a agenda; não inscreve a loja na campanha.</p>'+
      (proposals.map(e=>'<article class="commercial-review" data-review="'+escape(e.id)+'"><h3>'+escape(e.title)+'</h3><div class="commercial-meta">'+escape(C.format(e.start_date))+' · '+escape(e.channel)+'</div><p>'+escape(e.source_excerpt)+'</p>'+source(e)+'<label style="display:block;margin:12px 0">Substituir previsão correspondente (opcional)<select data-baseline><option value="">Manter como oportunidade separada</option>'+C.baseline(Number(e.start_date.slice(0,4))).filter(b=>b.channel===e.channel).map(b=>'<option value="'+escape(b.key)+'">'+escape(b.title+' · '+C.format(b.start_date))+'</option>').join('')+'</select></label><div class="commercial-actions"><button class="commercial-btn is-primary" data-decision="confirmed">Conferi a fonte: confirmar</button><button class="commercial-btn" data-decision="rejected">Descartar proposta</button></div><div data-message role="status"></div></article>').join('')||'<div class="commercial-empty">Nenhuma proposta pendente. Isso não comprova ausência de campanhas novas nas plataformas.</div>');
    root.querySelectorAll('[data-review]').forEach(box=>box.querySelectorAll('[data-decision]').forEach(b=>b.onclick=async()=>{
      const item=proposals.find(e=>e.id===box.dataset.review),buttons=box.querySelectorAll('button');buttons.forEach(x=>x.disabled=true);
      const message=$(box,'[data-message]');
      try{
        await rpc('review_commercial_event',{p_id:item.id,p_revision:item.revision,p_decision:b.dataset.decision,p_baseline_key:$(box,'[data-baseline]').value||null});
        cache=null;onChange();
      }catch(error){message.className='commercial-error';message.textContent=error.message||'Não foi possível registrar a revisão.';buttons.forEach(x=>x.disabled=false)}
    }));
  }
  function source(e){
    const url=C.safeSource(e.source_url);
    return (url?'<a class="commercial-link" href="'+escape(url)+'" target="_blank" rel="noopener noreferrer">Consultar fonte oficial</a>':'<p class="commercial-muted">'+escape(e.rule||'Planejamento interno, sem confirmação de plataforma.')+'</p>')+
      (e.source_checked_at?'<p class="commercial-notice">Fonte consultada em '+escape(new Date(e.source_checked_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))+'. A publicação pode ser alterada depois da leitura.</p>':'');
  }
  function openEvent(e,d,onChange,isNew=false){
    if(!e||!admin())return;
    if(dialog){dialog.close();dialog.remove()}
    const plan=e.plan||{},idea=C.ideas(e),r=C.readiness(e);
    const node=document.createElement('dialog');dialog=node;node.className='commercial commercial-dialog';
    node.setAttribute('aria-labelledby','commercial-dialog-title');
    node.innerHTML='<div class="commercial-dialog-inner"><div class="commercial-top"><div><p class="commercial-kicker">'+(isNew?'Plano interno':escape(e.channel))+'</p><h2 id="commercial-dialog-title">'+(isNew?'Prepare uma campanha':escape(e.title))+'</h2></div><button class="commercial-btn" data-close aria-label="Fechar detalhes">Fechar</button></div>'+pill(e)+
      '<div style="margin-top:12px">'+source(e)+'</div><div class="commercial-timeline" data-timeline></div><div class="commercial-side"><p class="commercial-kicker">Sugestão editorial, não previsão de vendas</p><b>'+escape(idea[0])+'</b><p>'+escape(idea[1])+'</p></div>'+
      '<form class="commercial-form">'+(isNew?'<label class="commercial-wide">Nome da campanha<input name="title" minlength="3" maxlength="180" required></label>':'')+
      '<label>Data da oportunidade<input name="event_date" type="date" value="'+escape(e.start_date)+'" '+(!isNew?'readonly':'')+' required></label>'+
      '<label>Canal<select name="channel" '+(!isNew?'disabled':'')+'>'+C.CHANNELS.map(ch=>'<option '+(e.channel===ch?'selected':'')+'>'+escape(ch)+'</option>').join('')+'</select></label>'+
      '<label>Responsável<select name="owner_id"><option value="">Definir responsável</option>'+(d.owners||[]).map(o=>'<option value="'+escape(o.id)+'" '+(plan.owner_id===o.id?'selected':'')+'>'+escape(o.name)+'</option>').join('')+'</select></label>'+
      '<label>Situação<select name="status">'+Object.entries(statuses).map(([key,label])=>'<option value="'+key+'" '+((plan.status||'planning')===key?'selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
      '<label>Antecedência total (dias)<input type="number" name="lead_days" min="0" max="365" value="'+(plan.lead_days??60)+'" required></label>'+
      '<label>Produção (dias corridos)<input type="number" name="production_days" min="0" max="180" value="'+(plan.production_days??15)+'" required></label>'+
      '<label>Envio / chegada (dias corridos)<input type="number" name="shipping_days" min="0" max="90" value="'+(plan.shipping_days??7)+'" required></label>'+
      '<div><span class="commercial-muted">Preparação: <b data-readiness>'+r.done+'/4</b></span><div class="commercial-progress"><span data-progress style="width:'+r.percent+'%"></span></div></div>'+
      '<fieldset class="commercial-wide commercial-side"><legend>Checklist de preparação</legend><div class="commercial-checklist">'+Object.entries(C.CHECKS).map(([key,label])=>'<label><input type="checkbox" name="'+key+'" '+(plan.checklist?.[key]?'checked':'')+'>'+label+'</label>').join('')+'</div></fieldset>'+
      '<label class="commercial-wide">Briefing e decisões<textarea name="notes" maxlength="6000" placeholder="Público, oferta, produtos, margem, prazo e links de referência...">'+escape(plan.notes||'')+'</textarea></label>'+
      '<p class="commercial-notice commercial-wide">Datas de preparação são sugestões em dias corridos. Concluir o checklist não publica campanha nem reserva estoque.</p>'+
      '<div class="commercial-wide" data-message role="status"></div><div class="commercial-actions commercial-wide"><button class="commercial-btn is-primary" type="submit" '+(d.unavailable?'disabled':'')+'>Salvar planejamento</button><button class="commercial-btn" type="button" data-cancel>Voltar</button></div></form></div>';
    document.body.append(node);
    const close=()=>{node.close();node.remove();if(dialog===node)dialog=null};
    $(node,'[data-close]').onclick=close;$(node,'[data-cancel]').onclick=close;
    node.addEventListener('cancel',event=>{event.preventDefault();close()});
    const form=$(node,'form'),input=name=>form.elements.namedItem(name);
    function refresh(){
      const date=input('event_date').value;
      const points=C.previewMilestones(date,{lead_days:input('lead_days').value,production_days:input('production_days').value,shipping_days:input('shipping_days').value});
      $(node,'[data-timeline]').innerHTML=points
        ?points.map(m=>'<div><small>'+escape(m.label)+'</small><b>'+escape(C.format(m.date))+'</b>'+(m.date<C.today()?'<small>Prazo já passou</small>':'')+'</div>').join('')
        :'<p class="commercial-error commercial-wide">Informe uma data válida e prazos inteiros: antecedência de 0 a 365, produção de 0 a 180 e envio de 0 a 90 dias.</p>';
      const count=Object.keys(C.CHECKS).filter(k=>input(k).checked).length;
      $(node,'[data-readiness]').textContent=count+'/4';$(node,'[data-progress]').style.width=count*25+'%';
    }
    form.oninput=refresh;refresh();
    form.onsubmit=async event=>{
      event.preventDefault();if(d.unavailable)return;
      const button=$(form,'[type=submit]'),message=$(form,'[data-message]');
      const payload={event_key:e.key,title:isNew?input('title').value:e.title,event_date:input('event_date').value,channel:isNew?input('channel').value:e.channel,
        owner_id:input('owner_id').value||null,status:input('status').value,lead_days:Number(input('lead_days').value),production_days:Number(input('production_days').value),shipping_days:Number(input('shipping_days').value),
        checklist:Object.fromEntries(Object.keys(C.CHECKS).map(k=>[k,input(k).checked])),notes:input('notes').value,revision:plan.revision||0};
      if(payload.lead_days<payload.production_days+payload.shipping_days){message.className='commercial-error';message.textContent='A antecedência precisa cobrir produção e envio.';return}
      if(['ready','live'].includes(payload.status)&&Object.values(payload.checklist).some(v=>!v)){message.className='commercial-error';message.textContent='Conclua as quatro etapas antes de marcar como pronta ou em execução.';return}
      button.disabled=true;
      try{await rpc('save_commercial_campaign',{p_plan:payload});cache=null;close();onChange()}
      catch(error){message.className='commercial-error';message.textContent=error.message||'Não foi possível salvar. Seu preenchimento foi mantido.';button.disabled=false}
    };
    node.showModal();
  }
  window.HarmonyCommercialCalendar={render,renderHome,reset};
})();
