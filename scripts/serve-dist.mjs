// Static server for local browser tests of the built site.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join, extname, normalize} from 'node:path';
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json'};
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '') || 'index.html';
  try {
    const body = await readFile(join('dist', path));
    res.writeHead(200, {'content-type': types[extname(path)] || 'application/octet-stream'});
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(4173, '127.0.0.1');
