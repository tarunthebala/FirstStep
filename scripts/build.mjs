// Bundles the browser app with esbuild and copies static assets into dist/public.
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const out = 'dist/public';

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('public', out, { recursive: true });

const options = {
  entryPoints: { app: 'src/client/main.tsx', styles: 'src/client/styles/app.css' },
  bundle: true,
  outdir: out,
  format: 'esm',
  splitting: false,
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  target: ['es2022'],
  jsx: 'automatic',
  loader: { '.svg': 'text' },
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
