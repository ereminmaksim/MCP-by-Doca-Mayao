import type { Request } from 'express';

import {
  DEFAULT_BASE_URL,
  MCP_ALLOWED_ORIGINS,
  MCP_AUDIT_LOG_ENABLED,
  MCP_RATE_LIMIT_MAX_REQUESTS,
  MCP_RATE_LIMIT_WINDOW_MS,
  MCP_SESSION_TTL_MS,
} from './config.js';

type AuditEvent =
  | 'request_rejected'
  | 'rate_limited'
  | 'session_initialized'
  | 'session_closed'
  | 'session_expired'
  | 'unknown_session'
  | 'internal_error';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type SessionRecord<TTransport> = {
  createdAt: number;
  lastSeenAt: number;
  transport: TTransport;
};

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const parseAllowedOrigins = (allowedOrigins = MCP_ALLOWED_ORIGINS) => {
  const configured = allowedOrigins
    .split(',')
    .map((entry) => stripTrailingSlash(entry.trim()))
    .filter(Boolean);

  return new Set([stripTrailingSlash(DEFAULT_BASE_URL), ...configured]);
};

export const isOriginAllowed = (origin: string | undefined, allowedOrigins = parseAllowedOrigins()) => {
  if (!origin) {
    return true;
  }

  return allowedOrigins.has(stripTrailingSlash(origin));
};

export const getClientIp = (request: Request) => {
  const forwardedFor = request.header('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? 'unknown';
  }

  return request.ip || request.socket.remoteAddress || 'unknown';
};

export class InMemoryRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(
    private readonly windowMs = MCP_RATE_LIMIT_WINDOW_MS,
    private readonly maxRequests = MCP_RATE_LIMIT_MAX_REQUESTS,
  ) {}

  consume(key: string, now = Date.now()) {
    const current = this.entries.get(key);

    if (!current || current.resetAt <= now) {
      const nextEntry = {
        count: 1,
        resetAt: now + this.windowMs,
      };
      this.entries.set(key, nextEntry);
      return {
        allowed: true,
        remaining: this.maxRequests - nextEntry.count,
        resetAt: nextEntry.resetAt,
      };
    }

    current.count += 1;
    this.entries.set(key, current);

    return {
      allowed: current.count <= this.maxRequests,
      remaining: Math.max(this.maxRequests - current.count, 0),
      resetAt: current.resetAt,
    };
  }
}

export const createSessionStore = <TTransport>() => {
  const sessions = new Map<string, SessionRecord<TTransport>>();

  return {
    get(sessionId: string) {
      return sessions.get(sessionId);
    },
    set(sessionId: string, transport: TTransport, now = Date.now()) {
      sessions.set(sessionId, {
        createdAt: now,
        lastSeenAt: now,
        transport,
      });
    },
    touch(sessionId: string, now = Date.now()) {
      const current = sessions.get(sessionId);
      if (!current) {
        return null;
      }

      current.lastSeenAt = now;
      sessions.set(sessionId, current);
      return current;
    },
    delete(sessionId: string) {
      sessions.delete(sessionId);
    },
    cleanup(now = Date.now(), ttlMs = MCP_SESSION_TTL_MS) {
      const expired: string[] = [];

      for (const [sessionId, session] of sessions.entries()) {
        if (now - session.lastSeenAt > ttlMs) {
          sessions.delete(sessionId);
          expired.push(sessionId);
        }
      }

      return expired;
    },
  };
};

export const writeAuditLog = (event: AuditEvent, payload: Record<string, unknown>) => {
  if (!MCP_AUDIT_LOG_ENABLED) {
    return;
  }

  console.log(
    JSON.stringify({
      scope: 'mcp-audit',
      event,
      timestamp: new Date().toISOString(),
      ...payload,
    }),
  );
};
