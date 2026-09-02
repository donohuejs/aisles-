import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../sw.js',import.meta.url),'utf8');
test('offline navigation uses the cached shell without intercepting database or recipe traffic',async()=>{
  const handlers={};let skipped=false,networkCalls=0;
  const context={
    self:{location:{href:'https://aisles.test/sw.js',origin:'https://aisles.test'},addEventListener:(name,fn)=>{handlers[name]=fn;},skipWaiting:()=>{skipped=true;},clients:{claim:()=>Promise.resolve()}},
    caches:{open:async()=>({match:async path=>path==='./index.html'?'cached app':undefined,addAll:async()=>{}}),keys:async()=>[],delete:async()=>true},
    fetch:()=>{networkCalls++;return Promise.reject(new Error('offline'));},URL,Request
  };
  vm.runInNewContext(source,context);
  let response;
  handlers.fetch({request:{method:'GET',mode:'navigate',url:'https://aisles.test/?list=LIST01'},respondWith:promise=>{response=promise;}});
  assert.equal(await response,'cached app');assert.equal(networkCalls,0);
  for(const url of ['https://firestore.googleapis.com/channel','https://recipe.example/meal']) {
    let handled=false;handlers.fetch({request:{method:'GET',mode:'cors',url},respondWith:()=>{handled=true;}});assert.equal(handled,false);
  }
  assert.equal(skipped,false);handlers.message({data:{type:'ACTIVATE'}});assert.equal(skipped,true);
});
