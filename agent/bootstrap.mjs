/**
 * One-shot, idempotent setup of the TrueForge harness for SunoAI.
 *
 * Run against an already-running harness (`npm run harness`):
 *   npm run bootstrap
 *
 * It registers the Gemini model provider from .env. Re-running is safe: the
 * script uses PUT upserts, so it rotates the key rather than erroring on a
 * name clash.
 */
import { config } from './env.mjs';
import { TrueForgeClient } from './api.mjs';

/**
 * Register Google Gemini as a model provider.
 *
 * The shipped TrueForge catalog does not list gemini-3-flash-preview, but the
 * provider accepts any upstream model_id, so we declare it explicitly instead
 * of picking whatever the catalog happens to ship.
 */
async function registerModelProvider(client, { geminiApiKey, geminiModelId }) {
  await client.put('/api/v1/settings/model-providers', {
    manifest: {
      type: 'google-gemini',
      auth: { api_key: geminiApiKey },
      models: [
        {
          model_id: geminiModelId,
          // TrueForge model names must be lowercase and dot/dash-separated.
          name: geminiModelId.replace(/[^a-z0-9]+/g, '-'),
          properties: {
            context_length: 1_048_576,
            max_output_tokens: 65_536,
            reasoning_efforts: ['minimal', 'low', 'medium', 'high'],
          },
        },
      ],
    },
  });

  const models = await client.get('/api/v1/models');
  const names = (models ?? []).map((m) => (typeof m === 'string' ? m : m.name));
  const fqn = names.find((n) => n?.includes(geminiModelId.replace(/[^a-z0-9]+/g, '-')));
  if (!fqn) {
    throw new Error(
      `Registered ${geminiModelId} but it did not show up in /api/v1/models (got: ${names.join(', ') || 'nothing'}).`,
    );
  }
  return fqn;
}

async function main() {
  const cfg = config();
  const client = new TrueForgeClient(cfg.trueforgeBaseUrl);

  console.log(`Waiting for TrueForge at ${cfg.trueforgeBaseUrl} ...`);
  await client.waitUntilReady();

  const modelFqn = await registerModelProvider(client, cfg);
  console.log(`✓ model provider ready: ${modelFqn}`);
  console.log('\nBootstrap complete.');
}

await main();
