/**
 * The SunoAI agent definition.
 *
 * One place that describes what the agent is, which browser tools it may use,
 * and which of those stop for human approval. Every entry point — the scripted
 * checks, the voice client, the UI — builds its session from this, so the
 * safety policy cannot drift between them.
 */

/** MCP server name, as registered by agent/bootstrap.mjs. */
export const BROWSER_MCP_NAME = 'browser';

/**
 * Browser tools the agent may never call.
 *
 * `browser_evaluate` and `browser_run_code_unsafe` execute arbitrary JavaScript
 * in the page. That is a hole straight through the approval gate: the model
 * could submit a comment with a scripted click instead of `browser_click`, and
 * the harness would see a read-shaped tool call. The gate is only meaningful if
 * every path to a write goes through a tool the gate covers, so these are
 * denied outright rather than merely gated.
 *
 * `browser_file_upload` and `browser_drop` are denied because nothing in scope
 * uploads a file, and an agent that cannot reach your filesystem is a better
 * agent to hand a browser to.
 */
export const DENIED_TOOLS = [
  'browser_evaluate',
  'browser_run_code_unsafe',
  'browser_file_upload',
  'browser_drop',
];

/**
 * Browser tools that pause for explicit human approval before they run.
 *
 * `browser_click`, `browser_type`, `browser_fill_form`, `browser_press_key`
 * and `browser_select_option` are the only tools left that can change state on
 * a page. Listing them by name rather than using the `@write` preset is
 * deliberate: the preset's meaning is decided by tool metadata we do not
 * control, and this project's whole safety claim rests on the list being
 * exactly right.
 *
 * Reads — navigate, snapshot, find, screenshot — are not gated. Being asked to
 * approve every page read would train the user to approve on reflex, which is
 * how approval gates stop working.
 */
export const APPROVAL_REQUIRED_TOOLS = [
  'browser_click',
  'browser_type',
  'browser_fill_form',
  'browser_press_key',
  'browser_select_option',
];

export const INSTRUCTIONS = `
You are SunoAI, a voice-driven assistant that operates a real web browser for the user.

LANGUAGE
The user speaks Hindi, English, or Hinglish — Hindi and English code-switched
mid-sentence ("LinkedIn kholo aur top posts padho", "usme comment kar do").
Understand all three. Reply in whichever the user used; if they mix, mix back.
Never ask the user to repeat themselves in a different language.

VOICE
Your replies are read aloud by a speech synthesiser. Keep them short and plain.
No markdown, no bullet lists, no URLs, no emoji — they sound like noise. Numbers
help the user refer back to things, so say "Pehla post", "Doosra post" and so on.

BROWSER
You control the browser only through your browser tools. Take a snapshot to see
the page before acting on it — never guess that an element is there.

BEFORE YOU CHANGE ANYTHING
Clicking, typing, and submitting pause for the user's approval. That is by
design; it is not an error and you should not try to route around it. When you
are about to write something, read the exact text back to the user first and
wait. If they say no or want changes, revise and read it back again. Never
submit anything the user has not heard.
`.trim();

/**
 * Build an inline agent spec for a TrueForge session.
 *
 * @param {object} options
 * @param {string} options.modelFqn  e.g. 'google-gemini/gemini-3-flash-preview'
 */
export function buildAgentSpec({ modelFqn }) {
  return {
    model: { name: modelFqn },
    instructions: INSTRUCTIONS,
    mcp_servers: [
      {
        name: BROWSER_MCP_NAME,
        enable_tools: ['@all'],
        disable_tools: DENIED_TOOLS,
        require_approval_for_tools: APPROVAL_REQUIRED_TOOLS,
        // Load the browser tool schemas upfront. Deferred discovery costs an
        // extra model round-trip, and on a voice interface that delay is heard.
        preload: true,
      },
    ],
    config: {
      // No sandbox: the agent's only capability is the browser, on purpose.
      sandbox: { enabled: false },
      // No subagents: one loop is easier to narrate aloud and to show in the UI.
      dynamic_sub_agents: { enabled: false },
      // Generous enough for snapshot → read → act, tight enough that a confused
      // agent stops instead of clicking around a page indefinitely.
      iteration_limit: 40,
    },
  };
}

/** The model FQN TrueForge exposes for a given Gemini model id. */
export function modelFqnFor(geminiModelId) {
  return `google-gemini/${geminiModelId.replace(/[^a-z0-9]+/g, '-')}`;
}
