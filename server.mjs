import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleGeminiRequest } from './geminiProxy.js';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
export function createAppServer(env = process.env, directory = resolve('dist')) {
  return createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/api/gemini-next-token') return await handleGeminiRequest(req, res, env);
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      const target = resolve(directory, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
      if (!target.startsWith(directory + sep)) { res.writeHead(403); res.end(); return; }
      const bytes = await readFile(target);
      res.setHeader('Content-Type', types[extname(target)] || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      res.statusCode = error?.code === 'ENOENT' || error?.code === 'EISDIR' ? 404 : 400;
      res.end('페이지를 찾을 수 없습니다.');
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createAppServer().listen(port, process.env.HOST || '127.0.0.1', () => console.log(`GPT visualizer ready on port ${port}`));
}
