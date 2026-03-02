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

## Railway Deploy

Recommended setup:

1. Create a new Railway service from this repository.
2. Use the repository root as the service root directory.
3. Railway will use `nixpacks.toml` and run:
   - `npm install`
   - `npm run typecheck`
   - `npm run build`
   - `npm run start`
4. Expose the generated public domain.
5. Set `MCP_BASE_URL` to the public Railway domain after the first deploy.

Environment variables:

- `PORT` provided by Railway
- `MCP_BASE_URL` set to your public Railway domain

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

## Notes

- Keep the site on Netlify and deploy this repository separately on Railway.
- This package is intentionally read-only and uses project JSON data as its source of truth.
- For MCP clients that support stdio, use `npm run start:stdio` instead of HTTP.
