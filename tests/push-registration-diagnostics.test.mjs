import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

function context({online=true,permission='granted'}={}){
  return {window:{matchMedia:()=>({matches:true}),navigator:{standalone:false},addEventListener:()=>{}},navigator:{onLine:online,userAgent:'Android Chrome',platform:'Linux',maxTouchPoints:1,serviceWorker:{},standalone:false},Notification:{permission,requestPermission:async()=>permission},PushManager:function(){},screen:{orientation:{}},document:{body:{},querySelector:()=>null,querySelectorAll:()=>[]},MutationObserver:class{observe(){}},location:{href:'https://app.harmonylembrancinhas.com.br/',search:''},URL,Uint8Array,atob:value=>Buffer.from(value,'base64').toString('binary'),setTimeout,console,S:{profile:null}};
}

test('Android push service failure is translated and never shown raw',async()=>{
  const source=await read('pwa.js'),sandbox=context();
  vm.runInNewContext(source,sandbox);
  const error=new Error('Registration failed - push service error');
  assert.equal(sandbox.pushFailureKind(error),'android-service');
  assert.match(sandbox.pushFailureMessage('android-service'),/Android não conseguiu registrar/);
  assert.doesNotMatch(sandbox.pushFailureMessage('android-service'),/Registration failed/i);
});

test('offline, blocked permission and database failures receive distinct guidance',async()=>{
  const source=await read('pwa.js'),offline=context({online:false});vm.runInNewContext(source,offline);
  assert.equal(offline.pushFailureKind(new Error('failed')),'offline');
  const denied=context({permission:'denied'});vm.runInNewContext(source,denied);
  assert.equal(denied.pushFailureKind(new Error('failed')),'permission');
  const database=context(),error=new Error('rpc failed');error.pushStage='database';vm.runInNewContext(source,database);
  assert.equal(database.pushFailureKind(error),'database');
});

test('activation refreshes the service worker and presents an in-app recovery guide',async()=>{
  const [pwa,css,html]=await Promise.all([read('pwa.js'),read('notifications.css'),read('index.html')]);
  assert.match(pwa,/await registration\.update\(\)\.catch/);
  assert.match(pwa,/Configurações do site → Notificações/);
  assert.match(pwa,/Google Play Services/);
  assert.match(pwa,/Central de Notificações/);
  assert.match(css,/\.push-help/);
  assert.match(html,/pwa\.js\?v=25\.27/);
});
