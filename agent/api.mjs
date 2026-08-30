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
