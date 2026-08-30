/**
 * Milestone 1b check: can the agent drive the browser MCP?
 *
 * Asks the agent to navigate to a page and report what it says. Nothing is
 * clicked or typed, so nothing should hit the approval gate — a turn that
 * pauses here means the read/write split is wrong.
 *
 * Deliberately not LinkedIn: this proves harness → MCP → Chrome works, with no
 * login, no feed, and nothing that varies run to run.
 *
 *   npm run browser     # in one terminal
 *   npm run harness     # in another
 *   npm run smoke:browser
 */
import { config } from '../env.mjs';
import { TrueForgeClient, toolCallsIn } from '../api.mjs';
import { buildAgentSpec, modelFqnFor } from '../definition.mjs';

const TARGET = 'https://example.com';
const PROMPT = `Open ${TARGET} and tell me the heading and the first sentence of the page.`;

const cfg = config();
const client = new TrueForgeClient(cfg.trueforgeBaseUrl);
await client.waitUntilReady();

const sessionId = await client.createSession(
  buildAgentSpec({ modelFqn: modelFqnFor(cfg.geminiModelId), mode: 'read' }),
);

console.log(`session: ${sessionId}`);
console.log(`prompt:  ${PROMPT}\n`);

const turn = await client.runTurn(sessionId, [{ type: 'user.message', content: PROMPT }]);

if (turn.state.status !== 'done') {
  console.error(`✗ turn ended as "${turn.state.status}":`, JSON.stringify(turn.state, null, 2));
  process.exit(1);
}

// Show which browser tools actually ran — the point of this check is that the
// agent reached Chrome through MCP, not just that it produced plausible text.
const events = await client.get(
  `/api/v1/sessions/${sessionId}/turns/${encodeURIComponent(turn.id)}/events`,
);
const toolCalls = toolCallsIn(events).map((call) => call.name);

console.log(`tools called: ${toolCalls.join(', ') || '(none)'}`);
console.log(`\nreply: ${turn.state.output?.content}`);

if (toolCalls.length === 0) {
  console.error('\n✗ The agent answered without calling a browser tool — it did not use MCP.');
  process.exit(1);
}

console.log(`\n✓ Milestone 1b: agent navigated and extracted text via the browser MCP.`);
