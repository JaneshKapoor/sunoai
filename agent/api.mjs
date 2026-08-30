/**
 * Thin wrapper over the TrueForge HTTP API (docs: <base>/api/v1/docs).
 *
 * Everything the repo does to TrueForge — registering the model provider and
 * the browser MCP server, upserting the agent, running turns — goes through
 * here so there is exactly one place that knows the wire format.
 */

export class TrueForgeError extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path} -> ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    this.name = 'TrueForgeError';
    this.status = status;
    this.body = body;
  }
}

export class TrueForgeClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async request(method, path, body) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Leave `parsed` as the raw text; the error path prints it either way.
    }
    if (!response.ok) throw new TrueForgeError(method, path, response.status, parsed);
    // The API wraps successful payloads in { data: ... }.
    return parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed;
  }

  get(path) {
    return this.request('GET', path);
  }
  post(path, body) {
    return this.request('POST', path, body);
  }
  put(path, body) {
    return this.request('PUT', path, body);
  }

  /** Create a session backed by an inline agent spec. Returns the session id. */
  async createSession(spec) {
    const session = await this.post('/api/v1/sessions', { agent: { spec } });
    return session.id;
  }

  /**
   * Run one turn, retrying when the model provider is transiently unavailable.
   *
   * The free Gemini tier caps requests per minute, and gemini-3-flash-preview
   * additionally returns 503 under load. Both surface as a failed turn rather
   * than a slow one, which on a voice interface means the assistant simply
   * stops talking. The error text carries a "retry in Ns" hint; we honour it.
   *
   * A retry re-runs the whole turn, so it is only safe when the turn changed
   * nothing. If any approval-gated tool appears in the transcript, we refuse to
   * retry and surface the error instead — re-running a turn that already
   * submitted something could submit it twice, and that is precisely the class
   * of accident this project exists to prevent.
   */
  async runTurnWithRetry(sessionId, input, { attempts = 3, ...options } = {}) {
    let lastTurn;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      lastTurn = await this.runTurn(sessionId, input, options);
      if (lastTurn.state?.status !== 'error') return lastTurn;

      const message = lastTurn.state.message ?? '';
      const isTransient = /\b(429|503)\b|quota|high demand|rate limit/i.test(message);
      if (!isTransient || attempt === attempts) return lastTurn;

      if (await this.turnTouchedGatedTools(sessionId, lastTurn.id)) {
        return lastTurn;
      }

      // "Please retry in 48.35s" — believe the provider over a fixed backoff.
      const hinted = message.match(/retry in ([\d.]+)s/i);
      const waitMs = hinted ? Math.ceil(Number(hinted[1]) * 1000) + 1_000 : attempt * 15_000;
      console.warn(`  model unavailable (attempt ${attempt}/${attempts}); retrying in ${Math.round(waitMs / 1000)}s`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    return lastTurn;
  }

  /** True if the turn called any tool that requires human approval. */
  async turnTouchedGatedTools(sessionId, turnId) {
    const { APPROVAL_REQUIRED_TOOLS } = await import('./definition.mjs');
    const events = await this.get(
      `/api/v1/sessions/${sessionId}/turns/${encodeURIComponent(turnId)}/events`,
    ).catch(() => []);
    return toolCallsIn(events).some((call) => APPROVAL_REQUIRED_TOOLS.includes(call.name));
  }

  /**
   * Run one turn to completion and return its terminal state.
   *
   * Uses the non-streaming form plus polling rather than SSE: the scripted
   * checks only care about the final answer, and polling keeps them readable.
   * The voice client streams properly instead — partial text is what makes
   * speech feel responsive.
   */
  async runTurn(sessionId, input, { timeoutMs = 180_000, intervalMs = 750 } = {}) {
    const started = await this.post(`/api/v1/sessions/${sessionId}/turns`, {
      input,
      stream: false,
    });
    const turnPath = `/api/v1/sessions/${sessionId}/turns/${encodeURIComponent(started.id)}`;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const turn = await this.get(turnPath);
      // Terminal states are anything that is no longer making progress.
      if (turn.state?.status && turn.state.status !== 'running') return turn;
      if (Date.now() >= deadline) {
        throw new Error(`Turn ${started.id} still ${turn.state?.status} after ${timeoutMs}ms.`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  /** Resolves once the server answers, or throws after `timeoutMs`. */
  async waitUntilReady({ timeoutMs = 60_000, intervalMs = 1_000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        await this.get('/api/v1/capabilities');
        return;
      } catch (error) {
        if (Date.now() >= deadline) {
          throw new Error(
            `TrueForge did not become ready at ${this.baseUrl} within ${timeoutMs}ms. ` +
              `Is it running? Try \`npm run harness\`. Last error: ${error.message}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
  }
}

/**
 * Pull the tool calls out of a turn's event list, in order.
 *
 * TrueForge does not emit a dedicated `tool.call` event: a tool call arrives as
 * a `model.message` carrying a `tool_calls` array in OpenAI's function-call
 * shape, and its result comes back later as a separate `tool.response`. Reading
 * the transcript correctly means knowing that, so it lives here rather than
 * being re-derived by every caller.
 *
 * @param {Array<object>} events  from GET /sessions/{id}/turns/{id}/events
 * @returns {Array<{id: string, name: string, arguments: unknown}>}
 */
export function toolCallsIn(events) {
  const calls = [];
  for (const event of events ?? []) {
    for (const call of event.tool_calls ?? []) {
      let args = call.function?.arguments;
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          // Leave the raw string; a malformed argument blob is worth seeing.
        }
      }
      calls.push({ id: call.id, name: call.function?.name, arguments: args });
    }
  }
  return calls;
}

/**
 * Count the model requests a turn spent.
 *
 * On the free Gemini tier the budget is 20 requests per day per model, so
 * "how many requests did that cost?" is a question worth being able to answer
 * without opening a dashboard. Each `model.message` event is one call to the
 * provider: the initial reasoning step, plus one more per round-trip after a
 * tool result comes back.
 *
 * @param {Array<object>} events  from GET /sessions/{id}/turns/{id}/events
 */
export function modelRequestsIn(events) {
  return (events ?? []).filter((event) => event.type === 'model.message').length;
}
