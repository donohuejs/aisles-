import { groupItems } from './domain.js';

export const $ = id => document.getElementById(id);
export function element(tag, className, text) {
  const el=document.createElement(tag);
  if (className) el.className=className;
  if (text !== undefined) el.textContent=text;
  return el;
}
export function button(className,text,label) {
  const el=element('button',className,text); el.type='button';
  if (label) el.setAttribute('aria-label',label);
  return el;
}
export function setText(el,text) { if (el.textContent!==String(text)) el.textContent=text; }
export function categoryOptions(select,categories,value,placeholder=false) {
  const options=categories.map(c=>{ const option=element('option','',`${c.icon} ${c.label}`); option.value=c.key; return option; });
  if (placeholder) { const first=element('option','','Choose an aisle'); first.value=''; options.unshift(first); }
  select.replaceChildren(...options); select.value=value || '';
}

let toastTimer;
export function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent=message; $('toast').classList.add('show');
  toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4500);
}

let activeModal=null, returnFocus=null;
export function openModal(id) {
  if (activeModal) closeModal();
  returnFocus=document.activeElement;
  activeModal=$(id);
  activeModal.classList.add('show');
  document.querySelector('header').inert=true; document.querySelector('main').inert=true;
  document.body.classList.add('modal-open');
  const focus=activeModal.querySelector('input:not([type=checkbox]),textarea,button,select');
  focus?.focus();
}
export function closeModal() {
  if (!activeModal) return;
  activeModal.classList.remove('show');
  activeModal.dispatchEvent(new Event('modalclose'));
  activeModal=null;
  document.querySelector('header').inert=false; document.querySelector('main').inert=false;
  document.body.classList.remove('modal-open');
  if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
}
export function modalIsOpen(id) { return activeModal?.id===id; }
export function setupLayout() {
  const header=document.querySelector('header');
  const sync=()=>document.documentElement.style.setProperty('--header-height',`${header.getBoundingClientRect().height}px`);
  sync(); new ResizeObserver(sync).observe(header);
  for (const [index,overlay] of [...document.querySelectorAll('.modal-overlay')].entries()) {
    overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
    const heading=overlay.querySelector('h3,strong');
    if (heading) { heading.id ||= `dialog-title-${index}`; overlay.setAttribute('aria-labelledby',heading.id); }
    overlay.addEventListener('click',event=>{ if(event.target===overlay) closeModal(); });
    overlay.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',closeModal));
  }
  document.addEventListener('keydown',event=>{
    if (!activeModal) return;
    if (event.key==='Escape') { event.preventDefault(); closeModal(); }
    if (event.key==='Tab') {
      const focusable=[...activeModal.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(el=>!el.disabled && el.getClientRects().length);
      const first=focusable[0],last=focusable.at(-1);
      if (event.shiftKey && document.activeElement===first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first?.focus(); }
    }
  });
}

export function createListRenderer(root,onAction) {
  const sections=new Map(),rows=new Map();
  root.addEventListener('click',event=>{
    const action=event.target.closest('button[data-action]');
    const row=action?.closest('li.item');
    if (row) onAction(action.dataset.action,row.dataset.id);
  });
  function newRow(item) {
    const row=element('li','item'); row.dataset.id=item.id;
    const toggle=button('radial','',''); toggle.dataset.action='toggle'; toggle.setAttribute('role','checkbox');
    const edit=button('item-content','',''); edit.dataset.action='edit';
    const name=element('span','item-name'), details=element('span','item-details'); edit.append(name,details);
    const category=button('recat-btn','🏷️',''); category.dataset.action='category';
    const assign=button('assign-chip','',''); assign.dataset.action='assign';
    const remove=button('item-del','×',''); remove.dataset.action='remove';
    row.append(toggle,edit,category,assign,remove);
    return {row,toggle,edit,name,details,category,assign,remove};
  }
  return function render(items,categories,{groupMode=false,shopping=false,loading=false}={}) {
    const focused=document.activeElement;
    const focusedRow=focused?.closest?.('li.item');
    const groups=groupItems(items,categories,shopping);
    const activeGroups=new Set(),activeItems=new Set();
    let previousSection=null;
    for (const group of groups) {
      activeGroups.add(group.key);
      let section=sections.get(group.key);
      if (!section) {
        const node=element('section','category'), head=element('div','cat-head');
        const icon=element('span','icon'),title=element('h2'),count=element('span','cat-count'),list=element('ul','items');
        head.append(icon,title,count); node.append(head,list);
        section={node,icon,title,count,list}; sections.set(group.key,section);
      }
      setText(section.icon,group.icon); setText(section.title,group.label); setText(section.count,group.remaining);
      const next=previousSection ? previousSection.nextSibling : root.firstChild;
      if (next!==section.node) root.insertBefore(section.node,next);
      previousSection=section.node;
      let previousRow=null;
      for (const item of group.items) {
        activeItems.add(item.id);
        let view=rows.get(item.id);
        if (!view) { view=newRow(item); rows.set(item.id,view); }
        view.row.classList.toggle('checked',!!item.checked);
        view.toggle.classList.toggle('checked',!!item.checked);
        view.toggle.setAttribute('aria-checked',String(!!item.checked));
        view.toggle.setAttribute('aria-label',`Check ${item.name}`);
        view.edit.setAttribute('aria-label',`Edit ${item.name}`);
        view.category.setAttribute('aria-label',`Change category for ${item.name}`);
        view.remove.setAttribute('aria-label',`Remove ${item.name}`);
        setText(view.name,item.name);
        setText(view.details,[item.quantity,item.notes].filter(Boolean).join(' · '));
        view.details.hidden=!view.details.textContent;
        view.assign.hidden=!groupMode;
        setText(view.assign,item.assignedTo || '+ claim');
        view.assign.setAttribute('aria-label',`Assign ${item.name}${item.assignedTo ? `, claimed by ${item.assignedTo}` : ''}`);
        view.assign.classList.toggle('assigned',!!item.assignedTo);
        const nextRow=previousRow ? previousRow.nextSibling : section.list.firstChild;
        if (nextRow!==view.row) section.list.insertBefore(view.row,nextRow);
        previousRow=view.row;
      }
    }
    for (const [key,view] of rows) if (!activeItems.has(key)) { view.row.remove(); rows.delete(key); }
    for (const [key,view] of sections) if (!activeGroups.has(key)) { view.node.remove(); sections.delete(key); }
    root.querySelector('.empty-state')?.remove();
    if (!groups.length) {
      const empty=element('div','empty-state');
      empty.append(element('div','big',loading?'⏳':'🛒'),element('h3','',loading?'Loading your list…':shopping?'Nothing left to pick up':"List’s empty"),element('p','',loading?'Connecting to your saved list.':shopping?'Leave shopping mode to see checked items.':'Add your first item above.'));
      root.append(empty);
    }
    if (focusedRow && !focused?.isConnected) root.querySelector('.radial')?.focus({preventScroll:true});
    else if (focused?.isConnected && document.activeElement!==focused && focusedRow) focused.focus({preventScroll:true});
  };
}
