import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

/** Minimal .env loader (no dependency). Existing environment variables win. */
function loadDotEnv(path = '.env') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    const [, k, raw] = m;
    const v = raw.replace(/^['"]|['"]$/g, '');
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadDotEnv();

const env = (k: string) => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

const isProd = process.env.NODE_ENV === 'production';

function encryptionKey(): Buffer {
  const k = env('APP_ENCRYPTION_KEY');
  if (k) {
    const buf = Buffer.from(k, 'base64');
    if (buf.length !== 32) throw new Error('APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).');
    return buf;
  }
  if (isProd) throw new Error('APP_ENCRYPTION_KEY is required in production.');
  // Development only: an ephemeral key. Stored provider tokens will not survive a restart.
  return randomBytes(32);
}

export const config = {
  isProd,
  port: Number(env('PORT') ?? 3000),
  appUrl: env('APP_URL') ?? `http://localhost:${env('PORT') ?? 3000}`,
  dataDriver: (env('DATA_DRIVER') ?? 'local') as 'local' | 'supabase',
  localDataFile: env('LOCAL_DATA_FILE') ?? '.data/firststep.json',
  encryptionKey: encryptionKey(),
  supabase: {
    // Accept common copy-paste variants: trailing slash, or the REST/Auth endpoint instead of the project URL.
    url: env('SUPABASE_URL')?.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, ''),
    anonKey: env('SUPABASE_ANON_KEY'),
    serviceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  },
  plaid: {
    clientId: env('PLAID_CLIENT_ID'),
    secret: env('PLAID_SECRET'),
    env: (env('PLAID_ENV') ?? 'sandbox') as 'sandbox' | 'production',
    /** Only enable after confirming with Plaid that your account has Liabilities and that your users' servicers are supported. */
    enableLiabilities: env('PLAID_ENABLE_LIABILITIES') === 'true',
    redirectUri: env('PLAID_REDIRECT_URI'),
  },
  email: {
    provider: env('EMAIL_PROVIDER'), // reserved; no provider wired in this build
  },
  demoEnabled: env('DEMO_MODE') !== 'false',
  /** Set true when running behind a hosting proxy (Render, Railway, Fly, Heroku, nginx) so rate limits use the real client IP. */
  trustProxy: env('TRUST_PROXY') === 'true',
};

export const plaidConfigured = () => Boolean(config.plaid.clientId && config.plaid.secret);
