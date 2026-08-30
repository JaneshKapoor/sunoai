/**
 * One-shot, idempotent setup of the TrueForge harness for SunoAI.
 *
 * Run against an already-running harness (`npm run harness`):
 *   npm run bootstrap
 *
 * It registers the Gemini model provider and the browser-control MCP server
 * from .env. Re-running is safe: the script uses PUT upserts, so it rotates
 * credentials rather than erroring on a name clash.
 */
import { config } from './env.mjs';
import { TrueForgeClient } from './api.mjs';
import { BROWSER_MCP_NAME } from './definition.mjs';

/** Shared capability metadata — every Gemini 3 flash-class model has this shape. */
const GEMINI_MODEL_PROPERTIES = {
  context_length: 1_048_576,
  max_output_tokens: 65_536,
  reasoning_efforts: ['minimal', 'low', 'medium', 'high'],
};

/**
 * Register Google Gemini as a model provider, exposing both the primary model
 * and a fallback.
 *
 * Three reasons there is a list rather than one model.
 *
 * The shipped TrueForge catalog does not list gemini-3-flash-preview at all,
 * so the primary has to be declared by hand either way.
 *
 * The preview model intermittently returns `503 This model is currently
 * experiencing high demand` — verified against the Gemini API directly, so it
 * is upstream congestion rather than anything in this stack.
 *
 * And the free tier allows only 20 requests per day *per model*
 * (GenerateRequestsPerDayPerProjectPerModel-FreeTier). One agent turn spends
 * three to five of those, so a single model is roughly five turns a day. The
 * quota is per model, so registering several multiplies the budget — a
 * workaround, not a fix. The fix is billing; see README.
 */
async function registerModelProvider(client, { geminiApiKey, geminiModelId, geminiFallbackModelIds }) {
  const modelIds = [...new Set([geminiModelId, ...geminiFallbackModelIds])];

  await client.put('/api/v1/settings/model-providers', {
    manifest: {
      type: 'google-gemini',
      auth: { api_key: geminiApiKey },
      models: modelIds.map((modelId) => ({
        model_id: modelId,
        // TrueForge model names must be lowercase, dash/dot separated.
        name: modelId.replace(/[^a-z0-9]+/g, '-'),
        properties: GEMINI_MODEL_PROPERTIES,
      })),
    },
  });

  const models = await client.get('/api/v1/models');
  const names = (models ?? []).map((m) => (typeof m === 'string' ? m : m.name));
  for (const modelId of modelIds) {
    if (!names.some((name) => name?.endsWith(modelId.replace(/[^a-z0-9]+/g, '-')))) {
      throw new Error(
        `Registered ${modelId} but it did not show up in /api/v1/models ` +
          `(got: ${names.join(', ') || 'nothing'}).`,
      );
    }
  }
  return names;
}

/**
 * Register the Playwright browser-control MCP server.
 *
 * TrueForge's connector manifest has only a "remote" variant — there is no
 * stdio transport — so the Playwright server runs as its own HTTP process
 * (`npm run browser`) and the harness dials it over localhost.
 */
async function registerBrowserMcp(client, { browserMcpUrl }) {
  await client.put('/api/v1/settings/mcp-servers', {
    manifest: {
      type: 'remote',
      name: BROWSER_MCP_NAME,
      url: browserMcpUrl,
      description:
        'Playwright browser control: navigate, read page content, click, and type. ' +
        'The only way this agent touches a browser.',
      // No auth: it is bound to localhost and never exposed.
    },
  });

  let tools;
  try {
    tools = await client.get(`/api/v1/mcp-servers/${BROWSER_MCP_NAME}/tools`);
  } catch (error) {
    throw new Error(
      `Registered the browser MCP at ${browserMcpUrl} but could not list its tools. ` +
        `Is it running? Start it with \`npm run browser\`. Cause: ${error.message}`,
    );
  }
  return (tools ?? []).map((t) => (typeof t === 'string' ? t : t.name));
}

async function main() {
  const cfg = config();
  const client = new TrueForgeClient(cfg.trueforgeBaseUrl);

  console.log(`Waiting for TrueForge at ${cfg.trueforgeBaseUrl} ...`);
  await client.waitUntilReady();

  const modelFqns = await registerModelProvider(client, cfg);
  console.log(`✓ models ready:         ${modelFqns.join(', ')}`);

  const tools = await registerBrowserMcp(client, cfg);
  console.log(`✓ browser MCP ready:    ${cfg.browserMcpUrl} (${tools.length} tools)`);
  console.log(`  tools: ${tools.join(', ')}`);

  console.log('\nBootstrap complete.');
}

await main();
