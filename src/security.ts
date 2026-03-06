import type { Request } from 'express';

import {
  MCP_ALERT_429_THRESHOLD,
  MCP_ALERT_5XX_THRESHOLD,
  MCP_ALERT_RPS_THRESHOLD,
  MCP_ALERT_WINDOW_MS,
  DEFAULT_BASE_URL,
  MCP_ALLOWED_ORIGINS,
  MCP_AUDIT_LOG_ENABLED,
  MCP_CIRCUIT_BREAKER_COOLDOWN_MS,
  MCP_CIRCUIT_BREAKER_ERROR_THRESHOLD,
  MCP_CIRCUIT_BREAKER_WINDOW_MS,
  MCP_MAX_IN_FLIGHT,
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
  | 'internal_error'
  | 'request_timeout'
  | 'concurrency_limited'
  | 'circuit_opened'
  | 'circuit_rejected'
  | 'alert_triggered';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type AlertKind = 'rps' | 'rate_limited' | 'server_error';

export type SessionRecord<TTransport> = {
  createdAt: number;
  lastSeenAt: number;
  transport: TTransport;
};

export type AlertSample = {
  kind: AlertKind;
  value: number;
  threshold: number;
  windowMs: number;
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

export class InMemoryConcurrencyLimiter {
  private inFlight = 0;

  private peakInFlight = 0;

  constructor(private readonly maxInFlight = MCP_MAX_IN_FLIGHT) {}

  tryAcquire() {
    if (this.inFlight >= this.maxInFlight) {
      return false;
    }

    this.inFlight += 1;
    if (this.inFlight > this.peakInFlight) {
      this.peakInFlight = this.inFlight;
    }

    return true;
  }

  release() {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  snapshot() {
    return {
      inFlight: this.inFlight,
      peakInFlight: this.peakInFlight,
      maxInFlight: this.maxInFlight,
    };
  }
}

export class InMemoryCircuitBreaker {
  private readonly failures: number[] = [];

  private openUntil = 0;

  constructor(
    private readonly windowMs = MCP_CIRCUIT_BREAKER_WINDOW_MS,
    private readonly failureThreshold = MCP_CIRCUIT_BREAKER_ERROR_THRESHOLD,
    private readonly cooldownMs = MCP_CIRCUIT_BREAKER_COOLDOWN_MS,
  ) {}

  private prune(now: number) {
    while (this.failures.length > 0 && now - this.failures[0]! > this.windowMs) {
      this.failures.shift();
    }
  }

  isOpen(now = Date.now()) {
    return now < this.openUntil;
  }

  getOpenUntil() {
    return this.openUntil;
  }

  recordFailure(now = Date.now()) {
    this.prune(now);
    this.failures.push(now);

    if (this.failures.length >= this.failureThreshold && !this.isOpen(now)) {
      this.openUntil = now + this.cooldownMs;
      this.failures.length = 0;
      return true;
    }

    return false;
  }

  snapshot(now = Date.now()) {
    this.prune(now);
    return {
      isOpen: this.isOpen(now),
      openUntil: this.openUntil,
      failuresInWindow: this.failures.length,
      failureThreshold: this.failureThreshold,
      windowMs: this.windowMs,
      cooldownMs: this.cooldownMs,
    };
  }
}

export class InMemoryAlertMonitor {
  private readonly requestTimestamps: number[] = [];

  private readonly rateLimitedTimestamps: number[] = [];

  private readonly serverErrorTimestamps: number[] = [];

  private readonly lastAlertAt: Partial<Record<AlertKind, number>> = {};

  constructor(
    private readonly windowMs = MCP_ALERT_WINDOW_MS,
    private readonly rpsThreshold = MCP_ALERT_RPS_THRESHOLD,
    private readonly rateLimitedThreshold = MCP_ALERT_429_THRESHOLD,
    private readonly serverErrorThreshold = MCP_ALERT_5XX_THRESHOLD,
  ) {}

  private prune(list: number[], now: number) {
    while (list.length > 0 && now - list[0]! > this.windowMs) {
      list.shift();
    }
  }

  private shouldEmit(kind: AlertKind, now: number) {
    const last = this.lastAlertAt[kind];
    if (typeof last === 'number' && now - last < this.windowMs) {
      return false;
    }

    this.lastAlertAt[kind] = now;
    return true;
  }

  recordRequest(now = Date.now()) {
    this.requestTimestamps.push(now);
    this.prune(this.requestTimestamps, now);
  }

  recordResponse(statusCode: number, now = Date.now()) {
    if (statusCode === 429) {
      this.rateLimitedTimestamps.push(now);
      this.prune(this.rateLimitedTimestamps, now);
    }

    if (statusCode >= 500) {
      this.serverErrorTimestamps.push(now);
      this.prune(this.serverErrorTimestamps, now);
    }
  }

  evaluate(now = Date.now()): AlertSample[] {
    this.prune(this.requestTimestamps, now);
    this.prune(this.rateLimitedTimestamps, now);
    this.prune(this.serverErrorTimestamps, now);

    const samples: AlertSample[] = [];
    const rps = this.requestTimestamps.length / (this.windowMs / 1000);

    if (rps >= this.rpsThreshold && this.shouldEmit('rps', now)) {
      samples.push({
        kind: 'rps',
        value: Number(rps.toFixed(2)),
        threshold: this.rpsThreshold,
        windowMs: this.windowMs,
      });
    }

    if (this.rateLimitedTimestamps.length >= this.rateLimitedThreshold && this.shouldEmit('rate_limited', now)) {
      samples.push({
        kind: 'rate_limited',
        value: this.rateLimitedTimestamps.length,
        threshold: this.rateLimitedThreshold,
        windowMs: this.windowMs,
      });
    }

    if (this.serverErrorTimestamps.length >= this.serverErrorThreshold && this.shouldEmit('server_error', now)) {
      samples.push({
        kind: 'server_error',
        value: this.serverErrorTimestamps.length,
        threshold: this.serverErrorThreshold,
        windowMs: this.windowMs,
      });
    }

    return samples;
  }

  snapshot(now = Date.now()) {
    this.prune(this.requestTimestamps, now);
    this.prune(this.rateLimitedTimestamps, now);
    this.prune(this.serverErrorTimestamps, now);

    return {
      windowMs: this.windowMs,
      requestsInWindow: this.requestTimestamps.length,
      rps: Number((this.requestTimestamps.length / (this.windowMs / 1000)).toFixed(2)),
      rateLimitedInWindow: this.rateLimitedTimestamps.length,
      serverErrorsInWindow: this.serverErrorTimestamps.length,
      thresholds: {
        rps: this.rpsThreshold,
        rateLimited: this.rateLimitedThreshold,
        serverErrors: this.serverErrorThreshold,
      },
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
