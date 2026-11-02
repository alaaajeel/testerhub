import {cpSync,mkdirSync,rmSync} from 'node:fs';
// Publish only the static shell, never tools, tests, debug logs, or node_modules.
rmSync('dist',{recursive:true,force:true});
mkdirSync('dist');
for(const path of ['index.html','firebase-config.js','manifest.webmanifest','sw.js','splash.css','.nojekyll','assets','src'])cpSync(path,'dist/'+path,{recursive:true});
