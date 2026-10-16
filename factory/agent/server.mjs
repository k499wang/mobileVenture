import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROLES } from './roles.mjs';
import { isRunId } from './store.mjs';

const staticFiles = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };

async function readBody(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new Error('Requests require application/json.');
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 40_000) throw new Error('Request body is too large.');
  }
  return JSON.parse(body || '{}');
}

/** Local console only: loopback binding, exact Host/Origin, no arbitrary file or shell endpoints. */
export function createStudioServer(studio) {
  return http.createServer(async (request, response) => {
    const json = (status, value, extra = {}) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', ...extra });
      response.end(JSON.stringify(value));
    };
    try {
      const port = request.socket.localPort;
      const host = request.headers.host;
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) return json(403, { error: 'Local console host required.' });
      const origin = request.headers.origin;
      if (origin && origin !== `http://${host}`) return json(403, { error: 'Cross-origin requests are not allowed.' });
      const url = new URL(request.url, `http://${host}`);
      if (request.method === 'GET' && staticFiles[url.pathname]) {
        const [file, type] = staticFiles[url.pathname];
        response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
        response.end(await readFile(path.join(import.meta.dirname, 'public', file)));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/config') return json(200, {
        liveAvailable: studio.liveAvailable, model: studio.model ?? '', roles: ROLES,
      });
      if (request.method === 'GET' && url.pathname === '/api/runs') return json(200, { runs: await studio.store.list() });
      if (request.method === 'POST' && url.pathname === '/api/runs') {
        const input = await readBody(request);
        const state = await studio.create({ brief: input.brief, mode: input.mode, injectFailure: input.injectFailure });
        json(201, state);
        studio.start(state.id).catch(error => process.stderr.write(`Workflow error: ${error.message}\n`));
        return;
      }
      const match = url.pathname.match(/^\/api\/runs\/([^/]+)(?:\/(approve|pause|resume|export|files|file))?$/);
      if (!match || !isRunId(match[1])) return json(404, { error: 'Endpoint not found.' });
      const [, id, action] = match;
      const state = await studio.get(id);
      if (request.method === 'GET' && !action) return json(200, state);
      if (request.method === 'GET' && action === 'export') return json(200, state,
        { 'Content-Disposition': `attachment; filename="venture-trace-${id}.json"` });
      if (request.method === 'GET' && ['files', 'file'].includes(action)) {
        const tools = await studio.workspace(state);
        return json(200, action === 'files' ? await tools.listFiles() : await tools.readFile(url.searchParams.get('path')));
      }
      if (request.method === 'POST') {
        const input = await readBody(request);
        let next;
        if (action === 'approve') next = await studio.approve(id, input.specHash);
        else if (action === 'pause') next = await studio.pause(id);
        else if (action === 'resume') next = await studio.resume(id);
        else return json(404, { error: 'Action not found.' });
        json(200, next);
        if (action !== 'pause') studio.start(id).catch(error => process.stderr.write(`Workflow error: ${error.message}\n`));
        return;
      }
      return json(405, { error: 'Method not allowed.' });
    } catch (error) {
      return json(error.code === 'ENOENT' ? 404 : 400, { error: error.message });
    }
  });
}
