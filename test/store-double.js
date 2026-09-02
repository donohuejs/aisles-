import { DEFAULT_CATEGORIES,normalizeName } from '../src/domain.js';
const key='aisle_fixture_data';
const names=['Lime juice','Spinach','Cucumber','Bananas','Pico de gallo','Lime','Cilantro','Baby carrots','Hummus','Serrano or spicy pepper','Avocado','White onion','Milk "large"'];
let data=JSON.parse(localStorage.getItem(key) || 'null') || {
  TEST01:{list:{name:'Groceries',categories:DEFAULT_CATEGORIES,groupMode:false},memory:{},items:names.map((name,i)=>({id:String(i),name,category:'produce',checked:i===10 || i===11,quantity:'',notes:''}))},
  TEST02:{list:{name:'Costco',categories:DEFAULT_CATEGORIES,groupMode:false},memory:{},items:[{id:'costco1',name:'Paper towels',category:'household'}]}
};
let offline=false,failNext=false,sub=null;const pending=[];
Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>!offline});
const ensure=id=>data[id] ||= {list:{},items:[],memory:{}};
function emit(){if(!sub)return;const value=ensure(sub.id);sub.h.list(structuredClone(value.list));sub.h.items(structuredClone(value.items));sub.h.memory({...value.memory},[]);sub.h.sync({ready:true,cached:offline,pending:!!pending.length});}
function change(update){
  if(failNext){failNext=false;return Promise.reject(new Error('Simulated save failure'));}
  update();localStorage.setItem(key,JSON.stringify(data));
  let result=Promise.resolve();if(offline)result=new Promise(resolve=>pending.push(resolve));queueMicrotask(emit);return result;
}
export function createStore(){
  const controls=document.createElement('aside');controls.className='test-controls';controls.style.cssText='margin:12px;padding:8px;border:1px dashed #888;font:12px system-ui';
  controls.textContent='Local test data only · ';
  for(const [text,action] of [
    ['Fail next save',()=>{failNext=true;}],
    ['Work offline',()=>{offline=true;window.dispatchEvent(new Event('offline'));emit();}],
    ['Reconnect',()=>{offline=false;pending.splice(0).forEach(resolve=>resolve());window.dispatchEvent(new Event('online'));emit();}],
    ['Simulate remote note',()=>change(()=>{ensure(sub.id).items[0].notes='Updated by another shopper';})]
  ]){const button=document.createElement('button');button.textContent=text;button.onclick=action;controls.append(button);}
  document.body.append(controls);
  return {
    persistence:true,
    newItemId:()=>crypto.randomUUID(),
    createList:(id,name)=>change(()=>{ensure(id).list={name,categories:DEFAULT_CATEGORIES,groupMode:false};}),
    saveList:(id,patch)=>change(()=>Object.assign(ensure(id).list,patch)),
    addItems:(id,records)=>change(()=>{for(const item of records){const list=ensure(id);const existing=list.items.findIndex(i=>i.id===item.id);if(existing>=0)list.items[existing]={...item};else list.items.push({...item,checked:false});}}),
    updateItem:(list,id,patch)=>change(()=>Object.assign(ensure(list).items.find(i=>i.id===id),patch)),
    remember:(id,name,category)=>change(()=>{ensure(id).memory[normalizeName(name)]=category;}),
    removeItems:(list,ids,token)=>change(()=>{for(const id of ids){const item=ensure(list).items.find(i=>i.id===id);item.removals ||= {};item.removals[token]=true;}}),
    undoRemoval:(list,ids,token)=>change(()=>{for(const id of ids){const item=ensure(list).items.find(i=>i.id===id);if(item?.removals)delete item.removals[token];}}),
    deleteList:(id)=>change(()=>{ensure(id).list={deletedAt:Date.now()};}),
    subscribe(id,h){sub={id,h};queueMicrotask(emit);return()=>{if(sub?.id===id)sub=null;};}
  };
}
