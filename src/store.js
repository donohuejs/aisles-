import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  collection, doc, setDoc, updateDoc, onSnapshot, query, orderBy,
  writeBatch, serverTimestamp, deleteField
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { firebaseConfig } from './config.js';
import { DEFAULT_CATEGORIES, memoryKey, normalizeName } from './domain.js';

export function createStore() {
  const app = initializeApp(firebaseConfig);
  let db, persistence = true;
  try {
    db = initializeFirestore(app, {localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});
  } catch (error) {
    console.warn('Persistent cache unavailable:', error);
    persistence = false;
    db = initializeFirestore(app, {localCache:memoryLocalCache()});
  }
  const listRef = id => doc(db,'lists',id);
  const itemsRef = id => collection(db,'lists',id,'items');
  const itemRef = (list,id) => doc(itemsRef(list),id);
  const updateMany = (list,ids,patch) => {
    const writes=[];
    for(let offset=0;offset<ids.length;offset+=400) {
      const batch=writeBatch(db);
      for(const id of ids.slice(offset,offset+400))batch.update(itemRef(list,id),patch);
      writes.push(batch.commit());
    }
    return Promise.all(writes);
  };

  // Explicit list IDs are required by every mutation; there is no mutable
  // global reference to the current list in this module.
  return {
    persistence,
    newItemId: list => doc(itemsRef(list)).id,
    createList: (id,name) => setDoc(listRef(id),{name,categories:DEFAULT_CATEGORIES,groupMode:false,createdAt:serverTimestamp()}),
    saveList: (id,patch) => setDoc(listRef(id),patch,{merge:true}),
    addItems(id,items) {
      const batch = writeBatch(db);
      for (const item of items) {
        const {id:itemId,...data} = item;
        batch.set(itemRef(id,itemId),{...data,checked:false,assignedTo:null,addedAt:serverTimestamp()});
      }
      return batch.commit();
    },
    updateItem: (list,id,patch) => updateDoc(itemRef(list,id),patch),
    async remember(id,name,category) {
      const key = await memoryKey(name);
      return setDoc(doc(db,'lists',id,'categoryMemory',key),{name:normalizeName(name),category,updatedAt:serverTimestamp()});
    },
    removeItems(list,ids,token) {
      return updateMany(list,ids,{[`removals.${token}`]:true});
    },
    undoRemoval(list,ids,token) {
      // Remove only this operation's marker. Another shopper's removal remains
      // in force, and newer quantities/notes/checks are never overwritten.
      return updateMany(list,ids,{[`removals.${token}`]:deleteField()});
    },
    deleteList(list,items,memoryIds) {
      // Tombstone first: a failed cleanup cannot leave the list looking active.
      return setDoc(listRef(list),{deletedAt:serverTimestamp()}).then(async () => {
        const refs = [...items.map(i => itemRef(list,i.id)), ...memoryIds.map(id => doc(db,'lists',list,'categoryMemory',id))];
        for (let i=0;i<refs.length;i+=400) {
          const batch = writeBatch(db); refs.slice(i,i+400).forEach(ref => batch.delete(ref)); await batch.commit();
        }
      });
    },
    subscribe(id, handlers) {
      let active = true;
      const safe = callback => (...args) => { if (active) callback?.(...args); };
      const metadata = {};
      const meta = (key,snapshot) => {
        metadata[key] = {pending:snapshot.metadata.hasPendingWrites,cached:snapshot.metadata.fromCache};
        handlers.sync?.({pending:Object.values(metadata).some(m=>m.pending),cached:Object.values(metadata).some(m=>m.cached),ready:Object.keys(metadata).length===3});
      };
      const error = safe(handlers.error);
      const unsubs = [
        onSnapshot(listRef(id),{includeMetadataChanges:true},safe(snap => { meta('list',snap); handlers.list(snap.exists() ? snap.data() : {}); }),error),
        onSnapshot(collection(db,'lists',id,'categoryMemory'),{includeMetadataChanges:true},safe(snap => {
          meta('memory',snap);
          const memory = Object.create(null);
          // Read legacy IDs first, then prefer the new named, hashed records.
          const docs = snap.docs.slice().sort((a,b)=>Number(!!a.data().name)-Number(!!b.data().name));
          docs.forEach(d => { const data=d.data(); memory[data.name || d.id]=data.category; });
          handlers.memory(memory,snap.docs.map(d=>d.id));
        }),error),
        onSnapshot(query(itemsRef(id),orderBy('addedAt','asc')),{includeMetadataChanges:true},safe(snap => {
          meta('items',snap); handlers.items(snap.docs.map(d=>({...d.data(),id:d.id})));
        }),error)
      ];
      return () => { active=false; unsubs.forEach(unsub=>unsub()); };
    }
  };
}
