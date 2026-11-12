// Tiny static server for dist/ (local checks only): node scripts/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const port = Number(process.argv[2] || 5173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname).slice(1);
  if (!path || path.endsWith('/')) path += 'index.html';
  if (path.split('/').includes('..')) return res.writeHead(400).end();
  try {
    const body = await readFile(join('dist', path));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'text/html' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
