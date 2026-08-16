import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');

test('carregamento Harmony é tardio, concorrente e acessível',async()=>{
  const [script,style,index,worker]=await Promise.all([read('harmony-experience.js'),read('harmony-experience.css'),read('index.html'),read('service-worker.js')]);
  assert.match(script,/activeLoads\+=1/);
  assert.match(script,/setTimeout\(\(\)=>\{[\s\S]*?element\.hidden=false[\s\S]*?\},120\)/);
  assert.match(script,/finally\{endPageLoad\(\)\}/);
  assert.match(script,/aria-busy/);
  assert.match(script,/role','status/);
  assert.match(style,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(style,/@media\(max-width:640px\)/);
  assert.match(style,/\.harmony-module-loader\[hidden\]\{display:none!important\}/);
  assert.match(style,/pointer-events:none/);
  assert.match(index,/harmony-experience\.css\?v=25\.62/);
  assert.match(index,/harmony-experience\.js\?v=25\.61/);
  assert.ok(index.indexOf('collaborator-timeline.js')<index.indexOf('harmony-experience.js'),'o interceptador deve ser carregado por último');
  assert.match(worker,/harmony-store-v25-93-r1/);
  assert.match(worker,/harmony-experience\.js\?v=25\.61/);
  assert.match(worker,/harmony-experience\.css\?v=25\.62/);
});

test('progresso da IA limita interpretação e só conclui após resposta',async()=>{
  const script=await read('harmony-experience.js');
  assert.match(script,/reading:\{value:39,cap:84/);
  assert.match(script,/validate:\{value:88,cap:96/);
  assert.match(script,/done:\{value:100,cap:100/);
  assert.match(script,/percentual acompanha as etapas concluídas e é estimado/);
  assert.match(script,/Seu arquivo continua selecionado/);
  assert.match(script,/aria-valuenow/);
});

test('cupom e boleto usam progresso, revisão e nova tentativa segura',async()=>{
  const [receipt,bills]=await Promise.all([read('internal-supplies.js'),read('bills.js')]);
  for(const source of [receipt,bills]){
    assert.match(source,/HarmonyExperience\?\.createAIProgress/);
    assert.match(source,/progress\?\.start\(\)/);
    assert.match(source,/progress\?\.phase\('reading'\)/);
    assert.match(source,/progress\?\.phase\('validate'\)/);
    assert.match(source,/await progress\?\.complete\(\)/);
    assert.match(source,/progress\?\.fail\(\)/);
    assert.match(source,/Tentar leitura novamente/);
  }
  assert.match(receipt,/object\/internal-receipts\/.*method:'DELETE'/);
  assert.match(bills,/object\/bill-documents\/.*method:'DELETE'/);
  assert.match(receipt,/id="receiptAiProgress"/);
  assert.match(bills,/id="billAiProgress"/);
});

test('documentação da experiência acompanha a versão',async()=>{
  const [manual,technical,audit,changelog,pkg]=await Promise.all([
    read('docs/manual/MANUAL-DO-APLICATIVO.md'),
    read('docs/technical/EXPERIENCIA-CARREGAMENTO-IA-V25.61.md'),
    read('docs/audit/RELATORIO-EXPERIENCIA-CARREGAMENTO-IA-V25.61.md'),
    read('CHANGELOG.md'),read('package.json')
  ]);
  assert.match(manual,/percentual da interpretação é estimado/);
  assert.match(technical,/Leitura pela IA — até 84%/);
  assert.match(audit,/Nenhuma permissão/);
  assert.match(changelog,/\[v25\.61\]/);
  assert.equal(JSON.parse(pkg).version,'25.93.0');
});
