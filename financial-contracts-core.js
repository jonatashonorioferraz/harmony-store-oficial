(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function cents(value){
    const text=String(value??'');
    if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw Error('Valor invalido. Use ate duas casas decimais.');
    const [whole,fraction='']=text.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  }
  const decimal=value=>{const n=BigInt(value);return `${n/100n}.${String(n%100n).padStart(2,'0')}`};
  function inputMoney(value){
    const text=String(value).trim();
    if(!/^\d{1,12}(?:[,.]\d{1,2})?$/.test(text))throw Error('Informe um valor sem separador de milhar, com ate duas casas decimais.');
    const n=cents(text.replace(',','.'));if(n<=0n||n>99999999999999n)throw Error('Valor fora do limite permitido.');return decimal(n);
  }
  function money(value){const n=cents(value);return 'R$ '+(n/100n).toLocaleString('pt-BR')+','+String(n%100n).padStart(2,'0')}
  function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===value&&value>='1900-01-01'&&value<='2200-12-31'}
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
  const date=value=>validDate(String(value).slice(0,10))?String(value).slice(0,10).split('-').reverse().join('/'):'A definir';
  function monthly(anchor,count,amount){
    if(!validDate(anchor)||!Number.isInteger(count)||count<1||count>600)throw Error('Informe uma data valida e de 1 a 600 parcelas.');
    const [year,month,day]=anchor.split('-').map(Number),value=inputMoney(amount);
    return Array.from({length:count},(_,i)=>{const end=new Date(Date.UTC(year,month+i,0,12));const d=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),Math.min(day,end.getUTCDate()),12)).toISOString().slice(0,10);if(!validDate(d))throw Error('Cronograma fora do periodo permitido.');return {due_date:d,amount:value,kind:'installment'}});
  }
  function totals(items){return decimal(items.reduce((sum,item)=>sum+cents(inputMoney(item.amount)),0n))}
  function status(t){return cents(t.remaining_amount)===0n?'settled':cents(t.overdue_amount)>0n?'overdue':'active'}
  function allocations(items,amount){
    let left=cents(inputMoney(amount));const result=[];
    for(const item of items){const remaining=cents(item.remaining),allocated=left<remaining?left:remaining;if(allocated>0n){result.push({installment_id:item.id,amount:decimal(allocated)});left-=allocated}if(left===0n)break}
    if(left>0n)throw Error('O valor supera o saldo das parcelas selecionadas.');return result;
  }
  function reportLines(detail,entity,documents=[]){
    const c=detail.contract,t=detail.totals;
    return ['HARMONY STORE | EMPRESTIMOS E CONTRATOS',entity,'Relatorio gerado em '+date(today()),'',c.title,'Credor: '+c.creditor_name,'Referencia: '+(c.reference||'Nao informada'),'Data do contrato: '+date(c.contract_date),'Total previsto: '+money(t.scheduled_amount),'Pagamentos registrados: '+money(t.paid_amount),'Saldo previsto: '+money(t.remaining_amount),'Saldo nao representa cotacao de quitacao do credor.','Lancamentos manuais nao comprovam liquidacao bancaria.','','PARCELAS (cronograma original)',...detail.installments.map(i=>`${i.position}. ${date(i.due_date)} | ${money(i.amount)} | Pago ${money(i.paid)} | Saldo ${money(i.remaining)}`),'','PAGAMENTOS E ESTORNOS',...detail.payments.map(p=>`${date(p.effective_date)} | ${money(p.amount)} | ${p.reversal?'ESTORNADO: '+p.reversal.reason:'Registrado'} | ${p.transaction_reference||'Sem referencia'}`),'','DOCUMENTOS PRIVADOS (originais separados)',...documents.map(d=>`${d.original_name} | SHA-256: ${d.sha256}`),'','HISTORICO',...detail.audit.map(a=>`${a.created_at} | ${a.action} | Autor: ${a.actor_id}`),'','Os arquivos originais nao sao incorporados a este PDF.','Guarde os originais e este relatorio em local seguro.'];
  }
  // Small, deterministic text PDF. No external service, file uploads or remote fonts.
  function pdfBytes(lines){
    const wrap=[];for(const original of lines){let s=String(original).replace(/[\r\n]+/g,' ');while(s.length>96){wrap.push(s.slice(0,96));s=s.slice(96)}wrap.push(s)}
    const pages=[];for(let i=0;i<wrap.length;i+=48)pages.push(wrap.slice(i,i+48));if(!pages.length)pages.push([]);
    const clean=s=>String(s).replace(/[^\x20-\x7e\xa0-\xff]/g,'?').replace(/([\\()])/g,'\\$1');
    const objects=['','<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
    const kids=[];pages.forEach((page,i)=>{const n=objects.length;kids.push(`${n} 0 R`);const stream=`BT /F1 10 Tf 42 794 Td 14 TL\n${page.map(line=>`(${clean(line)}) Tj T*`).join('\n')}\nET\nBT /F1 9 Tf 42 30 Td (Harmony Store - ${i+1}/${pages.length}) Tj ET`;
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${n+1} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)});
    objects[2]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
    let text='%PDF-1.4\n';const offsets=[0];for(let i=1;i<objects.length;i++){offsets.push(text.length);text+=`${i} 0 obj\n${objects[i]}\nendobj\n`}
    const xref=text.length;text+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Uint8Array.from(text,c=>c.charCodeAt(0));
  }
  root.HarmonyFinancialCore=Object.freeze({esc,cents,decimal,inputMoney,money,validDate,today,date,monthly,totals,status,allocations,reportLines,pdfBytes});
})(typeof window==='undefined'?globalThis:window);
