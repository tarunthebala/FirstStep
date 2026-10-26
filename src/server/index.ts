import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { ZodError } from 'zod';
import { config } from './config';
import { HttpError, parseCookies, readBody, type Req, type Res } from './http';
import { buildApi, UPLOAD_LIMIT } from './api';
import { LocalAuth, LocalDB, LocalStore } from './store/local';
import { SupabaseAuth, SupabaseStore } from './store/supabase';
import type { AuthProvider, Store } from './store/types';

/** Client IP for rate limiting. Behind a hosting proxy every request comes from the proxy, so read X-Forwarded-For only when TRUST_PROXY=true. */
function clientIp(raw: IncomingMessage): string {
  if (config.trustProxy) {
    const fwd = raw.headers['x-forwarded-for'];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return (raw.socket.remoteAddress ?? 'unknown').replace('::ffff:', '');
}

/** Host of an Origin header; a malformed or opaque ("null") origin never matches. */
function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export function createApp(opts: { dataFile?: string } = {}) {
  let store: Store;
  let auth: AuthProvider;
  if (config.dataDriver === 'supabase') {
    const { url, anonKey, serviceRoleKey } = config.supabase;
    if (!url || !anonKey) throw new Error('DATA_DRIVER=supabase needs SUPABASE_URL and SUPABASE_ANON_KEY.');
    store = new SupabaseStore({ url, anonKey, serviceRoleKey });
    auth = new SupabaseAuth({ url, anonKey, serviceRoleKey });
  } else {
    const db = new LocalDB(opts.dataFile ?? config.localDataFile);
    store = new LocalStore(db);
    auth = new LocalAuth(db);
  }
  const api = buildApi(store, auth);
  const publicDir = join(process.cwd(), 'dist/public');
  const secure = config.appUrl.startsWith('https://');

  const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };

  function securityHeaders(res: ServerResponse) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' https://cdn.plaid.com; frame-src https://cdn.plaid.com; connect-src 'self' https://*.plaid.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  function serveStatic(path: string, res: ServerResponse) {
    const clean = normalize(path).replace(/^(\.\.[/\\])+/, '');
    let file = join(publicDir, clean);
    if (!file.startsWith(publicDir)) file = join(publicDir, 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(publicDir, 'index.html'); // SPA fallback
    if (!existsSync(file)) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('App bundle missing. Run `npm run build`.');
      return;
    }
    const ext = extname(file);
    res.writeHead(200, { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=300' });
    res.end(readFileSync(file));
  }

  async function handle(raw: IncomingMessage, out: ServerResponse) {
    securityHeaders(out);
    const url = new URL(raw.url ?? '/', 'http://local');
    const method = (raw.method ?? 'GET').toUpperCase();
    if (!url.pathname.startsWith('/api/')) {
      if (method !== 'GET' && method !== 'HEAD') {
        out.writeHead(405).end();
        return;
      }
      serveStatic(decodeURIComponent(url.pathname), out);
      return;
    }

    const headers: Record<string, string | string[]> = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    const setCookies: string[] = [];
    const res: Res = {
      raw: out,
      headers,
      cookie: (name, value, o = {}) => setCookies.push(`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${secure || o.secure ? '; Secure' : ''}${o.maxAge ? `; Max-Age=${o.maxAge}` : ''}`),
      clearCookie: (name) => setCookies.push(`${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`),
    };
    let bodyCache: Buffer | null = null;
    const isUpload = url.pathname === '/api/imports';
    const req: Req = {
      raw,
      method,
      path: url.pathname,
      query: url.searchParams,
      params: {},
      cookies: parseCookies(raw.headers.cookie),
      ip: clientIp(raw),
      body: async () => (bodyCache ??= await readBody(raw, isUpload ? UPLOAD_LIMIT : 64_000)),
      json: async (schema) => {
        const buf = await req.body();
        let data: unknown = {};
        if (buf.length) {
          try {
            data = JSON.parse(buf.toString('utf8'));
          } catch {
            throw new HttpError(400, 'Invalid JSON.');
          }
        }
        return schema.parse(data);
      },
    };

    const send = (status: number, payload: unknown) => {
      if (setCookies.length) headers['Set-Cookie'] = setCookies;
      out.writeHead(status, headers);
      out.end(JSON.stringify(payload));
    };

    try {
      // CSRF: state-changing API calls must carry a custom header, which browsers won't send cross-site
      // without a CORS preflight (and this server never grants CORS).
      if (method !== 'GET' && raw.headers['x-firststep'] !== '1') throw new HttpError(403, 'Missing request header.');
      const origin = raw.headers.origin;
      if (method !== 'GET' && origin && originHost(origin) !== raw.headers.host) throw new HttpError(403, 'Cross-site request blocked.');
      const m = api.match(method, url.pathname);
      if (m === null) throw new HttpError(404, 'Not found.');
      if (m === 'method') throw new HttpError(405, 'Method not allowed.');
      req.params = m.params;
      const result = await m.route.handler(req, res);
      send(200, result ?? { ok: true });
    } catch (e) {
      if (e instanceof ZodError) {
        const first = e.issues[0];
        send(422, { error: first ? `${first.path.length ? first.path.join('.') + ': ' : ''}${first.message}` : 'Invalid input.', issues: e.issues.map((i) => ({ path: i.path, message: i.message })) });
      } else if (e instanceof HttpError) {
        send(e.status, { error: e.message, details: e.details });
      } else {
        // Log the error type and route only — never request bodies, which may contain financial data.
        console.error(`[api] ${method} ${url.pathname} failed:`, e instanceof Error ? e.message : 'unknown error');
        send(500, { error: 'Something went wrong on our side. Your saved data is safe; please try again.' });
      }
    }
  }

  return createServer((rq, rs) => void handle(rq, rs));
}

const isMain = process.argv[1] && /src[/\\]server[/\\]index\.ts$/.test(process.argv[1]);
if (isMain) {
  const server = createApp();
  server.listen(config.port, () => {
    console.info(`FirstStep running at ${config.appUrl} (data: ${config.dataDriver})`);
  });
}
