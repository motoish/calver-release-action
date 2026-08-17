import { build } from 'esbuild';

const outfile = process.argv[2] ?? 'dist/index.js';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  outfile,
  sourcemap: true,
  banner: {
    js: "import { createRequire as __calverCreateRequire } from 'node:module'; const require = __calverCreateRequire(import.meta.url);",
  },
});
