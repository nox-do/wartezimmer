import { createReadStream, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  httpStatusForError,
  parseCheckInBody,
  parseRedirectBody,
  parseSaveJourneyTemplateBody,
  parseSaveRuleBody,
  parseSaveTopicBody,
  parseTransitionAction,
  parseTransitionBody,
} from '@praxis-flow/flow-core';
import { createRuntime, openDb } from './runtime.js';
import { projectRoot } from './paths.js';

const MAX_BODY_BYTES = 64 * 1024;

const rootDir = projectRoot();
const publicDir = join(rootDir, 'src/public');
const sharedDir = join(rootDir, 'dist/shared');
const runtime = createRuntime(openDb());

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:3001');
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
      return;
    }
    serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, httpStatusForError(error), { error: error instanceof Error ? error.message : String(error) });
  }
});

async function handleApi(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  if (request.method === 'GET' && url.pathname === '/api/catalog') return sendJson(response, 200, runtime.catalog());
  if (request.method === 'GET' && url.pathname === '/api/visits') return sendJson(response, 200, runtime.visits());
  const eventMatch = url.pathname.match(/^\/api\/visits\/([^/]+)\/events$/);
  if (request.method === 'GET' && eventMatch) return sendJson(response, 200, runtime.events(eventMatch[1]));
  if (request.method === 'POST' && url.pathname === '/api/check-in') {
    return sendJson(response, 200, runtime.checkIn(parseCheckInBody(await readJson(request))));
  }
  const actionMatch = url.pathname.match(/^\/api\/visits\/([^/]+)\/(call|arrive|start|done)$/);
  if (request.method === 'POST' && actionMatch) {
    const body = await readJson(request);
    return sendJson(
      response,
      200,
      runtime.transition(actionMatch[1], parseTransitionAction(actionMatch[2]), parseTransitionBody(body)),
    );
  }
  const redirectMatch = url.pathname.match(/^\/api\/visits\/([^/]+)\/redirect$/);
  if (request.method === 'POST' && redirectMatch) {
    return sendJson(response, 200, runtime.redirect(redirectMatch[1], parseRedirectBody(await readJson(request))));
  }
  const ruleMatch = url.pathname.match(/^\/api\/routing-rules\/([^/]+)$/);
  if (request.method === 'PUT' && ruleMatch) {
    return sendJson(response, 200, runtime.saveRule(ruleMatch[1], parseSaveRuleBody(await readJson(request))));
  }
  const journeyMatch = url.pathname.match(/^\/api\/journey-templates\/([^/]+)$/);
  if (request.method === 'PUT' && journeyMatch) {
    return sendJson(
      response,
      200,
      runtime.saveJourneyTemplate(journeyMatch[1], parseSaveJourneyTemplateBody(await readJson(request))),
    );
  }
  const topicMatch = url.pathname.match(/^\/api\/topics\/([^/]+)$/);
  if (request.method === 'PUT' && topicMatch) {
    return sendJson(response, 200, runtime.saveTopic(topicMatch[1], parseSaveTopicBody(await readJson(request))));
  }
  sendJson(response, 404, { error: 'NOT_FOUND' });
}

function serveStatic(pathname: string, response: ServerResponse): void {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const fromShared = requested.startsWith('/shared/');
  const baseDir = fromShared ? sharedDir : publicDir;
  const relative = fromShared ? requested.slice('/shared/'.length) : requested;
  const path = join(baseDir, relative);
  if (!path.startsWith(baseDir) || !existsSync(path)) {
    sendJson(response, 404, { error: 'NOT_FOUND' });
    return;
  }
  response.writeHead(200, { 'content-type': mime[extname(path)] ?? 'application/octet-stream' });
  createReadStream(path).pipe(response);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) throw new Error('REQUEST_BODY_TOO_LARGE');
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

server.listen(3001, '127.0.0.1', () => {
  console.log('Flow Core listening on http://127.0.0.1:3001');
});
