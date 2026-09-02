import { DEFAULT_CATEGORIES, CATEGORY_KEYWORDS } from './catalog.js';

export { DEFAULT_CATEGORIES };
export const normalizeName = value => String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const words = value => normalizeName(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const rules = [
  ['frozen', /\b(frozen|ice cream|popsicles?)\b/],
  ['spices', /\b(chocolate chips|garlic powder|onion powder|ground pepper|black pepper|chili powder|seasoning|extract)\b/],
  ['canned', /\b(broth|stock|canned|tomato paste|tomato sauce|coconut milk)\b/],
  ['drinks', /\b(tea|coffee|juice|seltzer)\b/],
];
const phrases = Object.entries(CATEGORY_KEYWORDS).flatMap(([category, list]) => list.map(phrase => ({category, phrase:words(phrase)})))
  .sort((a,b) => b.phrase.length - a.phrase.length);

export function guessCategory(name, categories = DEFAULT_CATEGORIES, memory = {}) {
  const valid = new Set(categories.map(c => c.key));
  const normalized = normalizeName(name);
  if (Object.hasOwn(memory, normalized) && valid.has(memory[normalized])) return memory[normalized];
  const text = words(name);
  if (!text) return null;
  for (const [category, pattern] of rules) if (valid.has(category) && pattern.test(text)) return category;
  const exact = phrases.find(p => valid.has(p.category) && p.phrase === text);
  if (exact) return exact.category;
  return phrases.find(p => valid.has(p.category) && ` ${text} `.includes(` ${p.phrase} `))?.category ?? null;
}

// A hash makes every name (slashes, emoji, and long legacy names included)
// a valid document ID. The original normalized name is stored as a field.
export async function memoryKey(name) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeName(name)));
  return 'v2_' + [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
}

export function validListId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{6,80}$/.test(value);
}
export function generateCode() {
  // Preserve existing six-character links; use stronger IDs for new lists.
  return crypto.randomUUID().replaceAll('-', '');
}
export function itemIsRemoved(item) {
  return Object.values(item.removals || {}).some(Boolean);
}
export function visibleItems(items) { return items.filter(item => !itemIsRemoved(item)); }
export function groupItems(items, categories, hideChecked = false) {
  const groups = new Map(categories.map(cat => [cat.key, {...cat, items:[], checked:[]} ]));
  const other = {key:'__other__',label:'Other',icon:'📦',items:[],checked:[]};
  for (const item of items) {
    if (itemIsRemoved(item) || (hideChecked && item.checked)) continue;
    const group = groups.get(item.category) || other;
    (item.checked ? group.checked : group.items).push(item);
  }
  return [...groups.values(), other].map(group => ({...group, remaining:group.items.length, items:[...group.items,...group.checked]}))
    .filter(group => group.items.length);
}
export function cleanItem(input) {
  const name = String(input.name || '').trim();
  if (!name || name.length > 160) throw new Error('Use an item name between 1 and 160 characters.');
  if (!input.category) throw new Error('Choose an aisle.');
  const quantity = String(input.quantity || '').trim();
  const notes = String(input.notes || '').trim();
  if (quantity.length > 60 || notes.length > 500) throw new Error('Keep quantity under 60 and notes under 500 characters.');
  return {name, category:input.category, quantity, notes};
}

export function categoriesFrom(data) {
  if (!Array.isArray(data?.categories)) return DEFAULT_CATEGORIES.map(c => ({...c}));
  const seen = new Set();
  return data.categories.filter(c => c && typeof c.key === 'string' && typeof c.label === 'string' && !seen.has(c.key) && seen.add(c.key))
    .map(c => ({key:c.key,label:c.label,icon:typeof c.icon === 'string' ? c.icon : '🛒'}));
}
