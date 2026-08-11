(function exposeHarmonyThermalPdf(root){
  'use strict';

  const MM_TO_PT=72/25.4;
  const encoder=new TextEncoder();
  const encode=value=>encoder.encode(value);
  const joinBytes=parts=>{
    const total=parts.reduce((sum,part)=>sum+part.length,0),result=new Uint8Array(total);
    let offset=0;
    for(const part of parts){result.set(part,offset);offset+=part.length}
    return result;
  };
  const pdfObject=(number,body)=>joinBytes([encode(`${number} 0 obj\n`),body,encode('\nendobj\n')]);
  const pdfStream=(dictionary,data)=>joinBytes([
    encode(`<< ${dictionary} /Length ${data.length} >>\nstream\n`),
    data,
    encode('\nendstream'),
  ]);
  const pointValue=millimeters=>(millimeters*MM_TO_PT).toFixed(4);

  function createSinglePageImagePdf(imageBytes,options={}){
    const bytes=imageBytes instanceof Uint8Array?imageBytes:new Uint8Array(imageBytes);
    const pixelWidth=Number(options.pixelWidth),pixelHeight=Number(options.pixelHeight);
    const pageWidth=pointValue(options.widthMm||100),pageHeight=pointValue(options.heightMm||150);
    if(!bytes.length||!Number.isInteger(pixelWidth)||pixelWidth<1||!Number.isInteger(pixelHeight)||pixelHeight<1){
      throw new TypeError('A imagem da etiqueta possui dimensões inválidas.');
    }

    const content=encode(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/LabelImage Do\nQ`);
    const objects=[
      pdfObject(1,encode('<< /Type /Catalog /Pages 2 0 R >>')),
      pdfObject(2,encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')),
      pdfObject(3,encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /LabelImage 4 0 R >> >> /Contents 5 0 R >>`)),
      pdfObject(4,pdfStream(`/Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Interpolate false`,bytes)),
      pdfObject(5,pdfStream('',content)),
    ];
    const header=encode('%PDF-1.4\n%HarmonyStore\n'),offsets=[0];
    let cursor=header.length;
    for(const object of objects){offsets.push(cursor);cursor+=object.length}
    const xrefOffset=cursor;
    const xref=encode(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
    return joinBytes([header,...objects,xref]);
  }

  async function createPdfBlobFromCanvas(canvas,options={}){
    const quality=Number.isFinite(options.quality)?options.quality:.98;
    const jpeg=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Não foi possível preparar a etiqueta para o PDF.')),'image/jpeg',quality));
    const pdf=createSinglePageImagePdf(new Uint8Array(await jpeg.arrayBuffer()),{
      pixelWidth:canvas.width,
      pixelHeight:canvas.height,
      widthMm:options.widthMm||100,
      heightMm:options.heightMm||150,
    });
    return new Blob([pdf],{type:'application/pdf'});
  }

  root.HarmonyThermalPdf=Object.freeze({createSinglePageImagePdf,createPdfBlobFromCanvas});
})(typeof window==='undefined'?globalThis:window);
