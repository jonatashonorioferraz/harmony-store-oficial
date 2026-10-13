/* Local renderer for the ZPL commands used by Mercado Envios.
 * Font 0 uses bundled Roboto Condensed Bold (an approximation of Zebra's
 * proprietary font). No network, telemetry or user file persistence.
 * Command semantics: docs.zebra.com, ZPL Programming Guide.
 */
(function (root) {
  'use strict';
  const fail = message => { throw Error(message); };
  let fontReady;
  async function prepareFont() {
    if (root.ZplCanvasFactory) return; // Native canvas in local automated tests.
    if (!fontReady) fontReady = (async () => {
      if (!root.HarmonyZplFont) fail('A fonte local não foi encontrada. Extraia todos os arquivos do conversor.');
      const bytes = Uint8Array.from(atob(root.HarmonyZplFont), c => c.charCodeAt(0));
      const font = new FontFace('HarmonyZpl', bytes, { weight: '100 900' });
      await font.load();
      document.fonts.add(font);
    })();
    return fontReady;
  }
  function canvas(width, height) {
    if (root.ZplCanvasFactory) return root.ZplCanvasFactory(width, height);
    const c = document.createElement('canvas'); c.width = width; c.height = height; return c;
  }
  function number(value, fallback = 0, min = 0, max = 32000) {
    const n = value === '' || value === undefined ? fallback : Number(value);
    if (!Number.isInteger(n) || n < min || n > max) fail('Parâmetro numérico ZPL inválido.');
    return n;
  }
  function normal(value) {
    if (value && value !== 'N') fail('Este ZPL contém rotação ainda não suportada.');
  }
  function decodeText(value, indicator, encoding) {
    value = value.replace(/\r?\n/g, '');
    if (!indicator) return value;
    const bytes = [];
    for (let i = 0; i < value.length;) {
      if (value[i] === indicator && /^[\da-f]{2}$/i.test(value.slice(i + 1, i + 3))) {
        bytes.push(parseInt(value.slice(i + 1, i + 3), 16)); i += 3;
      } else {
        const char = String.fromCodePoint(value.codePointAt(i));
        bytes.push(...new TextEncoder().encode(char)); i += char.length;
      }
    }
    return new TextDecoder(encoding === 28 ? 'utf-8' : 'windows-1252', { fatal: true }).decode(new Uint8Array(bytes));
  }
  function textLines(ctx, text, field) {
    const block = field.block;
    if (!block) return [text.replace(/\\&/g, ' ')];
    if (!block.width) return [];
    const scale = field.font.width / field.font.height;
    const width = line => ctx.measureText(line).width * scale;
    const lines = [];
    for (const paragraph of text.split('\\&')) {
      let line = '';
      for (let word of paragraph.trim().split(/\s+/).filter(Boolean)) {
        if (line && width(line + ' ' + word) > block.width) { lines.push(line); line = ''; }
        // Break long words instead of clipping address/reference data.
        while (width(word) > block.width) {
          let take = 1;
          while (take < word.length && width(word.slice(0, take + 1) + '-') <= block.width) take++;
          lines.push(word.slice(0, take) + '-'); word = word.slice(take);
        }
        line += (line ? ' ' : '') + word;
      }
      lines.push(line);
    }
    if (lines.length > block.lines) fail('O texto excede o limite de linhas de um campo ZPL. A conversão foi interrompida para evitar sobreposição.');
    return lines;
  }
  async function render(block, graphics, decodeGraphic) {
    await prepareFont();
    const fields = [];
    const state = { homeX: 0, homeY: 0, encoding: 28, module: 2, barcodeHeight: 10, width: 0, height: 0, copies: 1 };
    let field = {}, defaultFont = { height: 30, width: 30 };
    // FD and FX are consumed as complete fields: their content is data, never commands.
    const commands = /\^(FD|FX)([\s\S]*?)\^FS|\^([A-Z0-9]{2})([^\^~]*)/g;
    let end = 0;
    for (const match of block.matchAll(commands)) {
      if (block.slice(end, match.index).trim()) fail('Trecho ZPL não reconhecido.');
      end = match.index + match[0].length;
      const cmd = match[1] || match[3], data = match[1] ? match[2] : match[4].trim(), p = data.split(',');
      if (cmd === 'FX') { field = {}; continue; }
      switch (cmd) {
        case 'MC': case 'MM': case 'MN': break; // Printer media/buffer settings, no drawing.
        case 'CI': state.encoding = number(p[0], 28); if (![0,27,28].includes(state.encoding)) fail('Codificação de texto ZPL não suportada.'); break;
        case 'LH': state.homeX = number(p[0]); state.homeY = number(p[1]); break;
        case 'PW': state.width = number(p[0], 800, 1, 4096); break;
        case 'LL': state.height = number(p[0], 1200, 1, 8192); break;
        case 'PO': normal(data); break;
        case 'LT': case 'LS': if (number(p[0],0,-32000) !== 0) fail('Deslocamento global ZPL não suportado.'); break;
        case 'PQ': state.copies = number(p[0], 1, 1, 1000); if(p.slice(1).some((v,i)=>v && v !== '0' && !(i===2 && v==='N'))) fail('Parâmetros de cópias ZPL não suportados.'); break;
        case 'CF': if(p[0]!=='0') fail('Somente a fonte ZPL 0 é suportada para textos.'); defaultFont = {height:number(p[1],30,1,400),width:number(p[2],number(p[1],30),1,400)}; break;
        case 'FO': field.x = number(p[0]) + state.homeX; field.y = number(p[1]) + state.homeY; if(p[2] && p[2]!=='0') fail('Justificação de origem ZPL não suportada.'); break;
        case 'A0': normal(p[0]); field.font = {height:number(p[1],defaultFont.height,1,400),width:number(p[2],number(p[1],defaultFont.width),1,400)}; break;
        case 'FH': field.hex = data || '_'; if(field.hex.length!==1) fail('Indicador hexadecimal ZPL inválido.'); break;
        case 'FB': field.block = {width:number(p[0]),lines:number(p[1],1,1,9999),spacing:number(p[2],0,-9999,9999),align:p[3]||'L'}; if(!['L','C','R'].includes(field.block.align)||number(p[4])!==0) fail('Alinhamento de texto ZPL não suportado.'); break;
        case 'FR': field.reverse = true; break;
        case 'BY': state.module = number(p[0],2,1,10); state.barcodeHeight = number(p[2],10); break;
        case 'BC': normal(p[0]); if((p[2]||'Y')!=='N'||(p[3]||'N')!=='N'||(p[4]||'N')!=='N'||(p[5]||'N')!=='N') fail('Variação Code 128 não suportada.'); field.barcode = {type:'code128',height:number(p[1],state.barcodeHeight,1,32000),module:state.module}; break;
        case 'BQ': normal(p[0]); if((p[1]||'2')!=='2') fail('Somente QR Code modelo 2 é suportado.'); field.barcode = {type:'qr',module:number(p[2],2,1,100)}; break;
        case 'GB': field.drawing = {type:'box',width:number(p[0]),height:number(p[1]),thickness:number(p[2],1,1),color:p[3]||'B'}; if(!['B','W'].includes(field.drawing.color)||number(p[4])!==0) fail('Caixa arredondada ZPL não suportada.'); break;
        case 'GF': { const g = data.match(/^A,(\d+),(\d+),(\d+),([\s\S]*)$/); if(!g) fail('Formato de gráfico ZPL não suportado.'); field.drawing = {type:'image',image:await decodeGraphic(g[2],g[3],g[4])}; break; }
        case 'XG': { const image = graphics.get(p[0].toUpperCase()); if(!image || (p[1]||'1')!=='1' || (p[2]||'1')!=='1') fail('Imagem ZPL ausente ou ampliação não suportada.'); field.drawing = {type:'image',image}; break; }
        case 'FD': field.text = decodeText(data, field.hex, state.encoding); // FD consumes its FS.
        case 'FS': if (field.drawing || field.text !== undefined) { fields.push({...field,x:field.x??state.homeX,y:field.y??state.homeY,font:field.font||defaultFont}); } field = {}; break;
        default: fail('Comando ZPL ainda não suportado: ^'+cmd+'. Nenhum PDF parcial foi gerado.');
      }
    }
    if(block.slice(end).trim() || field.drawing) fail('Campo ZPL incompleto.');
    if(!fields.length) fail('Nenhum campo imprimível foi encontrado.');
    // Mercado Envios omits PW/LL. Start with its nominal 100 x 150 mm layout
    // (8 dots/mm); extend content bounds when a long address needs more space.
    // Decorative full-bleed separators may extend past the page edge.
    const measure = canvas(1,1).getContext('2d');
    let width = state.width || 800, height = state.height || 1200;
    for (const f of fields) {
      if(f.barcode) {
        if(f.reverse) fail('Código de barras invertido não suportado.');
        if(f.barcode.type==='code128') { f.bars = root.ZplCode128(f.text); f.drawWidth = f.bars.reduce((a,b)=>a+b,0)*f.barcode.module; f.drawHeight=f.barcode.height; }
        else {
          const qrData=f.text.match(/^([LMQH])A,([\s\S]+)$/); if(!qrData) fail('Formato de dados QR Code não suportado.');
          root.qrcode.stringToBytes=root.qrcode.stringToBytesFuncs['UTF-8'];
          f.qr=root.qrcode(0,qrData[1]); f.qr.addData(qrData[2],'Byte'); f.qr.make();
          f.drawWidth=f.drawHeight=f.qr.getModuleCount()*f.barcode.module;
        }
      } else if (f.text !== undefined) {
        measure.font='700 '+f.font.height+'px HarmonyZpl'; measure.fontKerning='none';
        f.lines=textLines(measure,f.text,f);
        f.lineWidths=f.lines.map(s=>measure.measureText(s).width*f.font.width/f.font.height);
        f.drawWidth=Math.max(0,...f.lineWidths);
        f.drawHeight=f.lines.length ? f.font.height+(f.lines.length-1)*(f.font.height+(f.block?.spacing||0)) : 0;
      } else if(f.drawing?.type==='image') { f.drawWidth=f.drawing.image.width; f.drawHeight=f.drawing.image.height; }
      else { f.drawWidth=f.drawing.width; f.drawHeight=Math.max(f.drawing.height,f.drawing.thickness); }
      if(f.drawing?.type!=='box') {
        const right=f.x+(f.block?Math.max(f.drawWidth,f.block.width):f.drawWidth);
        // Blocks can extend beyond the paper while short left-aligned text fits.
        const effectiveRight=f.block?.align==='L'?f.x+f.drawWidth:right;
        if(state.width && effectiveRight>state.width+1) fail('Há conteúdo fora da largura definida no ZPL.');
        if(state.height && f.y+f.drawHeight>state.height+1) fail('Há conteúdo fora da altura definida no ZPL.');
        if(!state.width) width=Math.max(width,effectiveRight+4);
        if(!state.height) height=Math.max(height,f.y+f.drawHeight+4);
      }
    }
    width=Math.ceil(width/8)*8; height=Math.ceil(height);
    if(width>4096||height>8192||width*height>16*1024*1024) fail('Dimensões de etiqueta fora do limite.');
    const c=canvas(width,height),ctx=c.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.imageSmoothingEnabled=false;
    for(const f of fields) {
      ctx.save();ctx.fillStyle=f.reverse?'#fff':'#000';
      if(f.reverse)ctx.globalCompositeOperation='difference';
      if(f.barcode?.type==='code128') {
        let x=f.x; f.bars.forEach((b,i)=>{if(i%2===0)ctx.fillRect(x,f.y,b*f.barcode.module,f.drawHeight);x+=b*f.barcode.module;});
      } else if(f.barcode?.type==='qr') {
        const n=f.qr.getModuleCount(),s=f.barcode.module;
        for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(f.qr.isDark(y,x))ctx.fillRect(f.x+x*s,f.y+y*s,s,s);
      } else if(f.text!==undefined) {
        ctx.font='700 '+f.font.height+'px HarmonyZpl';ctx.fontKerning='none';ctx.textBaseline='alphabetic';
        const scale=f.font.width/f.font.height;
        f.lines.forEach((text,i)=>{
          let x=f.x;const lineWidth=f.lineWidths[i];
          if(f.block?.align==='C')x+=(f.block.width-lineWidth)/2;
          if(f.block?.align==='R')x+=f.block.width-lineWidth;
          const y=f.y+f.font.height*.75+i*(f.font.height+(f.block?.spacing||0));
          ctx.save();ctx.translate(x,y);ctx.scale(scale,1);ctx.fillText(text,0,0);ctx.restore();
        });
      } else if(f.drawing.type==='box') {
        const d=f.drawing,w=Math.max(d.width,d.thickness),h=Math.max(d.height,d.thickness),t=Math.min(d.thickness,Math.min(w,h)/2);
        if(d.color==='W')ctx.fillStyle='#fff';
        ctx.fillRect(f.x,f.y,w,t);ctx.fillRect(f.x,f.y+h-t,w,t);ctx.fillRect(f.x,f.y+t,t,h-2*t);ctx.fillRect(f.x+w-t,f.y+t,t,h-2*t);
      } else {
        const im=f.drawing.image;
        for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++)if(im.raw[y*im.stride+(x>>3)]&(128>>(x&7)))ctx.fillRect(f.x+x,f.y+y,1,1);
      }
      ctx.restore();
    }
    const rgba=ctx.getImageData(0,0,width,height).data,stride=width/8,raw=new Uint8Array(stride*height);
    for(let i=0;i<width*height;i++)if(rgba[i*4]<128)raw[i>>3]|=128>>(i&7);
    // Keep only compact one-bit output, no canvas or customer text after rendering.
    c.width=c.height=1;
    return {raw,width,height,stride,copies:state.copies,kind:'commands',defaultSize:!state.width&&!state.height?'100x150':undefined};
  }
  root.ZplDrawing={render,decodeText};
})(globalThis);
