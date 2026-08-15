import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const icons=read('harmony-icons.js');
const css=read('harmony-icons.css');
const index=read('index.html');
const worker=read('service-worker.js');

test('menus usam biblioteca vetorial única sem alterar rotas',()=>{
  for(const view of ['home','requests','products','categories','team','fields','audit','health','notifications','bills','intelligence','production','production-inventory','production-orders','collaborator-timeline','internal-supplies','help','shipping-planning','agenda-harmony','profile'])assert.ok(icons.includes(`${view.includes('-')?`'${view}'`:view}:`),`ícone ausente para ${view}`);
  for(const area of ['dashboard','shopee','operation','supply','ideas'])assert.match(icons,new RegExp(`${area}:'${area}'`));
  assert.match(icons,/MutationObserver/);
  assert.match(icons,/data-intel-area/);
  assert.doesNotMatch(icons,/onclick\s*=/);
});

test('ícones possuem estados profissionais e responsivos',()=>{
  assert.match(css,/\.sidebar \.nav>i/);
  assert.match(css,/\.sidebar \.nav\.active>i/);
  assert.match(css,/\.intel-primary-tabs button\.active>i/);
  assert.match(css,/@media\(min-width:721px\) and \(max-width:1100px\)/);
  assert.match(css,/@media\(max-width:720px\)/);
});

test('ativos da versão 25.89 são carregados e mantidos offline',()=>{
  assert.match(index,/harmony-icons\.css\?v=25\.89/);
  assert.match(index,/harmony-icons\.js\?v=25\.89/);
  assert.match(worker,/harmony-store-v25-89-r1/);
  assert.match(worker,/harmony-icons\.css\?v=25\.89/);
  assert.match(worker,/harmony-icons\.js\?v=25\.89/);
});
