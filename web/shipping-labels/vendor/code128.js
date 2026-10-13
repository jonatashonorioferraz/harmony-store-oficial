// Code 128 symbol widths, standardized bar/space patterns (ISO/IEC 15417).
(function(root){
'use strict';
const patterns=['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
root.ZplCode128=function(data){
 let subset='B',at=0;
 if(data.startsWith('>:'))at=2;
 else if(data.startsWith('>;')){subset='C';at=2;}
 else if(data.startsWith('>9'))throw Error('Code 128 subset A ainda não suportado.');
 const values=[subset==='C'?105:104];
 while(at<data.length){
  if(data[at]==='>'){
   const invocation=data.slice(at,at+2);at+=2;
   if(invocation==='>5'){values.push(99);subset='C';}
   else if(invocation==='>6'&&subset==='C'){values.push(100);subset='B';}
   else if(invocation==='>8')values.push(102);
   else if(invocation==='>0'&&subset==='B')values.push(30);
   else throw Error('Invocação Code 128 não suportada: '+invocation);
  }else if(subset==='C'){
   const pair=data.slice(at,at+2);if(!/^\d{2}$/.test(pair))throw Error('Code 128 C exige pares de dígitos.');values.push(Number(pair));at+=2;
  }else{
   const n=data.charCodeAt(at++);if(n<32||n>126)throw Error('Caractere Code 128 inválido.');values.push(n-32);
  }
 }
 if(values.length===1)throw Error('Código de barras vazio.');
 values.push(values.reduce((sum,v,i)=>sum+v*(i||1),0)%103,106);
 return values.flatMap(v=>Array.from(patterns[v],Number));
};
})(globalThis);
