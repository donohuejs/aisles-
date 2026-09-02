import { DEFAULT_CATEGORIES,guessCategory,normalizeName,validListId,generateCode,visibleItems,cleanItem,categoriesFrom } from './domain.js';
import { readJSON,writeJSON,readText,writeText } from './storage.js';
import { createWriteQueue } from './writes.js';
import { $,element,button,setText,categoryOptions,toast,openModal,closeModal,modalIsOpen,setupLayout,createListRenderer } from './ui.js';
import { setupRecipes } from './recipes.js';
import { isUatEnvironment } from './config.js';
import { shareLink } from './sharing.js';

setupLayout();
if (isUatEnvironment) { $('environmentBadge').classList.add('show'); document.title='UAT — Aisles Shared Grocery List'; }
let store=null, unsubscribe=null, generation=0;
let items=[],categories=DEFAULT_CATEGORIES,memory={},memoryIds=[],listData={},loaded=false;
let sync={ready:false,pending:false,cached:true}, lastSyncError='';
let writeState={pending:[],failed:[]};
let settingsContext=null,editContext=null,assignContext=null,recatContext=null,deleteContext=null;
let manualCategory='';
const undoneTokens=new Set();
const failedAdds=new Map();
let shopping=readJSON('aisle_shopping_mode',false)===true;
let undoHistory=readJSON('aisle_undo_v1',[]);
if (!Array.isArray(undoHistory)) undoHistory=[];
undoHistory=undoHistory.filter(t=>t && validListId(t.listId) && Array.isArray(t.ids) && typeof t.token==='string');

const storedLists=readJSON('aisle_lists',[]);
let removed=new Set(readJSON('aisle_removed_lists',[]).filter?.(validListId) || []);
let pinned=(Array.isArray(storedLists)?storedLists:[]).filter(l=>l && validListId(l.id) && !removed.has(l.id));
const params=new URLSearchParams(location.search),urlList=params.get('list');
if (validListId(urlList) && params.get('join')==='1') removed.delete(urlList);
if (validListId(urlList) && !removed.has(urlList) && !pinned.some(l=>l.id===urlList)) pinned.push({id:urlList,name:'Shared List'});
let activeListId=validListId(urlList) && !removed.has(urlList) ? urlList : readText('aisle_active_list');
if (!pinned.some(l=>l.id===activeListId)) activeListId=pinned[0]?.id;
let fresh=false;
if (!activeListId) { activeListId=generateCode(); pinned=[{id:activeListId,name:'Groceries'}]; fresh=true; }
const savePins=()=>{ writeJSON('aisle_lists',pinned); writeJSON('aisle_removed_lists',[...removed]); };
savePins();

const queue=createWriteQueue(state=>{writeState=state; renderWrites(); renderSync();});
function mutate(label,action,options={}) {
  if (!store) { toast('Still connecting. Your input has been kept.'); return false; }
  return queue.run(label,action,options);
}
function renderWrites() {
  // Failure controls remain stable while metadata changes arrive.
  const wrap=$('failedWrites');
  const ids=new Set(writeState.failed.map(f=>String(f.id)));
  for (const node of wrap.children) if (!ids.has(node.dataset.id)) node.remove();
  for (const failure of writeState.failed) {
    if (wrap.querySelector(`[data-id="${failure.id}"]`)) continue;
    const row=element('div','failure'); row.dataset.id=String(failure.id);
    row.append(element('p','',`Couldn’t save: ${failure.label}. Your change is available to retry.`));
    const retry=button('','Retry'),dismiss=button('','Dismiss');
    retry.addEventListener('click',()=>queue.retry(failure.id));
    dismiss.addEventListener('click',()=>queue.dismiss(failure.id));
    row.append(retry,dismiss); wrap.append(row);
  }
}
function renderSync() {
  let message;
  const pending=writeState.pending.length || (sync.pending?1:0);
  if (writeState.failed.length) message=`${writeState.failed.length} change${writeState.failed.length===1?'':'s'} need attention`;
  else if (!navigator.onLine) message=pending?'Offline · changes waiting to sync':'Offline · showing cached list';
  else if (lastSyncError) message='Sync unavailable';
  else if (pending) message='Saving changes…';
  else if (!sync.ready) message='Connecting…';
  else message=sync.cached?'Connecting · cached list':'All changes saved';
  setText($('syncStatus'),message);
  $('reloadAppBtn').disabled=!!pending || !!writeState.failed.length;
}
window.addEventListener('online',renderSync); window.addEventListener('offline',renderSync);
// A tab close can discard recoverable failed writes or a memory-only queue.
window.addEventListener('beforeunload',event=>{
  if (writeState.failed.length || (queue.pendingCount && !store?.persistence)) { event.preventDefault(); event.returnValue=''; }
});

