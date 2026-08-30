# SunoAI

A Hinglish/English **voice** agent that drives LinkedIn through a real browser —
and stops to ask you before it ever writes anything.

Say *"LinkedIn kholo aur top posts padho"* and it opens Chrome, navigates to
your feed, and reads the top posts back to you. Say *"usme comment karo"* and it
drafts a comment, **speaks the draft, and waits** — it only submits after you
clearly say yes.

Built for the TrueForge Agent Harness Hackathon.

## How it fits together

```
  🎤 mic ──► voice client (Python)          TrueForge harness (Node)
             ├─ voice-activity detection    ├─ model: Gemini 3 Flash
             ├─ speech-to-text        ──►   ├─ agent loop + tool calling
             └─ text-to-speech        ◄──   └─ approval gate on writes
  🔊 speaker                                         │
                                                     ▼
                                          browser-control MCP (Playwright)
                                                     │
                                                     ▼
                                              Chrome ──► LinkedIn
```

The important part: **TrueForge is the agent.** It owns the tool-calling loop.
The voice client is a thin client that turns speech into a message on a
TrueForge session and speaks the reply back. There is no second agent loop, and
no Playwright code outside the harness's tool calls — the browser is driven
exclusively through MCP.

## The safety gate

Every action that changes state on LinkedIn — posting a comment, liking,
connecting, following — pauses for explicit human approval before it runs.

This is not a wrapper we bolted on. TrueForge's agent manifest has a
`require_approval_for_tools` field; the harness itself emits a
`tool.approval_required` event and refuses to proceed until the client resumes
the turn with a `user.tool_approval` decision. Reads flow freely; writes stop
and wait. It behaves this way in testing too — there is no bypass flag.

## Requirements

- **Node.js 22.14+** (the harness needs it)
- **Python 3.10+** (voice client — not needed for the text-only milestones)
- A **Google AI Studio API key** — https://aistudio.google.com/apikey

## Setup

```bash
git clone https://github.com/JaneshKapoor/sunoai && cd sunoai
npm install                  # also applies the Windows boot patch (see below)
cp .env.example .env         # then fill in GEMINI_API_KEY
```

Start the harness and leave it running:

```bash
npm run harness              # http://localhost:8790
```

In a second terminal, register the model provider and check it answers:

```bash
npm run bootstrap
npm run smoke:model
```

`smoke:model` sends a code-switched Hinglish prompt and prints the reply:

```
model:   google-gemini/gemini-3-flash-preview
prompt:  Namaste! Ek line mein Hinglish mein batao: tum kya kar sakte ho?
reply:   Namaste! Main aapke sawaalon ke jawaab de sakta hoon aur daily tasks mein aapki help kar sakta hoon.

✓ Milestone 1: harness + gemini-3-flash-preview responding.
```

TrueForge's own UI is at http://localhost:8790 if you want to poke at the agent
by hand.

## Configuration

Every key lives in `.env`, which is gitignored. Nothing is hardcoded. See
[`.env.example`](.env.example) for the full list.

| Variable | What it's for |
| --- | --- |
| `GEMINI_API_KEY` | Google AI Studio key — the agent model, and later STT/TTS |
| `GEMINI_MODEL_ID` | Defaults to `gemini-3-flash-preview` |
| `TRUEFORGE_PORT` / `TRUEFORGE_BASE_URL` | Where the harness listens |
| `BROWSER_MCP_PORT` / `BROWSER_MCP_URL` | Where the Playwright MCP server listens |

## A note on Windows

TrueForge 0.1.4 does not start on Windows. It runs its database migrations
through kysely's `FileMigrationProvider`, which hands `import()` a bare
`C:\...` path; Node's ESM loader rejects that and the server dies before it
listens:

```
Failed to start server: Only URLs with a scheme in: file, data, and node are
supported by the default ESM loader. On Windows, absolute paths must be valid
file:// URLs. Received protocol 'c:'
```

[`scripts/patch-kysely-windows.mjs`](scripts/patch-kysely-windows.mjs) runs on
`postinstall` and routes that path through `pathToFileURL()`. It is a no-op on
macOS and Linux and safe to re-run.

## Project layout

```
agent/      TrueForge setup and scripted checks
  env.mjs         .env loader and config resolver
  api.mjs         TrueForge HTTP API client
  bootstrap.mjs   idempotent harness setup
  scripts/        milestone checks
scripts/    repo tooling (harness launcher, Windows patch)
voice/      Python voice client            (milestone 4)
ui/         "Jarvis" status page           (milestone 5)
docs/       demo script and notes
```

## Status

- [x] **1** — Harness running, Gemini 3 Flash responding
- [ ] **1b** — Browser-control MCP navigating and extracting text
- [ ] **2** — "Read top posts aloud", typed input
- [ ] **3** — Comment draft → approval gate → submit, typed input
- [ ] **4** — Real voice: STT in, TTS out
- [ ] **5** — Jarvis UI

## Scope

This builds exactly one path: LinkedIn feed → read posts → draft a comment →
get approval → submit. It is not a general "control any app" agent, and that is
deliberate.

## License

MIT
