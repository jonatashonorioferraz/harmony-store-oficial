(function(root){
  'use strict';

  const COMPOSITION='Base glicerinada branca, corante, essência e veículo.';
  const USAGE='Para lembrancinhas e decoração. Não indicado para uso corporal.';
  const CREATE_KEY='harmony.label-lot.create';
  const OUTPUT_KEY='harmony.label-lot.output';
  const state={codes:[],lots:[],events:[],selected:null};
  const allowed=()=>['admin','receiver'].includes(S.profile?.role);
  const workers=()=>(S.team||[]).filter(person=>(person.role==='collaborator'||!person.role)&&person.status!=='inactive');
  const codeFor=id=>state.codes.find(item=>item.collaborator_id===id)?.code||'';
  const padLot=value=>String(value??'---').padStart(3,'0');
  const dateBR=value=>value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'--/--/----';
  const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
  const expiry=value=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return'';
    const [year,month,day]=value.split('-').map(Number);
    const last=new Date(Date.UTC(year+1,month,0)).getUTCDate();
    return String(year+1).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(Math.min(day,last)).padStart(2,'0');
  };
  const dateTime=value=>value?new Date(value).toLocaleString('pt-BR'):'—';

  function operationKey(storageKey,payload){
    const signature=JSON.stringify(payload);
    try{
      const previous=JSON.parse(sessionStorage.getItem(storageKey)||'null');
      if(previous?.signature===signature&&previous.key)return previous.key;
      const key=crypto.randomUUID();
      sessionStorage.setItem(storageKey,JSON.stringify({signature,key}));
      return key;
    }catch{return crypto.randomUUID()}
  }
  function clearOperationKey(storageKey){try{sessionStorage.removeItem(storageKey)}catch{}}

  function labelSvg(lot){
    if((lot.composition_text&&lot.composition_text!==COMPOSITION)
      ||(lot.usage_text&&lot.usage_text!==USAGE)
      ||(lot.template_version&&lot.template_version!=='60x40-v1')){
      throw Error('Este lote usa outra versão de etiqueta e precisa do modelo correspondente.');
    }
    const number=padLot(lot.lot_number),code=lot.collaborator_code||'--';
    const numberSize=number.length>4?42:number.length>3?52:63;
    const codeSize=code.length>3?26:35;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="40mm" viewBox="0 0 600 400" role="img" aria-label="Etiqueta do lote ${esc(number)}">
      <rect width="600" height="400" fill="#fff"/>
      <g fill="#111" font-family="'Arial Narrow','Liberation Sans Narrow',Arial,sans-serif">
        <text x="17" y="31" font-size="23" font-weight="800" letter-spacing="1">HARMONY STORE</text>
        <text x="583" y="30" font-size="16" font-weight="700" text-anchor="end">LEMBRANCINHAS</text>
        <path d="M17 43H583" stroke="#111" stroke-width="2"/>
        <text x="17" y="83" font-size="43" font-weight="900">${esc(lot.label_title||'MINI SABONETES')}</text>
        <text x="18" y="108" font-size="21" font-weight="700" letter-spacing="1">ARTESANAIS · DECORAÇÃO</text>
        <path d="M17 119H583" stroke="#111" stroke-width="2"/>
        <text x="17" y="142" font-size="20" font-weight="800">LOTE</text>
        <text x="17" y="204" font-size="${numberSize}" font-weight="900">${esc(number)}</text>
        <rect x="166" y="156" width="84" height="52" rx="5" fill="#111"/>
        <text x="208" y="194" font-size="${codeSize}" font-weight="900" fill="#fff" text-anchor="middle">${esc(code)}</text>
        <path d="M276 127V213" stroke="#111" stroke-width="2"/>
        <text x="291" y="141" font-size="19" font-weight="800">FABRICAÇÃO</text>
        <text x="291" y="168" font-size="29" font-weight="800">${dateBR(lot.manufactured_on)}</text>
        <text x="291" y="187" font-size="19" font-weight="800">VALIDADE</text>
        <text x="291" y="213" font-size="29" font-weight="800">${dateBR(lot.expires_on)}</text>
        <path d="M17 222H583" stroke="#111" stroke-width="2"/>
        <path d="M302 230V388" stroke="#111" stroke-width="2"/>
        <text x="17" y="248" font-size="22" font-weight="900">COMPOSIÇÃO</text>
        <text x="17" y="281" font-size="27" font-weight="600">Base glicerinada</text>
        <text x="17" y="315" font-size="27" font-weight="600">branca, corante,</text>
        <text x="17" y="349" font-size="27" font-weight="600">essência e veículo.</text>
        <text x="316" y="248" font-size="22" font-weight="900">USO DECORATIVO</text>
        <text x="316" y="281" font-size="27" font-weight="600">Para lembrancinhas</text>
        <text x="316" y="315" font-size="27" font-weight="600">e decoração.</text>
        <text x="316" y="349" font-size="27" font-weight="700">Não indicado para</text>
        <text x="316" y="383" font-size="27" font-weight="700">uso corporal.</text>
      </g>
    </svg>`;
  }

  async function labelCanvas(lot,dpi){
    const svg=new Blob([labelSvg(lot)],{type:'image/svg+xml;charset=utf-8'});
    const url=URL.createObjectURL(svg),image=new Image();
    try{
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Não foi possível preparar a etiqueta.'));image.src=url});
      const canvas=document.createElement('canvas');
      canvas.width=Math.round(60*dpi/25.4);
      canvas.height=Math.round(40*dpi/25.4);
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      return canvas;
    }finally{URL.revokeObjectURL(url)}
  }

  function zplFromCanvas(canvas,copies){
    const {width,height}=canvas,bytesPerRow=Math.ceil(width/8);
    const pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,width,height).data;
    const data=[];
    for(let y=0;y<height;y++){
      for(let x=0;x<bytesPerRow;x++){
        let byte=0;
        for(let bit=0;bit<8;bit++){
          const px=x*8+bit;
          if(px>=width)continue;
          const offset=(y*width+px)*4;
          if((pixels[offset]*299+pixels[offset+1]*587+pixels[offset+2]*114)/1000<160)byte|=1<<(7-bit);
        }
        data.push(byte.toString(16).padStart(2,'0').toUpperCase());
      }
    }
    const total=bytesPerRow*height;
    return `^XA
^PW${width}
^LL${height}
^LH0,0
^FO0,0^GFA,${total},${total},${bytesPerRow},${data.join('')}^FS
^PQ${copies}
^XZ`;
  }

  function download(blob,name){
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }

  async function load(){
    const [codes,lots]=await Promise.all([
      rest('collaborator_label_codes?select=collaborator_id,code&order=code.asc'),
      rest('label_lots?select=*&order=lot_number.desc&limit=60')
    ]);
    state.codes=codes||[];state.lots=lots||[];
  }

  function codeForm(){
    if(S.profile?.role!=='admin')return'';
    const available=workers();
    return `<details class="label-lots-code-panel"><summary>Cadastrar ou corrigir código de colaboradora</summary>
      <p>A administração pode corrigir o código antes do primeiro lote. Após qualquer emissão, inclusive cancelada, o código fica protegido para preservar a rastreabilidade.</p>
      <form id="labelCodeForm" class="label-lots-code-form">
        <label>Colaboradora<select name="collaborator" required><option value="">Selecione</option>${available.map(person=>`<option value="${esc(person.id)}">${esc(person.full_name)}${codeFor(person.id)?' · '+esc(codeFor(person.id)):''}</option>`).join('')}</select></label>
        <label>Código<input name="code" placeholder="Ex.: D1 ou P1" pattern="[A-Z][1-9][0-9]*" maxlength="12" title="Uma letra maiúscula seguida de um número positivo, como D1 ou P1." required></label>
        <p id="labelCodeHelp" class="label-lots-note" aria-live="polite">Selecione a colaboradora para cadastrar ou corrigir seu código.</p>
        <button class="outline" ${available.length?'':'disabled'}>Salvar código</button>
      </form>
    </details>`;
  }

  function historyRows(query=''){
    const needle=query.trim().toLocaleLowerCase('pt-BR');
    const rows=state.lots.filter(lot=>!needle||String(lot.lot_number).includes(needle)
      ||lot.collaborator_name.toLocaleLowerCase('pt-BR').includes(needle)
      ||lot.collaborator_code.toLocaleLowerCase('pt-BR').includes(needle));
    return rows.map(lot=>`<button class="label-lots-history-row" data-lot-id="${esc(lot.id)}">
      <strong>${padLot(lot.lot_number)} <small>${esc(lot.collaborator_code)}</small></strong>
      <span>${esc(lot.collaborator_name)}</span>
      <span>Fab. ${dateBR(lot.manufactured_on)}</span>
      <span class="label-lots-status ${lot.status==='cancelled'?'is-cancelled':''}">${lot.status==='cancelled'?'Cancelado':'Ativo'}</span>
    </button>`).join('')||'<p class="label-lots-empty">Nenhum lote encontrado entre os 60 mais recentes.</p>';
  }

  function drawPage(page){
    const mapped=workers().filter(person=>codeFor(person.id));
    page.innerHTML=`<div class="page label-lots-page">
      ${head('RASTREABILIDADE','Lotes e etiquetas','Etiqueta térmica 60 × 40 mm para mini sabonetes artesanais. O lote é registrado antes de gerar PDF ou ZPL.')}
      <div class="label-lots-layout">
        <section class="card label-lots-create">
          <div class="label-lots-heading"><div><small>NOVO LOTE</small><h2>Prepare a emissão</h2></div><span>Número atribuído na confirmação</span></div>
          <form id="labelLotForm" class="label-lots-form">
            <label>Colaboradora<select name="collaborator" required><option value="">Selecione</option>${mapped.map(person=>`<option value="${esc(person.id)}">${esc(person.full_name)} · ${esc(codeFor(person.id))}</option>`).join('')}</select></label>
            <label>Data real de fabricação<input name="manufactured" type="date" max="${today()}" value="${today()}" required></label>
            <label>Etiquetas a gerar<input name="count" type="number" min="1" max="100000" step="1" value="100" required></label>
            <div class="label-lots-facts"><span>Validade: <b id="labelExpiry">—</b></span><span>Código: <b id="labelCode">—</b></span></div>
            <p class="label-lots-note">A quantidade informa etiquetas solicitadas, não unidades de sabonete nem impressão física confirmada.</p>
            <button class="primary" ${mapped.length?'':'disabled'}>Confirmar e criar lote</button>
          </form>
          ${mapped.length?'':'<p class="info">Nenhuma colaboradora possui código interno cadastrado. A administração deve cadastrar o código antes da primeira emissão.</p>'}
          ${codeForm()}
        </section>
        <section class="card label-lots-preview-card">
          <div class="label-lots-heading"><div><small>PRÉVIA</small><h2>Como sairá na etiqueta</h2></div><span>60 × 40 mm</span></div>
          <div id="labelLotPreview" class="label-lots-preview"></div>
          <p>Esta prévia não reserva número de lote. Confira colaboradora e fabricação antes de confirmar.</p>
        </section>
      </div>
      <section class="card label-lots-history">
        <div class="label-lots-heading"><div><small>HISTÓRICO</small><h2>Lotes recentes</h2></div><label>Buscar lote ou colaboradora<input id="labelLotSearch" type="search" placeholder="Número, nome ou D1"></label></div>
        <div id="labelLotRows">${historyRows()}</div>
        <p class="label-lots-note">Exibindo no máximo os 60 lotes mais recentes. A busca nesta tela considera esses registros carregados.</p>
      </section>
      <section id="labelLotDetail"></section>
    </div>`;
    const form=page.querySelector('#labelLotForm');
    const preview=()=>{
      const id=form.elements.collaborator.value,manufactured=form.elements.manufactured.value;
      const record={lot_number:'---',collaborator_code:codeFor(id)||'--',manufactured_on:manufactured,expires_on:expiry(manufactured)};
      page.querySelector('#labelExpiry').textContent=dateBR(record.expires_on);
      page.querySelector('#labelCode').textContent=record.collaborator_code;
      page.querySelector('#labelLotPreview').innerHTML=labelSvg(record);
    };
    form.elements.collaborator.onchange=preview;
    form.elements.manufactured.onchange=preview;
    preview();
    form.onsubmit=async event=>{
      event.preventDefault();
      const button=event.submitter,id=form.elements.collaborator.value;
      const manufactured=form.elements.manufactured.value,count=Number(form.elements.count.value);
      if(!codeFor(id)||!manufactured||!Number.isInteger(count)||count<1||count>100000)return;
      if(!confirm(`Criar lote para ${workers().find(person=>person.id===id)?.full_name||'colaboradora'} (${codeFor(id)}), fabricação ${dateBR(manufactured)}, com ${count} etiquetas solicitadas?`))return;
      button.disabled=true;
      try{
        const payload={id,manufactured,count},key=operationKey(CREATE_KEY,payload);
        const result=await rpc('create_label_lot',{p_collaborator_id:id,p_manufactured_on:manufactured,p_label_count:count,p_request_key:key});
        const lot=Array.isArray(result)?result[0]:result;
        clearOperationKey(CREATE_KEY);
        state.lots=[lot,...state.lots.filter(item=>item.id!==lot.id)].slice(0,60);
        drawPage(page);
        await openLot(lot.id);
        toast('Lote '+padLot(lot.lot_number)+' criado. Agora escolha PDF ou ZPL.');
      }catch(error){alert(error.message);button.disabled=false}
    };
    const codeFormElement=page.querySelector('#labelCodeForm');
    if(codeFormElement){
      const syncCode=()=>{
        const previous=codeFor(codeFormElement.elements.collaborator.value);
        codeFormElement.elements.code.value=previous;
        page.querySelector('#labelCodeHelp').textContent=previous
          ?'Código atual: '+previous+'. A correção só será aceita se ainda não houver nenhum lote desta colaboradora.'
          :'Informe uma letra seguida de um número positivo, como D1 ou P1.';
      };
      codeFormElement.elements.collaborator.onchange=syncCode;
      codeFormElement.elements.code.oninput=()=>{
        codeFormElement.elements.code.value=codeFormElement.elements.code.value.toUpperCase();
      };
      codeFormElement.onsubmit=async event=>{
        event.preventDefault();
        const id=codeFormElement.elements.collaborator.value;
        const nextCode=codeFormElement.elements.code.value.trim().toUpperCase(),previous=codeFor(id);
        if(!id||!/^[A-Z][1-9][0-9]*$/.test(nextCode)||nextCode.length>12)return;
        if(previous===nextCode){toast('Este já é o código da colaboradora.');return}
        const name=workers().find(person=>person.id===id)?.full_name||'colaboradora';
        if(previous&&!confirm('Corrigir o código de '+name+' de '+previous+' para '+nextCode+'? Nenhum lote será criado.'))return;
        const button=event.submitter;button.disabled=true;
        const draft={collaborator:form.elements.collaborator.value,manufactured:form.elements.manufactured.value,count:form.elements.count.value};
        try{
          const saved=await rpc('assign_collaborator_label_code',{p_collaborator_id:id,p_code:nextCode,p_expected_code:previous||null});
          state.codes=[...state.codes.filter(item=>item.collaborator_id!==id),{collaborator_id:id,code:saved}];
          if(S.view==='label-lots'){
            drawPage(page);
            const restored=page.querySelector('#labelLotForm');
            for(const [key,value] of Object.entries(draft))restored.elements[key].value=value;
            restored.elements.collaborator.onchange();
          }
          toast(previous?'Código corrigido de '+previous+' para '+saved+'.':'Código da colaboradora cadastrado.');
        }catch(error){alert(error.message);button.disabled=false}
      };
    }
    const rows=page.querySelector('#labelLotRows');
    const bindRows=()=>rows.querySelectorAll('[data-lot-id]').forEach(button=>button.onclick=()=>openLot(button.dataset.lotId));
    bindRows();
    page.querySelector('#labelLotSearch').oninput=event=>{rows.innerHTML=historyRows(event.target.value);bindRows()};
  }

  async function openLot(id){
    const lot=state.lots.find(item=>item.id===id),detail=document.querySelector('#labelLotDetail');
    if(!lot||!detail)return;
    state.selected=lot;
    detail.innerHTML='<div class="card">Carregando histórico do lote…</div>';
    try{
      state.events=await rest('label_lot_events?select=*&lot_id=eq.'+encodeURIComponent(id)+'&order=created_at.asc');
      if(S.view!=='label-lots'||state.selected?.id!==id)return;
      const emitted=state.events.some(item=>['generated','reprinted'].includes(item.event_type));
      const outputCount=state.events.filter(item=>['generated','reprinted'].includes(item.event_type)).reduce((total,item)=>total+Number(item.label_count||0),0);
      detail.innerHTML=`<section class="card label-lots-detail">
        <div class="label-lots-heading"><div><small>LOTE ${padLot(lot.lot_number)} · ${esc(lot.collaborator_code)}</small><h2>${esc(lot.collaborator_name)}</h2></div><button class="outline" id="closeLabelLot">Fechar detalhes</button></div>
        <div class="label-lots-detail-grid">
          <div class="label-lots-preview">${labelSvg(lot)}</div>
          <div class="label-lots-output">
            <p><b>Fabricação:</b> ${dateBR(lot.manufactured_on)}<br><b>Validade:</b> ${dateBR(lot.expires_on)}<br><b>Etiquetas solicitadas:</b> ${lot.requested_label_count}<br><b>Saídas registradas:</b> ${outputCount} etiquetas, sem confirmação física.</p>
            ${lot.status==='active'?`<div class="label-lots-output-fields">
              <label>Quantidade ${emitted?'para reimpressão':'original'}<input id="labelOutputCount" type="number" min="1" max="100000" step="1" value="${emitted?50:lot.requested_label_count}" ${emitted?'':'readonly'}></label>
              <label>Impressora ZPL<select id="labelOutputDpi"><option value="203">203 DPI</option><option value="300">300 DPI</option></select></label>
              ${emitted?'<label class="wide">Motivo da reimpressão<input id="labelOutputReason" maxlength="500" placeholder="Ex.: etiqueta danificada" required></label>':''}
            </div>
            <div class="label-lots-output-actions"><button class="primary" data-label-output="pdf">Gerar PDF</button><button class="outline" data-label-output="zpl">Gerar ZPL</button></div>
            <p class="label-lots-note">PDF: uma página 60 × 40 mm; ajuste ${emitted?'a quantidade informada':'as '+lot.requested_label_count+' cópias'} no diálogo da impressora. ZPL: a quantidade vai no comando ^PQ. Nenhuma opção confirma a impressão física.</p>`:'<p class="error">Lote cancelado. Não é permitido gerar novas etiquetas.</p>'}
          </div>
        </div>
        <div class="label-lots-events"><h3>Histórico</h3>${state.events.map(item=>`<div><time>${dateTime(item.created_at)}</time><b>${esc(item.actor_name)}</b><span>${item.event_type==='created'?'Criou o lote':item.event_type==='generated'?'Gerou etiquetas':item.event_type==='reprinted'?'Reimprimiu etiquetas':'Cancelou o lote'}${item.label_count?' · '+item.label_count+' · '+item.output_format.toUpperCase():''}${item.reason?' · '+esc(item.reason):''}</span></div>`).join('')}</div>
        ${S.profile.role==='admin'&&lot.status==='active'?'<button class="danger" id="cancelLabelLot">Cancelar lote com motivo</button>':''}
      </section>`;
      detail.querySelector('#closeLabelLot').onclick=()=>{state.selected=null;detail.innerHTML=''};
      detail.querySelectorAll('[data-label-output]').forEach(button=>button.onclick=()=>generateOutput(lot,button.dataset.labelOutput,button,emitted));
      const cancel=detail.querySelector('#cancelLabelLot');
      if(cancel)cancel.onclick=async()=>{
        const reason=prompt('Informe o motivo do cancelamento do lote:');
        if(!reason?.trim()||reason.trim().length<3)return;
        if(!confirm('Cancelar este lote? O número e o histórico serão preservados.'))return;
        cancel.disabled=true;
        try{
          const result=await rpc('cancel_label_lot',{p_lot_id:lot.id,p_reason:reason.trim(),p_event_key:crypto.randomUUID()});
          const updated=Array.isArray(result)?result[0]:result;
          state.lots=state.lots.map(item=>item.id===lot.id?updated:item);
          drawPage(document.querySelector('#page'));
          await openLot(lot.id);
        }catch(error){alert(error.message);cancel.disabled=false}
      };
      detail.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){detail.innerHTML=`<div class="error">${esc(error.message)}</div>`}
  }

  async function generateOutput(lot,format,button,reprint){
    const detail=document.querySelector('#labelLotDetail');
    const count=Number(detail.querySelector('#labelOutputCount')?.value);
    const dpi=Number(detail.querySelector('#labelOutputDpi')?.value)||203;
    const reason=detail.querySelector('#labelOutputReason')?.value.trim()||null;
    if(!Number.isInteger(count)||count<1||count>100000)return alert('Informe uma quantidade válida de etiquetas.');
    if(reprint&&(!reason||reason.length<3))return alert('Informe o motivo da reimpressão.');
    button.disabled=true;
    try{
      const canvas=await labelCanvas(lot,format==='zpl'?dpi:203);
      let blob,filename='lote-'+padLot(lot.lot_number)+'-'+lot.collaborator_code;
      if(format==='pdf'){
        if(!root.HarmonyThermalPdf?.createPdfBlobFromCanvas)throw Error('Gerador de PDF indisponível.');
        blob=await root.HarmonyThermalPdf.createPdfBlobFromCanvas(canvas,{widthMm:60,heightMm:40});
        filename+='.pdf';
      }else{
        blob=new Blob([zplFromCanvas(canvas,count)],{type:'text/plain;charset=utf-8'});
        filename+='-'+count+'-etiquetas.zpl';
      }
      const payload={lot:lot.id,format,count,reason},key=operationKey(OUTPUT_KEY,payload);
      await rpc('record_label_output',{p_lot_id:lot.id,p_output_format:format,p_label_count:count,p_event_key:key,p_reason:reason});
      download(blob,filename);
      clearOperationKey(OUTPUT_KEY);
      await openLot(lot.id);
      toast(format==='pdf'?'PDF pronto. Configure '+count+' cópias na impressora.':'ZPL pronto para '+count+' etiquetas.');
    }catch(error){alert(error.message);button.disabled=false}
  }

  async function render(page){
    if(!page||S.view!=='label-lots')return;
    if(!allowed()){page.innerHTML='<div class="page"><p class="error">Acesso não autorizado.</p></div>';return}
    page.innerHTML='<div class="page"><div class="card">Carregando lotes e etiquetas…</div></div>';
    try{await load();if(S.view==='label-lots')drawPage(page)}
    catch(error){page.innerHTML=`<div class="page"><div class="card"><h2>Módulo ainda não disponível</h2><p>O banco precisa receber a migração de lotes antes do uso.</p><p class="error">${esc(error.message)}</p></div></div>`}
  }

  root.HarmonyLabelLots=Object.freeze({render});
})(window);
