import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function dailyApi(){
  const source=await readFile(new URL("../web/daily-messages.js",import.meta.url),"utf8");
  const context={window:{},Date,Object,Math};
  vm.runInNewContext(source,context);
  return context.window.HarmonyDaily;
}

test("daily collection contains sixty welcoming messages",async()=>{
  const api=await dailyApi();
  assert.equal(api.messages.length,60);
  assert.ok(api.messages.every(message=>message.length>=35));
  assert.equal(new Set(api.messages).size,60);
});

test("message is stable during the day and changes on the next day",async()=>{
  const api=await dailyApi(),morning=new Date(2026,6,17,8),evening=new Date(2026,6,17,20),tomorrow=new Date(2026,6,18,8);
  assert.equal(api.messageForDate(morning),api.messageForDate(evening));
  assert.notEqual(api.messageForDate(morning),api.messageForDate(tomorrow));
});

test("greeting follows the local time of day",async()=>{
  const api=await dailyApi();
  assert.equal(api.greetingForDate(new Date(2026,6,17,8)),"Bom dia");
  assert.equal(api.greetingForDate(new Date(2026,6,17,14)),"Boa tarde");
  assert.equal(api.greetingForDate(new Date(2026,6,17,20)),"Boa noite");
});
