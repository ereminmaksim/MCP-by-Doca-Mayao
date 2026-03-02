import { randomUUID } from 'node:crypto';

import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { DEFAULT_BASE_URL, DEFAULT_PORT, SERVER_NAME, SERVER_VERSION } from './config.js';
import { createMayaoMcpServer } from './server.js';

const app = express();
app.use(express.json());

const transports = new Map<string, StreamableHTTPServerTransport>();

app.get('/', (_req, res) => {
  res.json({
    service: SERVER_NAME,
    version: SERVER_VERSION,
    status: 'ok',
    endpoints: {
      root: `${DEFAULT_BASE_URL}/`,
      health: `${DEFAULT_BASE_URL}/health`,
      mcp: `${DEFAULT_BASE_URL}/mcp`,
    },
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.all('/mcp', async (req, res) => {
  const sessionIdHeader = req.header('mcp-session-id');
  let transport: StreamableHTTPServerTransport | undefined;

  if (sessionIdHeader) {
    transport = transports.get(sessionIdHeader);
  }

  if (!transport) {
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: missing MCP session initialization',
        },
        id: null,
      });
      return;
    }

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports.set(sessionId, transport!);
      },
    });

    transport.onclose = () => {
      const sessionId = transport?.sessionId;
      if (sessionId) {
        transports.delete(sessionId);
      }
    };

    const server = createMayaoMcpServer();
    await server.connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
});

app.listen(DEFAULT_PORT, () => {
  console.log(`MAYAO MCP server listening on port ${DEFAULT_PORT}`);
});
