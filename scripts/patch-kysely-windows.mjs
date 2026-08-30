/**
 * Windows-only boot fix for TrueForge.
 *
 * TrueForge runs its SQLite/Postgres migrations through kysely's
 * FileMigrationProvider, which does `await import(path.join(folder, file))`.
 * On Windows that produces an absolute path like `C:\...\001_init.js`, and
 * Node's ESM loader rejects it:
 *
 *   Only URLs with a scheme in: file, data, and node are supported by the
 *   default ESM loader. On Windows, absolute paths must be valid file:// URLs.
 *   Received protocol 'c:'
 *
 * The server then dies with "Failed to start server" before it ever listens.
 * kysely exposes an `import` prop as an escape hatch, but TrueForge doesn't
 * pass one, so we patch the provider itself to run the path through
 * pathToFileURL() first. No-op on macOS/Linux and idempotent, so it is safe
 * to leave wired into postinstall.
 *
 * Upstream: kysely FileMigrationProvider does not normalise Windows paths.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const TARGET = 'node_modules/kysely/dist/migration/file-migration-provider.js';
const NEEDLE = 'await import(/* webpackIgnore: true */ filePath)';
const PATCHED =
  'await import(/* webpackIgnore: true */ (await import("node:url")).pathToFileURL(filePath).href)';

if (process.platform !== 'win32') {
  console.log('[patch-kysely] not Windows, nothing to do');
  process.exit(0);
}

if (!existsSync(TARGET)) {
  console.log(`[patch-kysely] ${TARGET} not found, skipping`);
  process.exit(0);
}

const source = await readFile(TARGET, 'utf8');

if (source.includes('pathToFileURL')) {
  console.log('[patch-kysely] already patched');
  process.exit(0);
}

if (!source.includes(NEEDLE)) {
  console.error(
    `[patch-kysely] could not find the expected import call in ${TARGET}.\n` +
      'kysely probably changed upstream — re-check whether this patch is still needed.',
  );
  process.exit(1);
}

await writeFile(TARGET, source.replace(NEEDLE, PATCHED), 'utf8');
console.log('[patch-kysely] applied Windows file:// URL fix');
