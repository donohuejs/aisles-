import test from 'node:test';
import assert from 'node:assert/strict';
import {shareLink} from '../src/sharing.js';
test('native sharing receives the exact list link',async()=>{
  let sent;assert.equal(await shareLink('https://example.test/?list=LIST01&join=1','Groceries',{share:async value=>{sent=value;}}),'shared');
  assert.equal(sent.url,'https://example.test/?list=LIST01&join=1');
});
test('cancelling native sharing does not copy or share anything else',async()=>{
  let copied=false;
  const platform={share:async()=>{const e=new Error('Cancelled');e.name='AbortError';throw e;},clipboard:{writeText:async()=>{copied=true;}}};
  assert.equal(await shareLink('url','title',platform),'cancelled');assert.equal(copied,false);
});
test('unsupported sharing falls back to clipboard or selectable manual link',async()=>{
  let copied;assert.equal(await shareLink('url','title',{clipboard:{writeText:async value=>{copied=value;}}}),'copied');assert.equal(copied,'url');
  assert.equal(await shareLink('url','title',{}),'manual');
});