function renderTabs() {
  const buttons=pinned.map(list=>{
    const btn=button('tab-btn'+(list.id===activeListId?' active':''),list.name || 'List');
    btn.setAttribute('aria-pressed',String(list.id===activeListId));
    btn.addEventListener('click',()=>{if(list.id!==activeListId) switchList(list.id);}); return btn;
  });
  const add=button('tab-add','+','Create new list'); add.addEventListener('click',()=>openModal('newListOverlay'));
  $('tabsRow').replaceChildren(...buttons,add);
}
function persistLocation() {
  writeText('aisle_active_list',activeListId);
  const url=new URL(location.href); url.searchParams.set('list',activeListId); url.searchParams.delete('join'); history.replaceState({},'',url);
  $('codeLabel').textContent=`List: ${activeListId.slice(0,8)}${activeListId.length>8?'…':''}`;
  $('codeLabel').title=activeListId;
}
function saveDraft() { writeText(`aisle_draft_${activeListId}`,$('itemInput').value); }
function loadDraft() { $('itemInput').value=readText(`aisle_draft_${activeListId}`) || ''; manualCategory=''; updateGuess(); }
function switchList(id,isFresh=false) {
  saveDraft(); closeModal(); unsubscribe?.(); generation++;
  settingsContext=editContext=assignContext=recatContext=deleteContext=null;
  activeListId=id; items=[]; memory={}; memoryIds=[]; listData={}; categories=DEFAULT_CATEGORIES; loaded=false;
  sync={ready:false,cached:true,pending:false}; lastSyncError=''; $('connectionError').hidden=true;
  persistLocation(); renderTabs(); loadDraft(); render(); renderSync();
  if (store) subscribe(isFresh);
}
function subscribe(isFresh) {
  const id=activeListId,version=++generation;
  if (isFresh) {
    const name=pinned.find(l=>l.id===id)?.name || 'Groceries';
    mutate(`Create ${name}`,()=>store.createList(id,name));
  }
  unsubscribe=store.subscribe(id,{
    list(data) {
      if (version!==generation) return;
      if (data.deletedAt) { removeLocal(id,true); return; }
      listData=data; categories=categoriesFrom(data);
      const pin=pinned.find(l=>l.id===id);
      if (pin && data.name && pin.name!==data.name) { pin.name=String(data.name); savePins(); renderTabs(); }
      updateGuess(); render();
    },
    memory(value,ids) { if (version!==generation) return; memory=value; memoryIds=ids; updateGuess(); },
    items(value) { if (version!==generation) return; items=value; loaded=true; render(); },
    sync(value) { if (version!==generation) return; sync=value; renderSync(); },
    error(error) {
      if (version!==generation) return;
      console.error('List sync failed',error); lastSyncError=error.code || 'unavailable';
      $('connectionError').hidden=false;
      $('connectionError').textContent='Couldn’t sync this list. Check your connection or access, then reload. Cached items remain visible.';
      renderSync();
    }
  });
}
function removeLocal(id,deleted=false) {
  removed.add(id); pinned=pinned.filter(list=>list.id!==id); savePins();
  undoHistory=undoHistory.filter(ticket=>ticket.listId!==id); persistUndo();
  if (id===activeListId) {
    if (pinned.length) switchList(pinned[0].id);
    else { const next=generateCode(); pinned.push({id:next,name:'Groceries'}); savePins(); switchList(next,true); }
  } else renderTabs();
  toast(deleted?'That shared list was deleted':'Removed from your tabs');
}

