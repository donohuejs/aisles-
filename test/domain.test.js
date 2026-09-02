import test from 'node:test';
import assert from 'node:assert/strict';
import { guessCategory,memoryKey,groupItems,itemIsRemoved,cleanItem,categoriesFrom,validListId,DEFAULT_CATEGORIES } from '../src/domain.js';
import { parseRecipeText,findRecipeJsonLd } from '../src/recipe-parser.js';

test('specific products and whole words beat incidental ingredient substrings',()=>{
  for(const [name,category] of Object.entries({'frozen spinach':'frozen','chicken broth':'canned','garlic powder':'spices','peppermint tea':'drinks','ice cream':'frozen','almond milk':'dairy','chocolate chips':'spices','black beans':'canned'})) assert.equal(guessCategory(name),category,name);
  assert.equal(guessCategory('chair'),null);
});
test('learned categories win, but removed categories are never guessed',()=>{
  assert.equal(guessCategory('frozen spinach',DEFAULT_CATEGORIES,{'frozen spinach':'misc'}),'misc');
  assert.equal(guessCategory('frozen spinach',[{key:'custom',label:'Mine'}],{'frozen spinach':'produce'}),null);
});
test('memory keys safely handle slash, Unicode, reserved names, and long legacy input',async()=>{
  for(const name of ['salsa/dip','../','__proto__','🍎'.repeat(2000),'Salt & pepper']) {
    const key=await memoryKey(name);assert.match(key,/^v2_[a-f0-9]{64}$/);
  }
  assert.equal(await memoryKey('  MILK  '),await memoryKey('milk'));
  assert.notEqual(await memoryKey('salsa/dip'),await memoryKey('salsa dip'));
});
test('grouping preserves row order, unknown categories, and shopping visibility',()=>{
  const items=[{id:'a',category:'produce',checked:true},{id:'b',category:'produce'},{id:'c',category:'old'},{id:'d',category:'produce',removals:{one:true}}];
  const groups=groupItems(items,DEFAULT_CATEGORIES);
  assert.deepEqual(groups[0].items.map(i=>i.id),['b','a']);
  assert.equal(groups.at(-1).key,'__other__');
  assert.deepEqual(groupItems(items,DEFAULT_CATEGORIES,true).flatMap(g=>g.items.map(i=>i.id)),['b','c']);
});
test('undoing one removal does not undo another shopper’s removal',()=>{
  const item={name:'Milk',notes:'new note',removals:{mine:true,theirs:true}};
  delete item.removals.mine;
  assert.equal(itemIsRemoved(item),true);assert.equal(item.notes,'new note');
  delete item.removals.theirs;assert.equal(itemIsRemoved(item),false);
});
test('legacy items gain optional fields without losing names or punctuation',()=>{
  assert.deepEqual(cleanItem({name:' Milk "large" ',category:'dairy'}),{name:'Milk "large"',category:'dairy',quantity:'',notes:''});
  assert.throws(()=>cleanItem({name:'',category:'produce'}));
  assert.throws(()=>cleanItem({name:'Milk',category:'dairy',notes:'x'.repeat(501)}));
  assert.deepEqual(categoriesFrom({categories:[]}),[]);
  assert.equal(categoriesFrom({}).length,DEFAULT_CATEGORIES.length);
  assert.equal(validListId('../other'),false);assert.equal(validListId('WN8QGK'),true);
});
test('recipe parsing stops at directions and handles nested structured data',()=>{
  assert.deepEqual(parseRecipeText('A recipe\nIngredients\n• 2 cups flour\n1. 1 tsp salt\nDirections\nMix everything.'),['2 cups flour','1 tsp salt']);
  const recipe={'@type':['Thing','Recipe'],recipeIngredient:['Milk']};
  assert.equal(findRecipeJsonLd({'@graph':[{'@type':'Article'},recipe]}),recipe);
  assert.equal(parseRecipeText(Array.from({length:120},(_,i)=>`Ingredient ${i}`).join('\n')).length,100);
});
