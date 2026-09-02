import test from 'node:test';
import assert from 'node:assert/strict';
import { createWriteQueue } from '../src/writes.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('failed and retried writes preserve their original list and payload',async()=>{
  let state,active='GROCERIES',attempt=0;const writes=[];
  const queue=createWriteQueue(next=>{state=next;});
  const list=active,patch={name:'Weekend groceries'};
  queue.run('Rename groceries',()=>{writes.push({list,patch});return ++attempt===1?Promise.reject(new Error('permission denied')):Promise.resolve();});
  active='COSTCO';await tick();
  assert.equal(state.failed.length,1);queue.retry(state.failed[0].id);await tick();
  assert.deepEqual(writes.map(w=>w.list),['GROCERIES','GROCERIES']);
  assert.equal(state.failed.length,0);assert.equal(queue.pendingCount,0);
});
test('offline writes stay pending and settle without blocking later writes',async()=>{
  let resolve,state;const queue=createWriteQueue(next=>{state=next;});
  queue.run('Offline edit',()=>new Promise(done=>{resolve=done;}));
  queue.run('Second edit',()=>Promise.resolve());await tick();
  assert.equal(state.pending.length,1);resolve();await tick();assert.equal(state.pending.length,0);
});
test('synchronous failures are recoverable and can be dismissed',()=>{
  let state;const queue=createWriteQueue(next=>{state=next;});
  assert.equal(queue.run('Bad write',()=>{throw new Error('invalid');}),false);
  assert.equal(state.failed.length,1);queue.dismiss(state.failed[0].id);assert.equal(state.failed.length,0);
});
test('undo prevents a late failed removal from reappearing as a retry',async()=>{
  let state,reject,canceled=false;const queue=createWriteQueue(next=>{state=next;});
  queue.run('Remove milk',()=>new Promise((resolve,fail)=>{reject=fail;}),{isCanceled:()=>canceled});
  canceled=true;reject(new Error('denied'));await tick();assert.equal(state.failed.length,0);
});
