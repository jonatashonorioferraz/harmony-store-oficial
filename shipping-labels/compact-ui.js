(function(){
 'use strict';
 if(!window.HarmonyConverterAccess?.allowed())return;
 const $=id=>document.getElementById(id);let serial=0,url='',results=[],index=0;
 function clear(){serial++;if(url)URL.revokeObjectURL(url);url='';results=[];index=0;if(!$('download'))return;$('download').removeAttribute('href');$('result').hidden=true;$('preview').width=0;$('generate').disabled=false;$('files').disabled=false;}
 function valid(token){if(token!==serial||!window.HarmonyConverterAccess.allowed())throw Error('Teste encerrado.');}
 function preview(){const p=results[index].page,c=$('preview');c.width=p.width;c.height=p.height;const ctx=c.getContext('2d'),image=ctx.createImageData(p.width,p.height);for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){const v=p.raw[y*p.stride+(x>>3)]&(128>>(x%8))?0:255,i=(y*p.width+x)*4;image.data[i]=image.data[i+1]=image.data[i+2]=v;image.data[i+3]=255;}ctx.putImageData(image,0,0);$('counter').textContent=`${index+1} de ${results.length} · Pedido ${results[index].id}`;$('prev').disabled=index===0;$('next').disabled=index===results.length-1;}
 $('files').onchange=()=>{clear();$('status').textContent='Arquivo selecionado. Pronto para gerar o teste.';};
 $('reset').onclick=()=>{clear();$('files').value='';$('status').textContent='Selecione o arquivo para começar.';};
 $('prev').onclick=()=>{if(index>0){index--;preview();}};$('next').onclick=()=>{if(index<results.length-1){index++;preview();}};
 $('open').onclick=()=>{if(url&&window.HarmonyConverterAccess.allowed())window.open(url,'_blank','noopener');};
 $('form').onsubmit=async event=>{event.preventDefault();clear();const token=serial,file=$('files').files[0];if(!file)return;
  $('generate').disabled=true;$('files').disabled=true;$('status').textContent='Lendo etiquetas e checklists localmente…';
  try{
   if(file.size>20*1024*1024)throw Error('Limite de 20 MB por arquivo neste beta.');
   const data=new Uint8Array(await file.arrayBuffer());valid(token);
   const entries=/\.zip$/i.test(file.name)?await LocalZpl.unzip(data):[{name:file.name,text:new TextDecoder().decode(data)}];valid(token);
   const texts=entries.filter(e=>/\.(zpl|txt)$/i.test(e.name));if(!texts.length)throw Error('Nenhum ZPL ou TXT encontrado no ZIP.');
   const batch=[];for(const entry of texts){batch.push(...await LocalZpl.parseZpl(entry.text));valid(token);if(batch.length>40)throw Error('Selecione até 20 pedidos neste beta.');}
   results=ShopeeCompact.convert(batch);valid(token);
   const blob=await ShopeeCompact.createPdf(results);valid(token);
   url=URL.createObjectURL(blob);$('download').href=url;$('summary').textContent=`${results.length} pedidos · ${results.length} páginas · ${results.reduce((n,r)=>n+r.items,0)} linhas de produtos. Nenhum registro no histórico.`;$('result').hidden=false;preview();$('status').textContent='Teste pronto. Confira a prévia e teste os códigos na impressão.';
  }catch(error){if(token===serial){clear();$('status').textContent=error.message+' O conversor normal continua disponível na outra aba.';}}
  finally{if(token===serial){$('generate').disabled=false;$('files').disabled=false;}}
 };
 function dispose(){clear();if($('files'))$('files').value='';}
 window.HarmonyConverterLifecycle=Object.freeze({dispose});window.addEventListener('pagehide',dispose);
})();

