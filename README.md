# MCP-by-Doca-Mayao

Read-only MCP server for MAYAO component docs and onboarding guides.

## MVP

- `list_components`
- `get_component_doc`
- `search_components`
- `recommend_component`
- `compare_components`
- `get_onboarding_guide`
- `search_docs`

## Local Run

```bash
npm install
npm run dev
```

HTTP server starts on `PORT` or `3001` by default.

Health check:

```bash
curl http://127.0.0.1:3001/health
```

For stdio clients:

```bash
npm run dev:stdio
```

## Production Deploy

Recommended setup:

1. Create a new deployment service from this repository.
2. Use the repository root as the service root directory.
3. The deployment platform should use `nixpacks.toml` and run:
   - `npm install`
   - `npm run typecheck`
   - `npm run build`
   - `npm run start`
4. Expose the generated public domain.
5. Set `MCP_BASE_URL` to the public service domain.

Environment variables:

- `PORT` provided by the platform
- `MCP_BASE_URL` set to your public service domain

Suggested value for `MCP_BASE_URL`:

```bash
https://your-service-name.up.railway.app
```

Health endpoint:

```text
GET /health
```

MCP HTTP endpoint:

```text
POST /mcp
```

`POST /mcp` is not a plain REST endpoint. The client must:

1. send `initialize`
2. send `notifications/initialized`
3. continue requests with `mcp-session-id`

For MCP requests, this server expects:

- `Content-Type: application/json`
- `Accept: application/json, text/event-stream`

Minimal manual initialize example:

```bash
curl -i \
  -X POST https://your-service-name.up.railway.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
      "method": "initialize",
      "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {
        "name": "manual-check",
        "version": "1.0.0"
      }
    }
  }'
```

Then send initialized notification with the returned `mcp-session-id`:

```bash
curl -i \
  -X POST https://your-service-name.up.railway.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: <session-id-from-initialize-response>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "notifications/initialized",
    "params": {}
  }'
```

Then call methods like `tools/list` with the same session header:

```bash
curl -i \
  -X POST https://your-service-name.up.railway.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: <session-id-from-initialize-response>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

If you call `POST /mcp` without `initialize` and without `mcp-session-id`, the
server will return:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Bad Request: missing MCP session initialization"
  },
  "id": null
}
```

Verification checklist:

```bash
curl https://your-service-name.up.railway.app/health
```

Expected response:

```json
{"ok":true}
```

After that, connect your MCP client to:

```text
https://your-service-name.up.railway.app/mcp
```

If `GET /` returns endpoint URLs with `localhost`, fix `MCP_BASE_URL` in your
deployment environment and redeploy.

## Notes

- Keep the site and this repository deployed as separate services.
- This package is intentionally read-only and uses project JSON data as its source of truth.
- For MCP clients that support stdio, use `npm run start:stdio` instead of HTTP.

## Security

This server now includes a basic hardening layer for public MCP access:

- request body size limit for JSON payloads
- in-memory rate limiting per client IP
- session TTL with cleanup for stale MCP sessions
- origin allow-list support through `MCP_ALLOWED_ORIGINS`
- security headers on HTTP responses
- structured audit log events for rejected requests, rate limits, session lifecycle and internal errors

Optional environment variables:

- `MCP_BODY_LIMIT`
- `MCP_SESSION_TTL_MS`
- `MCP_RATE_LIMIT_WINDOW_MS`
- `MCP_RATE_LIMIT_MAX_REQUESTS`
- `MCP_ALLOWED_ORIGINS`
- `MCP_AUDIT_LOG_ENABLED`

These controls reduce abuse and make incidents easier to audit, but they do not
replace infrastructure-level protection such as HTTPS, deployment isolation,
platform firewalling and secret hygiene.
