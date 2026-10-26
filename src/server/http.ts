import type { IncomingMessage, ServerResponse } from 'node:http';
import { z, type ZodTypeAny } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export interface Req {
  raw: IncomingMessage;
  method: string;
  path: string;
  query: URLSearchParams;
  params: Record<string, string>;
  cookies: Record<string, string>;
  ip: string;
  body: () => Promise<Buffer>;
  json: <S extends ZodTypeAny>(schema: S) => Promise<z.infer<S>>;
}

export interface Res {
  raw: ServerResponse;
  headers: Record<string, string | string[]>;
  cookie: (name: string, value: string, opts?: { maxAge?: number; secure?: boolean }) => void;
  clearCookie: (name: string) => void;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* ignore malformed cookie */
    }
  }
  return out;
}

export function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, `Request is larger than ${Math.round(limit / 1000)} KB.`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export type Handler = (req: Req, res: Res) => Promise<unknown>;
interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

export class Router {
  routes: Route[] = [];
  on(method: string, path: string, handler: Handler) {
    const keys: string[] = [];
    const pattern = new RegExp('^' + path.replace(/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    this.routes.push({ method, pattern, keys, handler });
  }
  get = (p: string, h: Handler) => this.on('GET', p, h);
  post = (p: string, h: Handler) => this.on('POST', p, h);
  put = (p: string, h: Handler) => this.on('PUT', p, h);
  patch = (p: string, h: Handler) => this.on('PATCH', p, h);
  del = (p: string, h: Handler) => this.on('DELETE', p, h);
  match(method: string, path: string) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.pattern.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route: r, params };
    }
    return pathMatched ? 'method' : null;
  }
}

export const zId = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
export const zMoney = z.number().finite().min(0).max(100_000_000);
export const zMoneyOrNull = zMoney.nullable();
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD').refine((s) => !Number.isNaN(new Date(`${s}T12:00:00Z`).getTime()), 'Not a real date');
export const zDateOrNull = zDate.nullable();
