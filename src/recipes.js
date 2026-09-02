import { guessCategory,normalizeName } from './domain.js';
import { parseRecipeText,importRecipeUrl } from './recipe-parser.js';
import { $,element,button,categoryOptions,openModal,closeModal,toast } from './ui.js';

export function setupRecipes({context,add}) {
  let target=null,tab='text',title='',url='',controller=null,request=0;
  const error=(id,message='')=>{ $(id).textContent=message;$(id).classList.toggle('show',!!message); };
  function setTab(next) {
    tab=next;title='';url='';error('recipeError');
    document.querySelectorAll('.recipe-tab').forEach(btn=>{btn.classList.toggle('active',btn.dataset.recipeTab===tab);btn.setAttribute('aria-pressed',String(btn.dataset.recipeTab===tab));});
    document.querySelectorAll('.recipe-panel').forEach(panel=>panel.classList.toggle('active',panel.dataset.recipePanel===tab));
  }
  function reset() {
    target=context();setTab('text');$('recipeInputStep').style.display='';$('recipeReviewStep').style.display='none';
    $('recipeItems').replaceChildren();error('recipeError');error('recipeReviewError');$('recipeSelectAllBtn').textContent='Select all';
  }
  $('importRecipeBtn').addEventListener('click',()=>{reset();openModal('recipeOverlay');});
  $('recipeCancelBtn').addEventListener('click',closeModal);
  $('recipeOverlay').addEventListener('modalclose',()=>{request++;controller?.abort();$('recipeParseBtn').disabled=false;$('recipeParseBtn').textContent='Review ingredients';});
  document.querySelectorAll('.recipe-tab').forEach(btn=>btn.addEventListener('click',()=>{request++;controller?.abort();setTab(btn.dataset.recipeTab);$('recipeParseBtn').disabled=false;}));
  function review(ingredients) {
    const unique=[...new Map(ingredients.map(name=>[normalizeName(name),name])).values()].slice(0,100);
    if(!unique.length)throw new Error('Paste ingredient lines, or include an Ingredients heading.');
    if(!target.categories.length)throw new Error('Add an aisle in List settings before importing.');
    const existing=new Set(target.items.map(item=>normalizeName(item.name)));
    $('recipeItems').replaceChildren(...unique.map(name=>{
      const row=element('div','recipe-item');
      const check=element('input');check.type='checkbox';check.checked=!existing.has(normalizeName(name));check.setAttribute('aria-label',`Add ${name}`);
      const input=element('input','recipe-item-name');input.type='text';input.value=name;input.maxLength=160;input.setAttribute('aria-label',`Ingredient ${name}`);
      const select=element('select','recipe-item-category');select.setAttribute('aria-label',`Aisle for ${name}`);
      const guess=guessCategory(name,target.categories,target.memory) || target.categories.find(c=>c.key==='misc')?.key || target.categories[0].key;
      categoryOptions(select,target.categories,guess);row.append(check,input,select);
      if(existing.has(normalizeName(name)))row.append(element('span','recipe-existing','Already on this list — left unchecked'));
      return row;
    }));
    $('recipeReviewTitle').textContent=title || `${unique.length} ingredients found`;
    $('recipeInputStep').style.display='none';$('recipeReviewStep').style.display='';
  }
  $('recipeParseBtn').addEventListener('click',async()=>{
    const version=++request;controller?.abort();controller=new AbortController();
    const button=$('recipeParseBtn');button.disabled=true;button.textContent=tab==='url'?'Importing…':'Parsing…';error('recipeError');
    try {
      title='';url='';let ingredients;
      if(tab==='url') {
        url=$('recipeUrl').value.trim();const result=await importRecipeUrl(url,controller.signal);title=result.title;ingredients=result.ingredients;
      } else ingredients=parseRecipeText($('recipeText').value);
      if(version===request)review(ingredients);
    } catch(failure) {if(version===request)error('recipeError',failure.message);}
    finally {if(version===request){button.disabled=false;button.textContent='Review ingredients';}}
  });
  $('recipeBackBtn').addEventListener('click',()=>{$('recipeInputStep').style.display='';$('recipeReviewStep').style.display='none';error('recipeReviewError');});
  $('recipeSelectAllBtn').addEventListener('click',()=>{
    const checks=[...$('recipeItems').querySelectorAll('input[type=checkbox]')],all=checks.some(c=>!c.checked);
    checks.forEach(c=>{c.checked=all;});$('recipeSelectAllBtn').textContent=all?'Select none':'Select all';
  });
  $('recipeAddBtn').addEventListener('click',()=>{
    error('recipeReviewError');
    const selected=[...$('recipeItems').children].filter(row=>row.querySelector('input[type=checkbox]').checked).map(row=>({
      name:row.querySelector('.recipe-item-name').value.trim(),category:row.querySelector('select').value,
      source:{type:'recipe',title:title || null,url:url || null}
    }));
    if(!selected.length){error('recipeReviewError','Select at least one ingredient.');return;}
    // Re-check edited rows so two ingredients renamed to the same value do not
    // create accidental duplicates within this import.
    const unique=[...new Map(selected.map(item=>[normalizeName(item.name),item])).values()];
    try {if(add(target,unique)){closeModal();toast(`${unique.length} ingredients added; changes will sync when connected.`);}}
    catch(failure){error('recipeReviewError',failure.message);}
  });
}
