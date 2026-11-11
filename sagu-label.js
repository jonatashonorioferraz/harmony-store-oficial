(function(root){
  'use strict';
  const CODE='HS-SAGU-001';
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function settings(options={}){
    const dpi=Number(options.dpi??203),copies=Number(options.copies??1),date=options.date||'';
    if(![203,300].includes(dpi))throw Error('Selecione 203 ou 300 DPI.');
    if(!Number.isInteger(copies)||copies<1||copies>100000)throw Error('Informe de 1 a 100.000 cópias.');
    if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date))throw Error('Informe uma data de fabricação válida.');
    return {dpi,copies,date};
  }
  function svg(options={}){
    const {dpi,date}=settings(options),barModule=(dpi===203?2:3)*25.4/dpi;
    const bars=root.ZplCode128(CODE);let x=7,barcode='';
    bars.forEach((n,i)=>{const width=n*barModule;if(i%2===0)barcode+=`<rect x="${x}" y="7" width="${width}" height="16"/>`;x+=width;});
    const line=(x,y,text,size=2.25,bold=false)=>`<text x="${x}" y="${y}" font-size="${size}"${bold?' font-weight="700"':''}>${esc(text)}</text>`;
    const lines=(x,y,values,size=2.25,gap=3)=>values.map((t,i)=>line(x,y+i*gap,t,size)).join('');
    const rule=(x,y,w)=>`<path d="M${x} ${y}h${w}" fill="none" stroke="#000" stroke-width=".22"/>`;
    const box=(x,y,w,h,r=2)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="#000" stroke-width=".22"/>`;
    // Vector pictograms with thermal-safe strokes; no remote images or fonts.
    const symbols={
      bowl:'<path d="M4 13h16c-1 5-4 7-8 7s-7-2-8-7z"/><circle cx="7" cy="11" r="2"/><circle cx="12" cy="11" r="2"/><circle cx="17" cy="11" r="2"/><circle cx="9.5" cy="7.8" r="2"/><circle cx="14.5" cy="7.8" r="2"/><circle cx="12" cy="4.7" r="1.8"/>',
      flask:'<path d="M8 3h7m-6 0v7L4 19q-1 2 2 2h11q3 0 1-3l-5-8V3M7 15h8"/><path d="M13 20q-1-8 8-8-1 8-8 8zM13 20l5-5" fill="#fff"/>',
      caution:'<path d="M10.5 4q1.5-2 3 0L22 19q1 2-2 2H4q-3 0-2-2z"/><path d="M12 8v6" stroke-width="2"/><circle cx="12" cy="17.6" r="1" fill="#000" stroke="none"/>',
      child:'<circle cx="9" cy="6" r="2"/><path d="M9 9v6m-5-3 5-3 4 3m-4 3-3 5m3-5 3 5"/><path d="M16 15q1-3 4-1l1 3h-6z" fill="#000"/><circle cx="15.5" cy="11.8" r="1"/><circle cx="18" cy="10.8" r="1"/><circle cx="20.5" cy="12" r="1"/>',
      sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
      glass:'<path d="M6 4h12l-2 12H8zM12 16v4m-4 0h8M4 3l16 18"/>',
      leaf:'<path d="M12 20V8"/><path d="M12 12Q5 9 12 2q7 7 0 10zM11 19Q2 18 3 10q8 1 8 9zM13 19q9-1 8-9-8 1-8 9z" fill="#000" stroke="none"/>',
      heart:'<path d="M12 21C8 17 2 13 2 8c0-6 8-7 10-1 2-6 10-5 10 1 0 5-6 9-10 13z"/>',
      sparkle:'<path d="M10 3q1 7 7 8-6 1-7 8-1-7-7-8 6-1 7-8zM19 1q.5 3 3 3.5-2.5.5-3 3.5-.5-3-3-3.5 2.5-.5 3-3.5zM20 17q.5 3 3 3.5-2.5.5-3 3.5-.5-3-3-3.5 2.5-.5 3-3.5z" fill="#000" stroke="none"/>'
    };
    const icon=(name,x,y,size=8,ring=true)=>`<g data-icon="${name}" transform="translate(${x-size/2} ${y-size/2}) scale(${size/24})" fill="none" stroke="#000" stroke-width="1" stroke-linejoin="round" stroke-linecap="round">${ring?'<circle cx="12" cy="12" r="11.5"/><g transform="translate(3 3) scale(.75)">':''}${symbols[name]}${ring?'</g>':''}</g>`;
    const divider=y=>`${rule(54,y,19)}${rule(78,y,19)}<path d="M75.5 ${y-0.85}l.85.85-.85.85-.85-.85z"/>`;
    const leaf=icon('leaf',124,9.5,10);
    const manufactured=date?date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4):'____/____/______';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="150mm" height="100mm" viewBox="0 0 150 100"><rect width="150" height="100" fill="#fff"/><g fill="#000" font-family="Arial, sans-serif">${box(1.8,1.8,146.4,96.4,3)}${box(2.8,2.8,144.4,94.4,2.2)}
    <path d="M50.5 6v78M100.5 6v78" fill="none" stroke="#000" stroke-width=".18" stroke-dasharray=".4 .7"/>
    ${barcode}${line(11,27,CODE,3,true)}${box(5,31,43,11,1.5)}<path d="M21 31v11" stroke="#000" stroke-width=".2"/>
    ${line(7,35,'VALIDADE:',2.1,true)}${line(7,39,'24 MESES',2.4,true)}${line(23,35,'FABRICAÇÃO:',2.1,true)}${line(23,39,manufactured,2.2)}
    ${icon('child',9,50)}${lines(15,48,['MANTER FORA DO ALCANCE','DE CRIANÇAS E ANIMAIS.'],2)}
    ${icon('sun',9,62)}${lines(15,59,['CONSERVAR EM LOCAL SECO,','FRESCO E AO ABRIGO DA LUZ.'],1.95)}
    ${icon('glass',9,74)}${lines(15,72,['PRODUTO NÃO COMESTÍVEL.','NÃO INGERIR.'],2)}
    ${lines(6,82,['USO EXCLUSIVO PARA DECORAÇÃO','E AROMATIZAÇÃO DE AMBIENTES.'],2)}
    ${icon('bowl',58,9,8.5)}${line(64,10,'MODO DE USO:',2.65,true)}${lines(54,16,['Coloque a quantidade desejada de','sagu perfumado em um recipiente','decorativo aberto (sachê, potinho,','vaso, bandeja ou outro de sua','preferência). O aroma será liberado','gradualmente, perfumando','o ambiente.'],2.25,3.25)}
    ${divider(39)}${icon('flask',58,45,8.5)}${line(64,46,'COMPOSIÇÃO:',2.65,true)}${lines(54,52,['Bolinhas de fécula, essência,','corantes, álcool, conservante','e veículo.'],2.3,3.25)}
    ${divider(61)}${icon('caution',58,67,8.5)}${line(64,68,'PRECAUÇÕES:',2.65,true)}${lines(54,74,['Produto não comestível. Não ingerir.','Evitar contato com olhos e mucosas.','Em caso de contato, lavar com água','em abundância. Suspender o uso em','caso de irritação. Não utilizar','sobre a pele.'],2.1,2.55)}
    ${box(103,4,42,50,3)}${leaf}${line(106,20,'PRODUTO NÃO TÓXICO',2.65,true)}${line(106,25,'NÃO INDICADO PARA USO CORPORAL',1.85,true)}${line(106,29,'USO DECORATIVO E AROMATIZANTE',1.85,true)}${rule(106,33,36)}
    ${line(106,38,'SUGESTÕES DE USO:',2.5,true)}${lines(106,42,['• Sachês perfumados','• Lembrancinhas','• Potpourris','• Decorações'],2.25,3)}
    ${box(103,58,42,28,3)}${line(106,64,'PRODUZIDO POR:',2.6,true)}${lines(106,68,['Harmony Store Oficial','CNPJ: 44.967.294/0001-09','Inscrição Estadual: 0350055270','Rua Gramado, 399 - Centro','Dois Irmãos/RS - CEP 93950-000'],2.15,3.15)}
    ${rule(2.8,89,144.4)}<circle cx="9" cy="93.4" r="3.1"/><g fill="#fff" stroke="#fff" transform="translate(6.8 91.2) scale(.183)">${symbols.heart}</g>${line(15,92.8,'PERFUME E DELICADEZA',2,true)}${line(15,95.5,'PARA SEU AMBIENTE E LEMBRANCINHAS',1.85)}<path d="M77 91v5M113 91v5" stroke="#000" stroke-width=".2"/>${icon('heart',83,93.4,5,false)}${line(88,92.8,'COM ESSÊNCIAS',1.95)}${line(88,95.5,'PREMIUM',1.95,true)}${icon('sparkle',119,93.4,5.5,false)}${line(125,92.8,'AROMA SUAVE',1.95)}${line(125,95.5,'E DURADOURO',1.95)}
    </g></svg>`;
  }
  async function canvas(options={}){
    const {dpi}=settings(options),url=URL.createObjectURL(new Blob([svg(options)],{type:'image/svg+xml;charset=utf-8'})),image=new Image();
    try{
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Não foi possível preparar o rótulo.'));image.src=url;});
      const c=document.createElement('canvas');c.width=Math.round(100*dpi/25.4);c.height=Math.round(150*dpi/25.4);
      const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
      ctx.translate(c.width,0);ctx.rotate(Math.PI/2);ctx.drawImage(image,0,0,c.height,c.width);ctx.setTransform(1,0,0,1,0,0);
      // Same monochrome pixels in the PDF and ZPL, with no JPEG artifacts.
      const pixels=ctx.getImageData(0,0,c.width,c.height);
      for(let i=0;i<pixels.data.length;i+=4){const v=pixels.data[i]*.299+pixels.data[i+1]*.587+pixels.data[i+2]*.114<160?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;}
      ctx.putImageData(pixels,0,0);return c;
    }finally{URL.revokeObjectURL(url);}
  }
  function raster(c){
    const stride=Math.ceil(c.width/8),raw=new Uint8Array(stride*c.height),pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(pixels[(y*c.width+x)*4]<128)raw[y*stride+(x>>3)]|=128>>(x%8);
    return {raw,stride};
  }
  function zpl(c,copies=1){
    settings({copies});const {raw,stride}=raster(c),hex=Array.from(raw,v=>v.toString(16).padStart(2,'0').toUpperCase()).join('');
    return `^XA\n^PW${c.width}\n^LL${c.height}\n^LH0,0\n^FO0,0^GFA,${raw.length},${raw.length},${stride},${hex}^FS\n^PQ${copies}\n^XZ`;
  }
  function pdf(c){
    const {raw,stride}=raster(c),encode=s=>new TextEncoder().encode(s),join=parts=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length;}return out;};
    // Pad bits are white in the inverted grayscale stream; /Width ignores them.
    const bytes=Uint8Array.from(raw,v=>255-v),width=(100*72/25.4).toFixed(6),height=(150*72/25.4).toFixed(6);
    if(stride!==Math.ceil(c.width/8))throw Error('Dimensões inválidas.');
    const stream=(dict,data)=>join([encode(`<< ${dict} /Length ${data.length} >>\nstream\n`),data,encode('\nendstream')]);
    const content=encode(`q ${width} 0 0 ${height} 0 0 cm /Im Do Q`);
    const bodies=[encode('<< /Type /Catalog /Pages 2 0 R >>'),encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im 4 0 R >> >> /Contents 5 0 R >>`),stream(`/Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceGray /BitsPerComponent 1 /Interpolate false`,bytes),stream('',content)];
    const parts=[encode('%PDF-1.4\n')],offsets=[0];let length=parts[0].length;
    bodies.forEach((b,i)=>{offsets.push(length);const obj=join([encode(`${i+1} 0 obj\n`),b,encode('\nendobj\n')]);parts.push(obj);length+=obj.length;});
    parts.push(encode(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
    return new Blob(parts,{type:'application/pdf'});
  }
  const authorized=()=>['admin','receiver'].includes((typeof S==='undefined'?null:S.profile?.role))&&typeof S!=='undefined'&&S.profile?.status==='active'&&!S.profile?.must_change_password;
  function mount(host){
    if(!host)return;
    host.innerHTML=`<details class="card sagu-card"><summary>Rótulo de sagu perfumado · 10 × 15 cm</summary><p>Modelo de embalagem com validade de 24 meses. Conteúdo na horizontal, em uma etiqueta de 10 × 15 cm.</p><form class="label-lots-form"><label>Data de fabricação (opcional)<input name="date" type="date"></label><label>Resolução da impressora<select name="dpi"><option value="203">203 DPI</option><option value="300">300 DPI</option></select></label><label>Cópias no ZPL<input name="copies" type="number" value="1" min="1" max="100000" step="1" required></label><p class="label-lots-note">Código interno Code 128: <b>${CODE}</b>. Identifica este produto; não é um EAN/GTIN. A data vazia deixa espaço para preenchimento manual. Este rótulo não cria um lote nem movimenta estoque.</p><div class="sagu-preview"></div><div class="label-lots-output-actions"><button type="submit" name="format" value="pdf" class="primary">Baixar PDF 10 × 15</button><button type="submit" name="format" value="zpl" class="outline">Baixar ZPL</button></div><p class="label-lots-note">PDF: uma página; escolha as cópias na impressora. Imprima em escala 100%, sem ajustar à página. ZPL: a quantidade é enviada em ^PQ.</p><p class="sagu-status" role="status"></p></form></details>`;
    const form=host.querySelector('form'),status=host.querySelector('.sagu-status'),options=()=>({date:form.elements.date.value,dpi:Number(form.elements.dpi.value),copies:Number(form.elements.copies.value)});
    const preview=()=>{try{host.querySelector('.sagu-preview').innerHTML=svg(options());status.textContent='';}catch(e){status.textContent=e.message;}};
    form.onchange=preview;preview();
    form.onsubmit=async event=>{
      event.preventDefault();if(!authorized())return;const format=event.submitter?.value;if(!['pdf','zpl'].includes(format))return;
      const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
      try{const opts=settings(options()),c=await canvas(opts);if(!authorized()||!host.isConnected)return;
        const blob=format==='pdf'?pdf(c):new Blob([zpl(c,opts.copies)],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
        a.href=url;a.download=`rotulo-sagu-10x15-${opts.dpi}dpi.${format}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='Arquivo pronto. Confira a data e imprima em tamanho real.';
      }catch(e){status.textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}
    };
  }
  root.HarmonySaguLabel=Object.freeze({CODE,settings,svg,canvas,zpl,pdf,mount});
})(typeof window==='undefined'?globalThis:window);
