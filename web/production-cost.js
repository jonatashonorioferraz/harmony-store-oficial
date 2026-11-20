(function () {
  'use strict';
  const brl = value => value.toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
  const num = value => value.toLocaleString('pt-BR',{maximumFractionDigits:3});
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const units = {g:['g',1],kg:['g',1000],ml:['ml',1],L:['ml',1000],un:['un',1]};
  function initial() {
    return {labor:2.5, packaging:0.1, supplies:[
      {id:'base',name:'Base glicerinada',unit:'kg',size:1,price:null},
      {id:'essencia',name:'Essência',unit:'g',size:100,price:null},
      {id:'corante',name:'Corante',unit:'g',size:100,price:null}
    ], recipes:[{id:'coracao',name:'Mini Sabonetes Coração 2 g',yield:400,pack:100,ingredients:[
      {supply:'base',amount:1000},{supply:'essencia',amount:20},{supply:'corante',amount:10}
    ]}]};
  }
  function calculate(catalog, recipe, quantity, pack) {
    if (![quantity,pack,recipe.yield].every(n => Number.isSafeInteger(n) && n>0)) throw Error('Informe quantidades inteiras maiores que zero.');
    const bags = Math.ceil(quantity/pack);
    const lines = recipe.ingredients.map(item => {
      const s = catalog.supplies.find(s => s.id === item.supply);
      const amount = item.amount * quantity / recipe.yield;
      return {name:s.name,unit:units[s.unit][0],amount,cost:s.price===null ? null : amount*s.price/(s.size*units[s.unit][1])};
    });
    const labor = quantity*catalog.labor/100, packaging = bags*catalog.packaging;
    const complete = lines.length && lines.every(line => line.cost !== null);
    const total = complete ? lines.reduce((sum,line)=>sum+line.cost,labor+packaging) : null;
    return {lines,bags,labor,packaging,total};
  }
  function mount(root, original, {admin=false,save,demo=false,loadModels}={}) {
    let catalog=structuredClone(original), draft, tab='products', recipeId=catalog.recipes[0].id;
    let quantity=150, pack=catalog.recipes[0].pack, saving=false, message='';
    let models;
    const option=(id,name,selected)=>`<option value="${escape(id)}" ${id===selected?'selected':''}>${escape(name)}</option>`;
    const field=(title,html)=>`<label>${title}${html}</label>`;
    const input=(key,value,type='number',step='any',min='0.001')=>`<input data-key="${key}" type="${type}" ${type==='number'?`min="${min}" max="1000000000" step="${step}"`:'maxlength="120"'} value="${escape(value??'')}" required>`;
    const node=sel=>root.querySelector(sel);
    const recipe=()=>catalog.recipes.find(r=>r.id===recipeId);
    function render() {
      root.innerHTML=`<div class="cost-page"><header><p class="cost-kicker">HARMONY STORE OFICIAL · PRODUÇÃO</p><h1>Calculadora de produção</h1><p>Calcule o custo dos sabonetes pelo rendimento real da receita.</p></header>
      ${demo?'<p class="cost-demo">Demonstração com preços ilustrativos. As alterações valem apenas nesta prévia.</p>':''}
      <nav aria-label="Calculadora"><button data-tab="products" aria-pressed="${tab==='products'}">Meus sabonetes</button><button data-tab="estimate" aria-pressed="${tab==='estimate'}">Calcular produção</button>${admin?'<button data-tab="editor" aria-pressed="'+(tab==='editor')+'">Insumos e receitas</button>':''}</nav>
      <p class="cost-message" role="status">${escape(message)}</p><div data-body></div></div>`;
      root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
        if(saving || tab===b.dataset.tab)return;
        if(tab==='editor' && JSON.stringify(draft)!==JSON.stringify(catalog) && !confirm('Descartar as alterações no cadastro?'))return;
        if(!catalog.recipes.some(r=>r.id===recipeId)){recipeId=catalog.recipes[0].id;pack=catalog.recipes[0].pack;}if(b.dataset.tab==='estimate')pack=recipe().pack;tab=b.dataset.tab;message='';draft=structuredClone(catalog);render();
      });
      node('[data-body]').onclick=null;
      if(tab==='products') products(); else if(tab==='estimate') estimate(); else editor();
    }
    function products() {
      const cards=catalog.recipes.map(model=>{
        const {total}=calculate(catalog,model,model.pack,model.pack);
        const ready=total!==null;
        return '<article class="cost-product-card">'+
          '<div class="cost-product-heading"><div><p class="cost-product-eyebrow">RECEITA</p><h3>'+escape(model.name)+'</h3></div>'+
          '<span class="cost-product-status '+(ready?'is-ready':'is-pending')+'">'+(ready?'Custo pronto':'Faltam preços')+'</span></div>'+
          '<div class="cost-product-metrics"><div><span>Rendimento real</span><strong>'+num(model.yield)+'<small> unidades</small></strong></div>'+
          '<div><span>Pacote padrão</span><strong>'+num(model.pack)+'<small> unidades</small></strong></div></div>'+
          '<div class="cost-product-value"><div><small>CUSTO DO PACOTE</small><strong>'+(ready?brl(total):'Pendente')+'</strong></div>'+
          '<p>'+(ready?'Inclui insumos, mão de obra e embalagem.':'Complete os preços de compra dos insumos.')+'</p></div>'+
          '<div class="cost-product-actions"><button data-calculate="'+escape(model.id)+'" aria-label="Calcular produção de '+escape(model.name)+'">Calcular produção</button>'+
          (admin?'<button data-edit-recipe="'+escape(model.id)+'" aria-label="Editar receita de '+escape(model.name)+'">Editar receita</button>':'')+'</div></article>';
      }).join('');
      node('[data-body]').innerHTML='<section class="cost-card cost-product-list">'+
        '<div class="cost-product-intro"><p class="cost-product-eyebrow">SEUS PRODUTOS</p><h2>Meus sabonetes</h2>'+
        '<p>Veja o rendimento e o custo estimado de cada receita.</p></div>'+
        '<div class="cost-product-grid">'+cards+'</div>'+
        (admin?'<button class="cost-new-product" data-new-product>＋ Cadastrar sabonete</button>':'')+'</section>';
      node('[data-body]').onclick=event=>{
        const button=event.target.closest('button');
        if(!button)return;
        const id=button.dataset.calculate||button.dataset.editRecipe;
        if(id){recipeId=id;pack=recipe().pack;}
        draft=structuredClone(catalog);
        tab=button.hasAttribute('data-calculate')?'estimate':'editor';
        render();
        if(tab==='editor')node('[data-recipe]').scrollIntoView({block:'start'});
      };
    }
    function estimate() {
      const saved = catalog.recipes.map(model=>{
        const {total}=calculate(catalog,model,model.pack,model.pack);
        return '<tr><th scope="row">'+escape(model.name)+'</th><td>'+num(model.pack)+' un</td><td>'+(total===null?'Preço pendente':brl(total))+'</td></tr>';
      }).join('');
      node('[data-body]').innerHTML=`<div class="cost-grid"><section class="cost-card"><h2>Planejar lote</h2>
      ${field('Produto','<select data-product>'+catalog.recipes.map(r=>option(r.id,r.name,recipeId)).join('')+'</select>')}
      <div class="cost-fields">${field('Quantidade de sabonetes',input('quantity',quantity,'number','1','1'))}${field('Unidades por saquinho',input('pack',pack,'number','1','1'))}</div>
      <p class="cost-note">Rendimento da receita: <b>${num(recipe().yield)} unidades</b>, já considerando as perdas.</p></section>
      <section class="cost-result" aria-live="polite"></section></div><section class="cost-card cost-details"></section><details class="cost-card cost-details"><summary>Custos dos modelos salvos (${catalog.recipes.length})</summary><table><thead><tr><th>Modelo</th><th>Pacote padrão</th><th>Custo do pacote</th></tr></thead><tbody>${saved}</tbody></table></details>`;
      node('[data-product]').onchange=e=>{recipeId=e.target.value;pack=recipe().pack;estimate();};
      node('[data-body]').oninput=()=>{quantity=node('[data-key=quantity]').valueAsNumber;pack=node('[data-key=pack]').valueAsNumber;result();};
      result();
    }
    function result(){
      const panel=node('.cost-result'), details=node('.cost-details');
      if(![quantity,pack].every(n=>Number.isInteger(n)&&n>0&&n<=1e9)){
        panel.textContent='Informe a quantidade e a capacidade do saquinho em unidades inteiras positivas.';details.hidden=true;return;
      }
      const {lines,bags,labor,packaging,total}=calculate(catalog,recipe(),quantity,pack);
      const money=v=>v===null?'Preço pendente':brl(v);
      panel.innerHTML=`<small>CUSTO TOTAL ESTIMADO</small><strong>${total===null?'Aguardando preços':brl(total)}</strong>
      <span>${num(quantity)} sabonetes · ${num(bags)} saquinho(s)</span>${total===null?'<p>O ADM precisa informar os preços de compra dos insumos indicados abaixo.</p>':
      '<div class="cost-pair"><div>Por sabonete<b>'+brl(total/quantity)+'</b></div><div>Média por saquinho<b>'+brl(total/bags)+'</b></div></div>'}`;
      const row=(label,amount,cost)=>`<tr><th scope="row">${escape(label)}</th><td>${escape(amount)}</td><td>${money(cost)}</td></tr>`;
      details.hidden=false;
      details.innerHTML=`<h2>Composição do custo</h2><table><thead><tr><th>Componente</th><th>Quantidade do lote</th><th>Custo</th></tr></thead><tbody>
      ${lines.map(l=>row(l.name,num(l.amount)+' '+l.unit,l.cost)).join('')}
      ${row('Mão de obra',num(quantity)+' un × '+brl(catalog.labor)+' / 100',labor)}
      ${row('Saquinho com rótulo',num(bags)+' × '+brl(catalog.packaging),packaging)}</tbody></table>
      ${quantity%pack?`<p class="cost-note">O último saquinho leva ${num(quantity%pack)} unidades e conta como uma embalagem inteira.</p>`:''}`;
    }
    function editor(){
      const r=draft.recipes.find(r=>r.id===recipeId) || draft.recipes[0];
      const supplyRows=draft.supplies.map(s=>`<div class="cost-supply" data-supply="${s.id}">
      ${field('Insumo',input('name',s.name,'text'))}${field('Qtd. comprada',input('size',s.size))}
      ${field('Unidade','<select data-key="unit">'+Object.keys(units).map(u=>option(u,u,s.unit)).join('')+'</select>')}
      ${field('Preço pago (R$)',input('price',s.price,'number','.01','0').replace(' required',' placeholder="A preencher"'))}</div>`).join('');
      const components=r.ingredients.map((item,i)=>{
        const s=draft.supplies.find(s=>s.id===item.supply);
        return `<div class="cost-ingredient" data-line="${i}">${field('Insumo da receita','<select data-key="supply">'+draft.supplies.map(x=>option(x.id,x.name,item.supply)).join('')+'</select>')}
        ${field('Quantidade ('+units[s.unit][0]+')',input('amount',item.amount))}
        <button type="button" data-remove="${i}" aria-label="Remover ingrediente ${i+1}" ${r.ingredients.length===1?'disabled':''}>Remover</button></div>`;
      }).join('');
      const body=node('[data-body]');body.oninput=null;
      body.innerHTML=`<form class="cost-form"><fieldset ${saving?'disabled':''}>
      <section class="cost-card"><h2>Insumos e preços de compra</h2>${supplyRows}<button type="button" data-add="supply">+ Adicionar insumo</button></section>
      <section class="cost-card"><h2>Receitas</h2><div class="cost-fields">${field('Receita para editar','<select data-edit>'+draft.recipes.map(x=>option(x.id,x.name||'Novo produto',r.id)).join('')+'</select>')}<button type="button" data-add="recipe">+ Produto exclusivo da calculadora</button></div>
      ${loadModels ? (models ? '<div class="cost-fields">'+field('Modelo do catálogo de sabonetes','<select data-model><option value="">Selecione o modelo</option>'+models.map(m=>option(m.id,m.name+(draft.recipes.some(r=>r.modelId===m.id)?' — Custo cadastrado':' — Cadastrar custo'),'')).join('')+'</select>')+'<button type="button" data-use-model>Usar modelo do catálogo</button></div>' : '<button type="button" data-load-models>Escolher modelo do catálogo de sabonetes</button>') : ''}
      <p class="cost-note">${r.modelId?'Receita de um modelo do catálogo.':'Produto exclusivo da calculadora.'} Salve a receita para consultar o custo de outros lotes.</p>
      <div data-recipe><div class="cost-fields">${field('Nome do produto',input('name',r.name,'text'))}${field('Rendimento real (un)',input('yield',r.yield,'number','1','1'))}${field('Unidades por saquinho',input('pack',r.pack,'number','1','1'))}</div>${components}</div>
      <button type="button" data-add="line">+ Adicionar ingrediente</button></section>
      <section class="cost-card"><h2>Custos padrão dos sabonetes</h2><div class="cost-fields">${field('Mão de obra por 100 unidades (R$)',input('labor',draft.labor,'number','.01','0'))}${field('Saquinho com rótulo (R$)',input('packaging',draft.packaging,'number','.01','0'))}</div></section>
      <button class="cost-save">${saving?'Salvando…':'Salvar cadastro'}</button></fieldset></form>`;
      const form=node('form');
      form.oninput=e=>{
        const el=e.target,key=el.dataset.key;if(!key)return;
        let obj=draft;const line=el.closest('[data-line]'),supply=el.closest('[data-supply]');
        if(line)obj=r.ingredients[Number(line.dataset.line)];else if(supply)obj=draft.supplies.find(s=>s.id===supply.dataset.supply);else if(el.closest('[data-recipe]'))obj=r;
        if(key==='unit' && units[el.value][0]!==units[obj.unit][0] && draft.recipes.some(x=>x.ingredients.some(i=>i.supply===obj.id))){
          el.value=obj.unit;node('.cost-message').textContent='Para outra medida, cadastre um novo insumo. As receitas atuais usam a medida original.';return;
        }
        obj[key]=el.type==='number'?(el.value===''?null:el.valueAsNumber):el.value;
        if(key==='supply'||key==='unit')editor();
      };
      node('[data-edit]').onchange=e=>{recipeId=e.target.value;editor();};
      function addRecipe(name,modelId){
        recipeId=crypto.randomUUID();
        draft.recipes.push({id:recipeId,name,modelId,yield:null,pack:100,ingredients:[{supply:draft.supplies[0].id,amount:null}]});
      }
      const load=node('[data-load-models]');
      if(load)load.onclick=async()=>{
        load.disabled=true;
        try{
          models=(await loadModels()).filter(m=>m.active);
          if(form.isConnected){editor();node('[data-model]').focus();}
        }catch{if(form.isConnected){load.disabled=false;node('.cost-message').textContent='Não foi possível carregar os modelos. Tente novamente.';}}
      };
      const use=node('[data-use-model]');
      if(use)use.onclick=()=>{
        const model=models.find(m=>m.id===node('[data-model]').value);
        if(!model){node('[data-model]').focus();return;}
        const existing=draft.recipes.find(item=>item.modelId===model.id);
        if(existing)recipeId=existing.id;
        else addRecipe(model.name,model.id);
        editor();node('[data-key=yield]').focus();
      };
      form.onclick=e=>{
        const b=e.target.closest('button');if(!b)return;const add=b.dataset.add;
        if(add==='supply') draft.supplies.push({id:crypto.randomUUID(),name:'Novo insumo',size:1,unit:'g',price:null});
        else if(add==='recipe')addRecipe('',null);
        else if(add==='line')r.ingredients.push({supply:draft.supplies[0].id,amount:1});
        else if(b.hasAttribute('data-remove'))r.ingredients.splice(Number(b.dataset.remove),1);
        else return;
        editor();
      };
      form.onsubmit=async e=>{
        e.preventDefault();if(saving)return;
        const positive=n=>Number.isFinite(n)&&n>0&&n<=1e9,integer=n=>positive(n)&&Number.isInteger(n);
        if(!draft.supplies.every(s=>s.name.trim()&&positive(s.size)&&(s.price===null||Number.isFinite(s.price)&&s.price>=0))||
           !draft.recipes.every(x=>x.name.trim()&&integer(x.yield)&&integer(x.pack)&&x.ingredients.every(i=>positive(i.amount)))){
          node('.cost-message').textContent='Confira os nomes, quantidades e rendimentos de todos os cadastros.';return;
        }
        saving=true;editor();
        try{await save(draft);catalog=structuredClone(draft);pack=recipe().pack;tab='products';message='Cadastro salvo. Seu produto está em Meus sabonetes.';}
        catch(error){message=error.message;}
        finally{saving=false;render();}
      };
    }
    render();
  }
  async function renderAppPage(page){
    page.innerHTML='<p class="page" role="status">Carregando receitas…</p>';
    const slot=document.createElement('div');page.replaceChildren(slot);slot.textContent='Carregando receitas…';
    try{
      const [row]=await rest('production_cost_catalog?id=eq.1&select=catalog,revision');
      if(!slot.isConnected)return;
      if(!row)throw Error('Catálogo indisponível para este acesso.');
      let revision=row.revision;
      mount(slot,row.catalog??initial(),{admin:S.profile.role==='admin',loadModels:()=>rpc('list_finished_product_models',{}),save:async draft=>{
        const changed=await rest('production_cost_catalog?id=eq.1&revision=eq.'+revision,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({catalog:draft,revision:revision+1})});
        if(!changed.length)throw Error('O cadastro foi atualizado em outro acesso. Reabra a calculadora antes de editar novamente.');
        revision=changed[0].revision;
      }});
    }catch(error){slot.textContent='Não foi possível abrir a calculadora. '+error.message;}
  }
  window.HarmonyProductionCost={render:renderAppPage,mount,initial,calculate};
})();