const renderList=createListRenderer($('listRoot'),handleItemAction);
function render() {
  const live=visibleItems(items),checked=live.filter(item=>item.checked).length;
  setText($('countPill'),live.length?`${live.length-checked} left of ${live.length}`:'no items');
  $('finishBtn').disabled=!checked; $('clearAllBtn').disabled=!live.length;
  setText($('finishBtn'),checked?`✓ Finish shopping · Clear ${checked} checked`:'✓ Finish shopping');
  document.body.classList.toggle('shopping-mode',shopping);
  $('shoppingModeBtn').setAttribute('aria-pressed',String(shopping));
  setText($('shoppingModeBtn'),shopping?'Leave shopping mode':'Start shopping');
  renderList(items,categories,{groupMode:!!listData.groupMode,shopping,loading:!loaded}); renderUndo();
}
$('shoppingModeBtn').addEventListener('click',()=>{shopping=!shopping; writeJSON('aisle_shopping_mode',shopping); render();});

function updateGuess() {
  const value=$('itemInput').value.trim();
  $('guessRow').style.display=value?'flex':'none';
  const category=manualCategory || guessCategory(value,categories,memory);
  const cat=categories.find(c=>c.key===category);
  categoryOptions($('categorySelect'),categories,category,true);
  $('guessChip').style.display=cat?'inline-flex':'none'; $('categorySelect').style.display=cat?'none':'block';
  if (cat) {
    $('guessChip').replaceChildren(document.createTextNode(`${cat.icon} ${cat.label} `),element('span','hint',manualCategory?'· picked':'· tap to change'));
  }
}
$('itemInput').addEventListener('input',()=>{manualCategory=''; saveDraft(); updateGuess();});
$('guessChip').addEventListener('click',()=>{ $('guessChip').style.display='none'; $('categorySelect').style.display='block'; $('categorySelect').focus(); });
$('categorySelect').addEventListener('change',()=>{manualCategory=$('categorySelect').value; updateGuess();});
$('addForm').addEventListener('submit',event=>{
  event.preventDefault(); const name=$('itemInput').value.trim(); if (!name) return;
  const category=manualCategory || guessCategory(name,categories,memory);
  if (!category) { toast('Choose an aisle first'); $('categorySelect').focus(); return; }
  if (!store || !loaded) { toast('Wait for this list to finish loading.'); return; }
  let data; try { data=cleanItem({name,category}); } catch(error) { toast(error.message); return; }
  const list=activeListId,key=`${list}:${normalizeName(name)}`,item={...data,id:failedAdds.get(key) || store.newItemId(list)},remember=!!manualCategory;
  // Resubmitting a restored draft replaces its failed attempt, reusing its ID.
  queue.dismissWhere(entry=>entry.options.addKey===key);
  const queued=mutate(`Add ${name}`,()=>store.addItems(list,[item]),{addKey:key,onFailure:()=>{
    failedAdds.set(key,item.id);
    if (activeListId===list && !$('itemInput').value) { $('itemInput').value=name; manualCategory=category; saveDraft(); updateGuess(); }
  },onSuccess:()=>{
    if(!failedAdds.delete(key))return;
    if(readText(`aisle_draft_${list}`)===name)writeText(`aisle_draft_${list}`,'');
    if(activeListId===list && $('itemInput').value===name){$('itemInput').value='';manualCategory='';updateGuess();}
  }});
  if (queued) {
    if (remember) mutate(`Remember aisle for ${name}`,()=>store.remember(list,name,category));
    $('itemInput').value=''; manualCategory=''; saveDraft(); updateGuess();
  }
});

