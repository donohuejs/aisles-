// Local-only UI fixture. Serves the real app with an isolated store double.
// No Firebase requests or shared-list writes are possible through this server.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT || 5081);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
http.createServer(async(req,res)=>{
  try {
    const requestURL=new URL(req.url,'http://localhost');
    let pathname=decodeURIComponent(requestURL.pathname);
    if(pathname==='/')pathname='/index.html';
    if(pathname==='/src/store.js')pathname='/test/store-double.js';
    const target=path.resolve(root,'.'+pathname);
    if(!target.startsWith(root)){res.writeHead(403);res.end();return;}
    let data=await fs.readFile(target);
    if(pathname==='/index.html')data=Buffer.from(data.toString().replace('<head>','<head><script src="/test/setup.js"></script>'));
    if(requestURL.searchParams.get('theme')==='dark') {
      if(pathname==='/index.html')data=Buffer.from(data.toString().replace('href="./styles.css"','href="./styles.css?theme=dark"'));
      if(pathname==='/styles.css')data=Buffer.from(data.toString().replace('@media (prefers-color-scheme: dark)','@media all'));
    }
    // The fixture store has no SDK dependency; omit unused network assets from
    // its shell so offline checks remain independent of Firebase availability.
    if(pathname==='/sw.js')data=Buffer.from(data.toString().replace(/  'https:\/\/www\.gstatic\.com[^\n]+\n/g,'').replace("'./src/recipe-parser.js',","'./src/recipe-parser.js','./test/setup.js',"));
    res.writeHead(200,{'Content-Type':mime[path.extname(target)] || 'text/plain','Cache-Control':'no-store'});res.end(data);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Isolated Aisles preview: http://127.0.0.1:${port}`));
