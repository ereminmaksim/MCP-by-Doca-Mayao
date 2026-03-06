import { randomUUID } from 'node:crypto';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';

import {
  MCP_BASE_URL,
  DEFAULT_BASE_URL,
  DEFAULT_PORT,
  MCP_METRICS_TOKEN,
  MCP_BODY_LIMIT,
  MCP_REQUEST_TIMEOUT_MS,
  MCP_RATE_LIMIT_MAX_REQUESTS,
  SERVER_NAME,
  SERVER_VERSION,
} from './config.js';
import {
  createSessionStore,
  getClientIp,
  InMemoryAlertMonitor,
  InMemoryCircuitBreaker,
  InMemoryConcurrencyLimiter,
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
const concurrencyLimiter = new InMemoryConcurrencyLimiter();
const circuitBreaker = new InMemoryCircuitBreaker();
const alertMonitor = new InMemoryAlertMonitor();
const allowedOrigins = parseAllowedOrigins();
const sessions = createSessionStore<StreamableHTTPServerTransport>();

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const resolvePublicBaseUrl = (req: express.Request) => {
  if (MCP_BASE_URL) {
    return stripTrailingSlash(MCP_BASE_URL);
  }

  const forwardedProto = req.header('x-forwarded-proto');
  const forwardedHost = req.header('x-forwarded-host');
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = req.header('host');
  if (host) {
    return `${req.protocol}://${host}`;
  }

  return stripTrailingSlash(DEFAULT_BASE_URL);
};

app.get('/', (req, res) => {
  const baseUrl = resolvePublicBaseUrl(req);
  res.json({
    service: SERVER_NAME,
    version: SERVER_VERSION,
    status: 'ok',
    endpoints: {
      root: `${baseUrl}/`,
      health: `${baseUrl}/health`,
      mcp: `${baseUrl}/mcp`,
    },
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/metrics', (req, res) => {
  if (MCP_METRICS_TOKEN && req.header('x-metrics-token') !== MCP_METRICS_TOKEN) {
    res.status(403).json({ error: 'Forbidden: invalid metrics token' });
    return;
  }

  res.json({
    service: SERVER_NAME,
    version: SERVER_VERSION,
    alerts: alertMonitor.snapshot(),
    concurrency: concurrencyLimiter.snapshot(),
    circuitBreaker: circuitBreaker.snapshot(),
  });
});

app.all('/mcp', async (req, res) => {
  const requestStartedAt = Date.now();
  alertMonitor.recordRequest(requestStartedAt);

  const emitAlerts = (statusCode: number) => {
    alertMonitor.recordResponse(statusCode);
    const samples = alertMonitor.evaluate();
    for (const sample of samples) {
      writeAuditLog('alert_triggered', sample);
    }
  };

  const failWith = (statusCode: number, code: number, message: string) => {
    emitAlerts(statusCode);
    res.status(statusCode).json({
      jsonrpc: '2.0',
      error: {
        code,
        message,
      },
      id: null,
    });
  };

  const isAcquired = concurrencyLimiter.tryAcquire();
  if (!isAcquired) {
    writeAuditLog('concurrency_limited', {
      path: req.path,
      method: req.method,
      inFlight: concurrencyLimiter.snapshot().inFlight,
    });
    failWith(503, -32031, 'Service Unavailable: too many in-flight requests');
    return;
  }

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    const opened = circuitBreaker.recordFailure();
    if (opened) {
      writeAuditLog('circuit_opened', {
        openUntil: circuitBreaker.getOpenUntil(),
      });
    }
    writeAuditLog('request_timeout', {
      path: req.path,
      method: req.method,
      timeoutMs: MCP_REQUEST_TIMEOUT_MS,
      durationMs: Date.now() - requestStartedAt,
    });
    if (!res.headersSent) {
      finalize();
      failWith(504, -32030, 'Gateway Timeout: MCP request exceeded timeout');
    }
  }, MCP_REQUEST_TIMEOUT_MS);

  const finalize = () => {
    clearTimeout(timeout);
    concurrencyLimiter.release();
  };

  if (circuitBreaker.isOpen()) {
    writeAuditLog('circuit_rejected', {
      path: req.path,
      method: req.method,
      openUntil: circuitBreaker.getOpenUntil(),
    });
    finalize();
    failWith(503, -32032, 'Service Unavailable: circuit breaker is open');
    return;
  }

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
    finalize();
    failWith(403, -32003, 'Forbidden: origin is not allowed');
    return;
  }

  const rateLimit = rateLimiter.consume(clientIp);
  res.setHeader('X-RateLimit-Limit', String(MCP_RATE_LIMIT_MAX_REQUESTS));
  res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
  res.setHeader('X-RateLimit-Reset', String(rateLimit.resetAt));

  if (!rateLimit.allowed) {
    writeAuditLog('rate_limited', { clientIp, origin });
    finalize();
    failWith(429, -32029, 'Too Many Requests: rate limit exceeded');
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
      finalize();
      failWith(404, -32004, 'Unknown MCP session');
      return;
    }
  }

  try {
    if (timedOut) {
      finalize();
      return;
    }

    if (!transport) {
      if (!isInitializeRequest(req.body)) {
        writeAuditLog('request_rejected', {
          reason: 'missing_initialize',
          clientIp,
          origin,
        });
        finalize();
        failWith(400, -32000, 'Bad Request: missing MCP session initialization');
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

    if (timedOut) {
      finalize();
      return;
    }

    await transport.handleRequest(req, res, req.body);
    if (!res.headersSent) {
      emitAlerts(200);
    } else {
      emitAlerts(res.statusCode || 200);
    }
    finalize();
  } catch (error) {
    writeAuditLog('internal_error', {
      clientIp,
      origin,
      sessionId: sessionIdHeader ?? transport?.sessionId ?? null,
      message: error instanceof Error ? error.message : 'Unknown internal error',
    });
    const opened = circuitBreaker.recordFailure();
    if (opened) {
      writeAuditLog('circuit_opened', {
        openUntil: circuitBreaker.getOpenUntil(),
      });
    }
    finalize();
    failWith(500, -32603, 'Internal MCP server error');
  }
});

app.listen(DEFAULT_PORT, () => {
  console.log(`MAYAO MCP server listening on port ${DEFAULT_PORT}`);
});
