/**
 * Build the browser half into lib/client.js as a closure-factory bundle:
 * `window.__ModuleLoader__.load({ id, factory: (require) => {...} })`, with
 * the module table supplying the platform externals (react).
 *
 * The client source uses `import * as React from 'react'`, so only react is
 * external; every dsh type face is imported type-only and erases at bundle
 * time. Pass --watch to rebuild on change (esbuild context mode).
 */
import { build, context } from 'esbuild'

const ID = 'dsh-prompt-optimizer'

const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
]

const options = {
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  outfile: 'lib/client.js',
  sourcemap: true,
  legalComments: 'none',
  external: CLIENT_EXTERNALS,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  banner: {
    js: [
      `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
      'var module = { exports: {} }; var exports = module.exports;',
    ].join('\n'),
  },
  footer: { js: 'return module.exports; } });' },
}

if (process.argv.includes('--watch')) {
  const watcher = await context(options)
  await watcher.watch()
  console.log(`${ID}: watching src/client for changes`)
} else {
  await build(options)
  console.log(`${ID}: wrote lib/client.js`)
}
