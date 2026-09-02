// Every retry closes over its original list and payload; switching lists cannot
// redirect a delayed or failed write. Firestore owns the durable offline queue.
export function createWriteQueue(onChange = () => {}) {
  const pending = new Map(), failed = new Map();
  let nextId = 0;
  const notify = () => onChange({pending:[...pending.values()],failed:[...failed.values()]});
  function run(label, action, options = {}) {
    const id = ++nextId;
    const entry = {id,label,action,options};
    let promise;
    try { promise = action(); }
    catch (error) {
      if (!options.isCanceled?.()) failed.set(id, {...entry,error});
      notify(); options.onFailure?.(error); return false;
    }
    pending.set(id, entry); notify();
    Promise.resolve(promise).then(() => {
      pending.delete(id); notify(); options.onSuccess?.();
    }, error => {
      pending.delete(id); if (!options.isCanceled?.()) failed.set(id,{...entry,error}); notify(); options.onFailure?.(error);
    });
    return true;
  }
  return {
    run,
    retry(id) { const entry = failed.get(id); if (!entry) return; failed.delete(id); run(entry.label,entry.action,entry.options); },
    dismiss(id) { failed.delete(id); notify(); },
    dismissWhere(predicate) { for(const [id,entry] of failed) if(predicate(entry))failed.delete(id); notify(); },
    get pendingCount() { return pending.size; }
  };
}
