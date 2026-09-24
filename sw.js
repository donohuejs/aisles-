// Bump this version whenever any app-shell file changes. A waiting update is
// activated only after the user has finished pending writes.
const CACHE='aisles-shell-v5';
const SHELL=[
  './','./index.html','./styles.css','./icon.svg','./apple-touch-icon.png','./icon-192.png','./icon-512.png','./manifest.webmanifest',
  './src/app.js','./src/ui.js','./src/domain.js','./src/catalog.js','./src/storage.js',
  './src/writes.js','./src/store.js','./src/config.js','./src/recipes.js','./src/sharing.js','./src/recipe-parser.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js'
];
const urls=new Set(SHELL.map(path=>new URL(path,self.location.href).href));
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(url=>new Request(url,{cache:'reload'})))));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('aisles-shell-') && key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  // Only app resources are cached. Firestore requests, recipe pages, and shared
  // list contents never enter this public shell cache.
  if(event.request.mode==='navigate' && url.origin===self.location.origin) {
    event.respondWith(caches.open(CACHE).then(cache=>cache.match('./index.html')).then(cached=>cached || fetch(event.request)));
  } else if(urls.has(url.href)) {
    event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request)).then(cached=>cached || fetch(event.request)));
  }
});