function persistUndo() { writeJSON('aisle_undo_v1',undoHistory); renderUndo(); }
function renderUndo() {
  const ticket=undoHistory.filter(t=>t.listId===activeListId).at(-1);
  $('undoBar').hidden=!ticket;
  if (ticket) $('undoLabel').textContent=ticket.label;
}
function removeItems(targets,label) {
  if (!targets.length) return;
  const list=activeListId,ids=targets.map(item=>item.id),token=crypto.randomUUID();
  const ticket={listId:list,ids,token,label};
  if (mutate(label,()=>store.removeItems(list,ids,token),{removalToken:token,isCanceled:()=>undoneTokens.has(token)})) {
    undoHistory.push(ticket); undoHistory=undoHistory.slice(-20); persistUndo();
  }
}
$('undoBtn').addEventListener('click',()=>{
  const ticket=undoHistory.filter(t=>t.listId===activeListId).at(-1); if (!ticket) return;
  if (mutate(`Undo: ${ticket.label}`,()=>store.undoRemoval(ticket.listId,ticket.ids,ticket.token))) {
    undoneTokens.add(ticket.token);queue.dismissWhere(entry=>entry.options.removalToken===ticket.token);
    undoHistory=undoHistory.filter(t=>t.token!==ticket.token); persistUndo(); toast('Restoring items');
  }
});
$('finishBtn').addEventListener('click',()=>{const checked=visibleItems(items).filter(i=>i.checked); removeItems(checked,`Removed ${checked.length} checked items`);});
$('clearAllBtn').addEventListener('click',()=>openModal('confirmOverlay'));
$('modalCancel').addEventListener('click',closeModal);
$('modalConfirm').addEventListener('click',()=>{closeModal();const live=visibleItems(items);removeItems(live,`Removed all ${live.length} items`);});

function handleItemAction(action,id) {
  const item=visibleItems(items).find(i=>i.id===id); if (!item) return;
  const list=activeListId;
  if (action==='toggle') { const checked=!item.checked; mutate(`${checked?'Check':'Uncheck'} ${item.name}`,()=>store.updateItem(list,id,{checked})); }
  if (action==='remove') removeItems([item],`Removed ${item.name}`);
  if (action==='edit') {
    editContext={list,id,original:{name:item.name,quantity:item.quantity || '',notes:item.notes || '',category:item.category}};
    $('editName').value=item.name; $('editQuantity').value=item.quantity || ''; $('editNotes').value=item.notes || '';
    categoryOptions($('editCategory'),categories,item.category); $('editError').classList.remove('show'); openModal('editOverlay');
  }
  if (action==='category') {
    recatContext={list,id,name:item.name}; $('recatItemName').textContent=item.name;
    $('recatChips').replaceChildren(...categories.map(cat=>{
      const chip=button('name-chip',`${cat.icon} ${cat.label}`);
      chip.addEventListener('click',()=>{
        const context=recatContext;if(!context)return;
        mutate(`Move ${context.name}`,()=>store.updateItem(context.list,context.id,{category:cat.key}));
        mutate(`Remember aisle for ${context.name}`,()=>store.remember(context.list,context.name,cat.key));closeModal();
      });return chip;
    }));openModal('recatOverlay');
  }
  if (action==='assign') {
    assignContext={list,id,name:item.name}; $('assignNameInput').value=item.assignedTo || '';
    $('assignChips').replaceChildren(...[...new Set(visibleItems(items).map(i=>i.assignedTo).filter(Boolean))].map(name=>{
      const chip=button('name-chip',name);chip.addEventListener('click',()=>{$('assignNameInput').value=name;});return chip;
    }));openModal('assignOverlay');
  }
}
$('editForm').addEventListener('submit',event=>{
  event.preventDefault(); const context=editContext; if(!context)return;
  try {
    const data=cleanItem({name:$('editName').value,quantity:$('editQuantity').value,notes:$('editNotes').value,category:$('editCategory').value});
    const latest=items.find(i=>i.id===context.id);
    if (context.list!==activeListId || !latest || !visibleItems([latest]).length) throw new Error('This item is no longer available. Close and reopen the editor.');
    const patch={};
    for(const key of Object.keys(data)) if(data[key]!==context.original[key]) {
      if((latest[key] || '')!==context.original[key]) throw new Error('Someone else edited this item. Close and reopen it to see their changes.');
      patch[key]=data[key];
    }
    if (!Object.keys(patch).length) {closeModal();return;}
    if(mutate(`Edit ${data.name}`,()=>store.updateItem(context.list,context.id,patch))) {
      if (patch.category) mutate(`Remember aisle for ${data.name}`,()=>store.remember(context.list,data.name,data.category));
      closeModal();
    }
  } catch(error) {$('editError').textContent=error.message;$('editError').classList.add('show');}
});
$('recatCancelBtn').addEventListener('click',closeModal);
function assign(value) {const context=assignContext;if(!context)return; if(mutate(`Assign ${context.name}`,()=>store.updateItem(context.list,context.id,{assignedTo:value}))) closeModal();}
$('assignConfirmBtn').addEventListener('click',()=>{const name=$('assignNameInput').value.trim();if(name)assign(name);});
$('assignRemoveBtn').addEventListener('click',()=>assign(null));

