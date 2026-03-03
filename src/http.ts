import { randomUUID } from 'node:crypto';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';

import {
  DEFAULT_BASE_URL,
  DEFAULT_PORT,
  MCP_BODY_LIMIT,
  MCP_RATE_LIMIT_MAX_REQUESTS,
  SERVER_NAME,
  SERVER_VERSION,
} from './config.js';
import {
  createSessionStore,
  getClientIp,
  InMemoryRateLimiter,
  isOriginAllowed,
  parseAllowedOrigins,
  writeAuditLog,
} from './security.js';
import { createMayaoMcpServer } from './server.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: MCP_BODY_LIMIT }));
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  next();
});

const rateLimiter = new InMemoryRateLimiter();
const allowedOrigins = parseAllowedOrigins();
const sessions = createSessionStore<StreamableHTTPServerTransport>();

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
  const clientIp = getClientIp(req);
  const origin = req.header('origin');
  const expiredSessions = sessions.cleanup();

  for (const sessionId of expiredSessions) {
    writeAuditLog('session_expired', { sessionId });
  }

  if (!isOriginAllowed(origin, allowedOrigins)) {
    writeAuditLog('request_rejected', {
      reason: 'origin_not_allowed',
      clientIp,
      origin,
    });
    res.status(403).json({
      jsonrpc: '2.0',
      error: {
        code: -32003,
        message: 'Forbidden: origin is not allowed',
      },
      id: null,
    });
    return;
  }

  const rateLimit = rateLimiter.consume(clientIp);
  res.setHeader('X-RateLimit-Limit', String(MCP_RATE_LIMIT_MAX_REQUESTS));
  res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
  res.setHeader('X-RateLimit-Reset', String(rateLimit.resetAt));

  if (!rateLimit.allowed) {
    writeAuditLog('rate_limited', { clientIp, origin });
    res.status(429).json({
      jsonrpc: '2.0',
      error: {
        code: -32029,
        message: 'Too Many Requests: rate limit exceeded',
      },
      id: null,
    });
    return;
  }

  const sessionIdHeader = req.header('mcp-session-id');
  let transport: StreamableHTTPServerTransport | undefined;

  if (sessionIdHeader) {
    transport = sessions.touch(sessionIdHeader)?.transport;
    if (!transport) {
      writeAuditLog('unknown_session', {
        clientIp,
        origin,
        sessionId: sessionIdHeader,
      });
      res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32004,
          message: 'Unknown MCP session',
        },
        id: null,
      });
      return;
    }
  }

  try {
    if (!transport) {
      if (!isInitializeRequest(req.body)) {
        writeAuditLog('request_rejected', {
          reason: 'missing_initialize',
          clientIp,
          origin,
        });
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
          sessions.set(sessionId, transport!);
          writeAuditLog('session_initialized', {
            clientIp,
            origin,
            sessionId,
          });
        },
      });

      transport.onclose = () => {
        const sessionId = transport?.sessionId;
        if (sessionId) {
          sessions.delete(sessionId);
          writeAuditLog('session_closed', { sessionId });
        }
      };

      const server = createMayaoMcpServer();
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    writeAuditLog('internal_error', {
      clientIp,
      origin,
      sessionId: sessionIdHeader ?? transport?.sessionId ?? null,
      message: error instanceof Error ? error.message : 'Unknown internal error',
    });
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal MCP server error',
      },
      id: null,
    });
  }
});

app.listen(DEFAULT_PORT, () => {
  console.log(`MAYAO MCP server listening on port ${DEFAULT_PORT}`);
});
