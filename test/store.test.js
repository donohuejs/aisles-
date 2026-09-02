import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DEFAULT_CATEGORIES,memoryKey,normalizeName} from '../src/domain.js';
const source=(await fs.readFile(new URL('../src/store.js',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\r?\n/gm,'').replace('export function','function');
function fixture() {
  const batches=[],writes=[],listeners=[];let unsubscribed=0;
  const path=(parent,...parts)=>({path:[parent.path,...parts].filter(Boolean).join('/'),id:parts.at(-1)});
  const api={
    initializeApp:()=>({}),initializeFirestore:()=>({}),persistentLocalCache:()=>({}),persistentMultipleTabManager:()=>({}),memoryLocalCache:()=>({}),
    doc:path,collection:path,query:ref=>ref,orderBy:()=>null,serverTimestamp:()=>'<timestamp>',deleteField:()=>'<delete-field>',
    setDoc:(ref,data,options)=>{writes.push({ref,data,options});return Promise.resolve();},
    updateDoc:(ref,data)=>{writes.push({ref,data});return Promise.resolve();},
    onSnapshot:(ref,options,next,error)=>{listeners.push({ref,next,error});return()=>unsubscribed++;},
    writeBatch:()=>{const ops=[];return {set:(ref,data)=>ops.push({ref,data}),update:(ref,data)=>ops.push({ref,data}),delete:ref=>ops.push({ref,delete:true}),commit:()=>{batches.push(ops);return Promise.resolve();}};},
    firebaseConfig:{},DEFAULT_CATEGORIES,memoryKey,normalizeName,console
  };
  const store=new Function(...Object.keys(api),source+'\nreturn createStore();')(...Object.values(api));
  return {store,batches,writes,listeners,get unsubscribed(){return unsubscribed;}};
}
test('large removal and undo operations are batched and never replace item contents',async()=>{
  const {store,batches}=fixture();const ids=Array.from({length:1001},(_,i)=>String(i));
  await store.removeItems('LIST01',ids,'token');assert.deepEqual(batches.map(b=>b.length),[400,400,201]);
  assert.deepEqual(batches[0][0],{ref:{path:'lists/LIST01/items/0',id:'0'},data:{'removals.token':true}});
  await store.undoRemoval('LIST01',['0'],'token');assert.deepEqual(batches.at(-1)[0].data,{'removals.token':'<delete-field>'});
});
test('hashed category memory keeps its original name and explicit list scope',async()=>{
  const {store,writes}=fixture();await store.remember('LIST01','Salsa/dip','produce');
  assert.match(writes[0].ref.path,/^lists\/LIST01\/categoryMemory\/v2_[a-f0-9]{64}$/);assert.equal(writes[0].data.name,'salsa/dip');
  await store.updateItem('LIST02','item',{notes:'new'});assert.equal(writes[1].ref.path,'lists/LIST02/items/item');
});
test('subscriptions detach all listeners and ignore stale deliveries after switching',()=>{
  const f=fixture();const received=[];
  const stop=f.store.subscribe('LIST01',{list:data=>received.push(data),items:()=>{},memory:()=>{},error:()=>{},sync:()=>{}});
  assert.equal(f.listeners.length,3);stop();assert.equal(f.unsubscribed,3);
  f.listeners[0].next({metadata:{},exists:()=>true,data:()=>({name:'old'})});assert.equal(received.length,0);
});
test('new memory records override legacy IDs; all listener errors are handled',()=>{
  const f=fixture();let memory;const errors=[];
  f.store.subscribe('LIST01',{list:()=>{},items:()=>{},memory:value=>{memory=value;},error:error=>errors.push(error),sync:()=>{}});
  f.listeners[1].next({metadata:{},docs:[{id:'v2_hash',data:()=>({name:'milk',category:'misc'})},{id:'milk',data:()=>({category:'dairy'})}]});
  assert.equal(memory.milk,'misc');for(const listener of f.listeners)listener.error(new Error('denied'));assert.equal(errors.length,3);
});
