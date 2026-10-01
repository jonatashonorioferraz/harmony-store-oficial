/* Shared date-only and campaign planning rules. No network or private data. */
(function(root){
  'use strict';
  const DAY=86400000, CHANNELS=['Geral','Shopee','Mercado Livre','SHEIN','Loja própria'];
  const MARKETPLACES=['Shopee','Mercado Livre','SHEIN'], CHANNEL_IDS={'Shopee':'shopee','Mercado Livre':'mercado-livre','SHEIN':'shein','Loja própria':'loja'};
  const CHECKS={offer:'Oferta e margem revisadas',stock:'Estoque e capacidade conferidos',creative:'Fotos e peças aprovadas',logistics:'Prazo de envio validado'};
  function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s}
  function date(s){if(!validDate(s))throw new Error('Data inválida.');return new Date(s+'T12:00:00Z')}
  function add(s,n){const d=date(s);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
  function between(a,b){return Math.round((date(b)-date(a))/DAY)}
  function today(now=new Date()){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);return ['year','month','day'].map(k=>p.find(v=>v.type===k).value).join('-')}
  function format(s){return date(s).toLocaleDateString('pt-BR',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'})}
  function nth(year,month,weekday,n){const first=new Date(Date.UTC(year,month-1,1,12));return add(first.toISOString().slice(0,10),(weekday-first.getUTCDay()+7)%7+7*(n-1))}
  function easter(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;return y+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0')}
  function baseline(year){
    const events=[];
    function put(slug,title,start,theme,rule,channel='Geral',status='recurring'){
      events.push({key:slug+':'+start,title,start_date:start,end_date:start,theme,channel,status,rule,source_url:null,source_checked_at:null});
    }
    const fixed=[
      ['ano-novo','Ano Novo','01-01','presente','Data anual: 1º de janeiro.'],
      ['mulher','Dia da Mulher','03-08','corporativo','Data anual: 8 de março.'],
      ['consumidor','Dia do Consumidor','03-15','oferta','Data anual: 15 de março.'],
      ['namorados','Dia dos Namorados','06-12','presente','Calendário brasileiro: 12 de junho.'],
      ['sao-joao','São João / Festa Junina','06-24','festa','Referência de planejamento: 24 de junho; festas variam.'],
      ['avos','Dia dos Avós','07-26','presente','Data anual: 26 de julho.'],
      ['cliente','Dia do Cliente','09-15','corporativo','Data anual: 15 de setembro.'],
      ['criancas','Dia das Crianças','10-12','festa','Data anual brasileira: 12 de outubro.'],
      ['professores','Dia dos Professores','10-15','corporativo','Data anual brasileira: 15 de outubro.'],
      ['halloween','Halloween','10-31','festa','Data anual: 31 de outubro.'],
      ['natal','Natal','12-25','presente','Data anual: 25 de dezembro.']
    ];
    fixed.forEach(x=>put(x[0],x[1],year+'-'+x[2],x[3],x[4]));
    const pascoa=easter(year),bf=add(nth(year,11,4,4),1);
    put('carnaval','Carnaval',add(pascoa,-47),'festa','Terça-feira de Carnaval, calculada a partir da Páscoa. Não define feriado local.');
    put('pascoa','Páscoa',pascoa,'presente','Data móvel calculada pelo calendário gregoriano.');
    put('maes','Dia das Mães',nth(year,5,0,2),'presente','Segundo domingo de maio.');
    put('pais','Dia dos Pais',nth(year,8,0,2),'presente','Segundo domingo de agosto.');
    put('black-friday','Black Friday',bf,'oferta','Sexta-feira após a quarta quinta-feira de novembro. Condições comerciais não confirmadas.');
    put('cyber-monday','Cyber Monday',add(bf,3),'oferta','Segunda-feira após a Black Friday. Condições comerciais não confirmadas.');
    for(let m=1;m<=12;m++){
      const day=year+'-'+String(m).padStart(2,'0')+'-'+String(m).padStart(2,'0');
      put('shopee-'+m,'Shopee '+m+'.'+m,day,'oferta','Previsão por recorrência. A plataforma precisa confirmar a edição, os prazos e as condições.','Shopee','predicted');
    }
    return events.sort((a,b)=>a.start_date.localeCompare(b.start_date)||a.title.localeCompare(b.title,'pt-BR'));
  }
  function merge(base,announcements,plans){
    const map=new Map(base.map(e=>[e.key,{...e}]));
    for(const e of announcements||[])if(e.status==='confirmed'){
      const key=e.baseline_key||'event:'+e.id;
      map.set(key,{...(map.get(key)||{}),...e,key,status:'confirmed',theme:map.get(key)?.theme||'oferta'});
    }
    for(const p of plans||[]){
      if(!map.has(p.event_key))map.set(p.event_key,{key:p.event_key,title:p.title,start_date:p.event_date,end_date:p.event_date,channel:p.channel,status:'internal',theme:'oferta',rule:'Planejamento interno registrado pela administração.'});
      map.get(p.event_key).plan=p;
    }
    return [...map.values()].sort((a,b)=>a.start_date.localeCompare(b.start_date)||a.title.localeCompare(b.title,'pt-BR'));
  }
  function channelEvents(items,channel){
    if(!channel)return items;
    const selected=items.filter(e=>e.channel===channel);
    if(![...MARKETPLACES,'Loja própria'].includes(channel))return selected;
    const keys=new Set(selected.map(e=>e.key));
    const seasonal=items.filter(e=>e.channel==='Geral'&&e.status==='recurring').map(e=>({
      ...e,key:'opportunity-'+CHANNEL_IDS[channel]+':'+e.key,channel,status:'opportunity',plan:undefined,
      source_url:null,source_checked_at:null,
      rule:'Data sazonal para planejamento em '+channel+'. Não é anúncio de campanha da plataforma; confirme condições e elegibilidade no portal do vendedor.'
    })).filter(e=>!keys.has(e.key));
    return [...selected,...seasonal].sort((a,b)=>a.start_date.localeCompare(b.start_date)||a.title.localeCompare(b.title,'pt-BR'));
  }
  function coverage(channel,d,now=new Date()){
    if(d.unavailable)return {level:'urgent',label:'Consulta indisponível'};
    if(!d.settings?.enabled)return {level:'muted',label:'Pesquisa desligada'};
    const run=d.last_run,item=run?.channel_results?.find(r=>r.channel===channel);
    if(run?.status==='running'&&now-new Date(run.started_at)<10*60000)return {level:'warm',label:'Pesquisando este canal'};
    if(!item)return {level:'warm',label:'Ainda não pesquisado'};
    if(item.status!=='completed')return {level:'urgent',label:'Pesquisa indisponível neste canal'};
    if(!run.finished_at||now-new Date(run.finished_at)>36*3600000)return {level:'warm',label:'Pesquisa precisa de atualização'};
    return {level:'good',label:item.result_count>0?'Propostas encontradas para revisão':'Sem novo anúncio verificável'};
  }
  function milestones(event){
    const p=event.plan||{},eventDate=event.start_date;
    return [
      {key:'brief',label:'Iniciar planejamento',date:add(eventDate,-(p.lead_days??60))},
      {key:'production',label:'Iniciar produção',date:add(eventDate,-((p.production_days??15)+(p.shipping_days??7)))},
      {key:'shipping',label:'Limite de envio estimado',date:add(eventDate,-(p.shipping_days??7))},
      {key:'event',label:'Data da oportunidade',date:eventDate}
    ];
  }
  function previewMilestones(start,values={}){
    if(!validDate(start))return null;
    const limits={lead_days:365,production_days:180,shipping_days:90},plan={};
    for(const [key,max] of Object.entries(limits)){
      const raw=values?.[key];
      if(!['number','string'].includes(typeof raw)||String(raw).trim()==='')return null;
      const value=Number(raw);
      if(!Number.isInteger(value)||value<0||value>max)return null;
      plan[key]=value;
    }
    // Partial or extreme date input must not interrupt the rest of the form.
    try{
      const points=milestones({start_date:start,plan});
      return points.every(point=>validDate(point.date))?points:null;
    }catch{return null}
  }
  function readiness(event){
    const checks=event.plan?.checklist||{};
    const done=Object.keys(CHECKS).filter(k=>checks[k]===true).length;
    return {done,total:4,percent:done*25};
  }
  function signal(event,now=today()){
    const left=between(now,event.start_date),state=event.plan?.status;
    if(['completed','cancelled'].includes(state))return {level:'muted',label:state==='completed'?'Concluída':'Cancelada',days:left};
    if(left<0)return {level:'muted',label:event.plan?'Data encerrada; revise o plano':'Data encerrada',days:left};
    if(readiness(event).done===4)return {level:'good',label:'Checklist completo',days:left};
    if(left<=7)return {level:'urgent',label:'Reta final: até 7 dias',days:left};
    if(left<=15)return {level:'urgent',label:'Revisar execução: até 15 dias',days:left};
    if(left<=30)return {level:'warm',label:'Preparar agora: até 30 dias',days:left};
    if(left<=60)return {level:'warm',label:'Planejar: até 60 dias',days:left};
    return {level:'muted',label:'No horizonte',days:left};
  }
  function ideas(event){
    const themes={
      presente:['Kits de lembrancinhas decorativas','Combinar embalagem, mensagem e opções de presente; validar margem antes de definir desconto.'],
      corporativo:['Lembranças para equipes e clientes','Preparar proposta por faixa de quantidade e prazo de aprovação da personalização.'],
      festa:['Coleção temática para decoração','Planejar cores, embalagem e fotos temáticas. Manter indicação de uso decorativo; não anunciar uso corporal.'],
      oferta:['Seleção de kits com margem saudável','Revisar taxas, frete, cupons e capacidade antes de aderir à campanha. Não assumir benefício da plataforma sem confirmação.']
    };
    return themes[event.theme]||themes.oferta;
  }
  function research(settings={},run=null,lastSuccess=null,now=new Date()){
    if(!settings.enabled)return {level:'muted',label:'Pesquisa com IA desligada',detail:'Nenhuma busca paga é executada. As datas-base continuam disponíveis.'};
    if(!settings.pricing_approved)return {level:'warm',label:'Aguardando configuração aprovada',detail:'Modelo, preços e controle de consumo precisam de aprovação antes da ativação.'};
    if(settings.budget_blocked)return {level:'warm',label:'Pesquisa bloqueada pelo orçamento',detail:'Reserva mensal esgotada. Não houve nova consulta paga.'};
    if(run?.status==='partial')return {level:'warm',label:'Pesquisa concluída parcialmente',detail:'Um ou mais canais ficaram indisponíveis. Consulte a situação de cada marketplace; resultados válidos foram preservados.'};
    if(run?.status==='failed')return {level:'urgent',label:'Última pesquisa falhou',detail:'As fontes existentes foram preservadas; novas campanhas podem estar ausentes.'};
    if(run?.status==='running'&&now-new Date(run.started_at)<10*60000)return {level:'warm',label:'Pesquisa em andamento',detail:'As propostas aparecerão após a conclusão e precisarão de revisão.'};
    if(!lastSuccess||now-new Date(lastSuccess)>36*3600000)return {level:'warm',label:'Pesquisa desatualizada',detail:'Sem pesquisa concluída nas últimas 36 horas. Não significa ausência de novidades.'};
    return {level:'good',label:'Pesquisa recente',detail:'Última conclusão: '+new Date(lastSuccess).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+'. Fontes podem mudar.'};
  }
  function safeSource(url){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
  root.HarmonyCommercialCore={CHANNELS,MARKETPLACES,channelEvents,coverage,CHECKS,validDate,add,between,today,format,nth,easter,baseline,merge,milestones,previewMilestones,readiness,signal,ideas,research,safeSource};
})(typeof window!=='undefined'?window:globalThis);