function settingsSnapshot() { return {name:String(listData.name || pinned.find(l=>l.id===activeListId)?.name || ''),groupMode:!!listData.groupMode,categories:categories.map(c=>({...c}))}; }
function loadSettings() {
  const base=settingsSnapshot(); settingsContext={list:activeListId,base,draft:structuredClone(base)};
  $('listNameInput').value=base.name; $('settingsError').classList.remove('show');$('reloadSettingsBtn').hidden=true;
  renderCategoryEditor(); updateGroupSwitch();
}
function updateGroupSwitch() {const on=!!settingsContext?.draft.groupMode;$('groupModeToggle').classList.toggle('on',on);$('groupModeToggle').setAttribute('aria-checked',String(on));}
$('settingsBtn').addEventListener('click',()=>{loadSettings();openModal('settingsOverlay');});
$('reloadSettingsBtn').addEventListener('click',loadSettings);
$('groupModeToggle').addEventListener('click',()=>{if(settingsContext){settingsContext.draft.groupMode=!settingsContext.draft.groupMode;updateGroupSwitch();}});
function renderCategoryEditor() {
  const draft=settingsContext?.draft;if(!draft)return;
  // Only structural edits rebuild these inputs; remote snapshots and keystrokes
  // never replace the focused input or reset a half-written category name.
  $('catEditList').replaceChildren(...draft.categories.map((cat,index)=>{
    const row=element('div','cat-edit-row');
    const icon=element('input','icon-field');icon.type='text';icon.value=cat.icon;icon.maxLength=12;icon.setAttribute('aria-label',`Icon for ${cat.label}`);
    const label=element('input','label-field');label.type='text';label.value=cat.label;label.maxLength=80;label.setAttribute('aria-label',`Category name ${index+1}`);
    icon.addEventListener('input',()=>{cat.icon=icon.value;});label.addEventListener('input',()=>{cat.label=label.value;});
    const up=button('row-btn','↑',`Move ${cat.label} up`),down=button('row-btn','↓',`Move ${cat.label} down`),remove=button('row-btn','×',`Delete category ${cat.label}`);
    up.disabled=index===0;down.disabled=index===draft.categories.length-1;
    up.addEventListener('click',()=>{[draft.categories[index-1],draft.categories[index]]=[draft.categories[index],draft.categories[index-1]];renderCategoryEditor();});
    down.addEventListener('click',()=>{[draft.categories[index+1],draft.categories[index]]=[draft.categories[index],draft.categories[index+1]];renderCategoryEditor();});
    remove.addEventListener('click',()=>{draft.categories.splice(index,1);renderCategoryEditor();});row.append(icon,label,up,down,remove);return row;
  }));
}
$('addCatBtn').addEventListener('click',()=>{
  const label=$('newCatLabel').value.trim();if(!label || !settingsContext)return;
  settingsContext.draft.categories.push({key:crypto.randomUUID(),label:label.slice(0,80),icon:$('newCatIcon').value.trim() || '🛒'});
  $('newCatLabel').value='';$('newCatIcon').value='';renderCategoryEditor();
});
$('settingsCloseBtn').addEventListener('click',()=>{
  const context=settingsContext;if(!context)return;
  context.draft.name=$('listNameInput').value.trim();
  context.draft.categories=context.draft.categories.map(cat=>({...cat,label:cat.label.trim() || 'Untitled',icon:cat.icon.trim() || '🛒'}));
  const latest=settingsSnapshot(),patch={};
  for (const key of ['name','groupMode','categories']) {
    if(JSON.stringify(context.draft[key])===JSON.stringify(context.base[key]))continue;
    if(context.list!==activeListId || JSON.stringify(latest[key])!==JSON.stringify(context.base[key])) {
      $('settingsError').textContent='These settings changed on another device. Reload the latest settings before saving.';
      $('settingsError').classList.add('show');$('reloadSettingsBtn').hidden=false;return;
    }
    patch[key]=context.draft[key];
  }
  if(!context.draft.name){toast('Give this list a name');return;}
  if(!Object.keys(patch).length || mutate(`Save settings for ${context.draft.name}`,()=>store.saveList(context.list,patch)))closeModal();
});

