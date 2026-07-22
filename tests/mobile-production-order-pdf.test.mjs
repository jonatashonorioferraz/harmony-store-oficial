import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('Android prints the production order in the current page without a temporary window',async()=>{
  const file=new URL('../production-orders.js',import.meta.url);
  const sourceCode=(await readFile(file,'utf8')).replace(/\}\)\(\);\s*$/,`globalThis.__productionOrderPdfTest={mobilePrint,printProductionOrder};})();`);
  const button={disabled:false,innerHTML:'🖨️ Gerar PDF',textContent:''};
  const printable={
    querySelector(selector){return selector==='[data-order-print]'?button:null},
    querySelectorAll(selector){return selector==='img'?[]:[]},
  };
  let prints=0,temporaryWindows=0;
  const context={
    S:{profile:{role:'collaborator'},view:'home'},
    API:'https://example.supabase.co',
    renderPage(){},renderApp(){},rpc(){},head(){},esc:value=>String(value),toast(){},
    navigator:{userAgent:'Mozilla/5.0 (Linux; Android 14)'},
    requestAnimationFrame:callback=>callback(),
    setTimeout,
    document:{
      body:{},fonts:{ready:Promise.resolve()},
      querySelector(selector){return selector==='#productionOrderPrint'?printable:null},
    },
    MutationObserver:class{observe(){}},
    window:{
      matchMedia:()=>({matches:true}),
      print(){prints++},
      open(){temporaryWindows++;return null},
    },
  };
  context.globalThis=context;
  vm.runInNewContext(sourceCode,context,{filename:'production-orders.js'});

  assert.equal(context.__productionOrderPdfTest.mobilePrint(),true);
  await context.__productionOrderPdfTest.printProductionOrder();
  assert.equal(prints,1);
  assert.equal(temporaryWindows,0);
  assert.equal(button.disabled,false);
  assert.equal(button.innerHTML,'🖨️ Gerar PDF');
});
