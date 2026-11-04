import {cpSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {relative} from 'node:path';
import {build} from 'esbuild';
// Publish only the built site, never tools, tests, debug logs, or node_modules.
rmSync('dist', {recursive: true, force: true});
mkdirSync('dist');
for (const path of ['firebase-config.js', 'manifest.webmanifest', 'splash.css', 'assets']) cpSync(path, 'dist/' + path, {recursive: true});

const result = await build({
  entryPoints: {main: 'src/main.js', admin: 'src/admin.js', app: 'src/styles/app.css'},
  bundle: true, splitting: true, format: 'esm', minify: true, target: 'es2020', metafile: true, charset: 'utf8',
  outdir: 'dist/build', entryNames: '[name]-[hash]', chunkNames: 'chunk-[hash]', legalComments: 'none',
});
const outputs = Object.entries(result.metafile.outputs).map(([path, info]) => ({url: './' + relative('dist', path).replaceAll('\\', '/'), entry: info.entryPoint, size: info.bytes}));
const built = entry => outputs.find(o => o.entry === entry).url;
const css = outputs.find(o => o.url.endsWith('.css')).url;
const pages = ['index.html', 'admin.html', 'privacy.html', 'terms.html', 'docs-admin.html'];
for (const page of pages) {
  writeFileSync('dist/' + page, readFileSync(page, 'utf8').replaceAll('{{CSS}}', css).replaceAll('{{MAIN}}', built('src/main.js')).replaceAll('{{ADMIN}}', built('src/admin.js')));
}

// The cache name follows the content so every release replaces the previous shell.
const shell = ['./', ...pages.map(p => './' + p), './splash.css', './firebase-config.js', './manifest.webmanifest', './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png', './assets/brand-icon.svg', ...outputs.map(o => o.url)];
const version = createHash('sha256').update(shell.join() + pages.map(p => readFileSync('dist/' + p, 'utf8')).join()).digest('hex').slice(0, 12);
writeFileSync('dist/sw.js', readFileSync('sw.js', 'utf8').replace('__VERSION__', version).replace('__SHELL__', JSON.stringify(shell)));
for (const o of outputs) console.log(String(Math.round(o.size / 1024)).padStart(5) + ' KB ' + o.url);