$('removeTabBtn').addEventListener('click',()=>{deleteContext={list:activeListId};$('removeTabName').textContent=listData.name || 'this list';openModal('removeTabOverlay');});
$('removeTabConfirmBtn').addEventListener('click',()=>{const id=deleteContext?.list;closeModal();if(id)removeLocal(id);});
$('deleteListBtn').addEventListener('click',()=>{deleteContext={list:activeListId,items:[...items],memoryIds:[...memoryIds]};$('deleteListName').textContent=listData.name || 'this list';openModal('deleteListOverlay');});
$('deleteListConfirmBtn').addEventListener('click',()=>{
  const context=deleteContext;if(!context)return;
  if(!navigator.onLine){toast('Reconnect before permanently deleting a shared list.');return;}
  if(mutate('Delete shared list',()=>store.deleteList(context.list,context.items,context.memoryIds)))closeModal();
});
for (const id of ['removeTabCancelBtn','deleteListCancelBtn','newListCancelBtn']) $(id).addEventListener('click',closeModal);
$('newListConfirmBtn').addEventListener('click',()=>{
  const name=$('newListNameInput').value.trim().slice(0,80) || 'New List',id=generateCode();
  if(!store){toast('Wait for the app to connect first');return;}
  pinned.push({id,name});savePins();$('newListNameInput').value='';switchList(id,true);
});

async function share(url,title) {
  const outcome=await shareLink(url,title);
  if(outcome==='copied')toast('Link copied');
  if(outcome==='manual'){$('shareLink').value=url;openModal('shareOverlay');$('shareLink').select();}
}
$('shareBtn').addEventListener('click',()=>{const url=new URL(location.href);url.searchParams.set('list',activeListId);url.searchParams.set('join','1');share(url.toString(),listData.name || 'Aisles list');});
$('inviteAppBtn').addEventListener('click',()=>share(location.origin+location.pathname,'Aisles — start a grocery list'));
$('copyShareBtn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('shareLink').value);toast('Link copied');closeModal();}catch{$('shareLink').select();toast('Select and copy the link above');}});

setupRecipes({
  context:()=>({listId:activeListId,categories:categories.map(c=>({...c})),items:visibleItems(items),memory:{...memory}}),
  add(context,selected) {
    if(!store)return false;
    const records=selected.map(item=>({...cleanItem(item),id:store.newItemId(context.listId),source:item.source}));
    return mutate(`Import ${records.length} recipe ingredients`,()=>store.addItems(context.listId,records));
  }
});

persistLocation();renderTabs();loadDraft();render();renderSync();
try {
  const module=await import('./store.js'); store=module.createStore(); subscribe(fresh);
  if(!store.persistence)toast('Offline storage is unavailable in this browser. Keep this tab open while changes are pending.');
} catch(error) {
  console.error('Startup failed',error);$('connectionError').hidden=false;
  $('connectionError').textContent='Couldn’t load the connection tools. Your draft is kept. Connect to the internet and reload.';
  lastSyncError='startup';renderSync();
}
if('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(registration=>{
    const offerUpdate=()=>{if(registration.waiting){$('updateNotice').hidden=false;renderSync();}};
    offerUpdate();registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',offerUpdate));
    $('reloadAppBtn').addEventListener('click',()=>{
      if(queue.pendingCount || writeState.failed.length){toast('Save or resolve pending changes before updating');return;}
      if(registration.waiting)registration.waiting.postMessage({type:'ACTIVATE'});
      else location.reload();
    });
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(!$('updateNotice').hidden && !queue.pendingCount && !writeState.failed.length)location.reload();
    });
  }).catch(error=>console.warn('Offline app cache unavailable',error));
}
