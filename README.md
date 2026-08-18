# getplu-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes GetPlu payment
cards to AI agents and MCP-capable clients. It wraps the GetPlu REST API in typed tools for
issuing, inspecting, freezing, and reconciling cards held by either humans or agents.

> **Status: scaffold.** The tool surface, transport, and tests are real and running. The REST
> endpoints in `src/services/plu-client.ts` are the expected shapes — verify each path and payload
> against the live GetPlu API reference before pointing this at a production key.

## Requirements

- Node.js >= 22.18 (the `dev` script relies on native TypeScript type stripping)
- A GetPlu API key — use a **sandbox** key for local work

## Setup

```bash
npm install
cp .env.example .env   # then fill in PLU_API_KEY
npm test
npm run build
```

## Running

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs `src/server.ts` directly, restarting on change |
| `npm run build` | Compiles TypeScript to `dist/` |
| `npm start` | Runs the compiled server from `dist/` |
| `npm test` | Runs the Vitest suite once |
| `npm run test:watch` | Runs Vitest in watch mode |
| `npm run typecheck` | Type-checks without emitting |

The server speaks MCP over **stdio**. Stdout is the protocol stream, so all logging goes to
stderr — never `console.log` from a tool handler.

## Configuration

All configuration comes from the environment and is validated at startup (see `.env.example`).

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `PLU_API_KEY` | yes | — | Sandbox or live GetPlu key |
| `PLU_API_BASE_URL` | no | `https://api.getplu.com/v1` | Trailing slashes are stripped |
| `PLU_ENVIRONMENT` | no | `sandbox` | `sandbox` or `live` |
| `PLU_REQUEST_TIMEOUT_MS` | no | `15000` | Per-request timeout |
| `LOG_LEVEL` | no | `info` | `debug` / `info` / `warn` / `error` |

## Connecting a client

Claude Code:

```bash
claude mcp add getplu -- node /absolute/path/to/getplu-mcp/dist/server.js
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "getplu": {
      "command": "node",
      "args": ["/absolute/path/to/getplu-mcp/dist/server.js"],
      "env": { "PLU_API_KEY": "plu_sk_sandbox_..." }
    }
  }
}
```

## Tools

| Tool | Kind | Description |
| --- | --- | --- |
| `list_cards` | read-only | List cards, filtered by holder type and status |
| `get_card` | read-only | Fetch one card with its limit and holder |
| `create_card` | write | Issue a virtual or physical card to a human or agent |
| `set_card_status` | destructive | Freeze, reactivate, or cancel a card |
| `list_transactions` | read-only | List transactions, newest first |

Amounts are always in **minor units** (`50000` = `$500.00`).

## Resources

Read-only HTML views for clients that render embedded resources:

- `ui://getplu/cards`
- `ui://getplu/transactions`

`list_cards` and `list_transactions` also return their rendered table alongside the plain-text
summary, so text-only clients lose nothing.

## Layout

```
getplu-mcp
├── README.md
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts          # entry point: config, wiring, stdio transport
│   ├── tools/             # MCP tool definitions (one module per domain)
│   ├── services/          # GetPlu API client, config, logging, shared types
│   └── ui/                # HTML templates + ui:// resource registration
├── tests/
├── .env.example
└── .gitignore
```

`createServer(client)` in `src/server.ts` is exported so tests can drive the whole server over an
in-memory transport with a stubbed API client — see `tests/server.test.ts`.

## Adding a tool

1. Add a `registerXTools(server, client)` function in `src/tools/`.
2. Call it from `registerTools` in `src/tools/index.ts`.
3. Wrap the handler body in `guard()` from `src/tools/result.ts` so API failures come back as
   `isError` results instead of crashing the server.
4. Add a case to `tests/server.test.ts`.
