import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createSessionStore,
  InMemoryAlertMonitor,
  InMemoryCircuitBreaker,
  InMemoryConcurrencyLimiter,
  InMemoryRateLimiter,
  isOriginAllowed,
  parseAllowedOrigins,
} from './security.js';

describe('parseAllowedOrigins', () => {
  it('includes the default base url and custom origins', () => {
    const allowed = parseAllowedOrigins('https://example.com, https://agent.local/');

    assert.equal(allowed.has('http://localhost:3001'), true);
    assert.equal(allowed.has('https://example.com'), true);
    assert.equal(allowed.has('https://agent.local'), true);
  });
});

describe('isOriginAllowed', () => {
  it('allows requests without origin and blocks unknown origins', () => {
    const allowed = new Set(['https://allowed.example']);

    assert.equal(isOriginAllowed(undefined, allowed), true);
    assert.equal(isOriginAllowed('https://allowed.example/', allowed), true);
    assert.equal(isOriginAllowed('https://evil.example', allowed), false);
  });
});

describe('InMemoryRateLimiter', () => {
  it('blocks requests after the configured threshold until reset', () => {
    const limiter = new InMemoryRateLimiter(1_000, 2);

    assert.equal(limiter.consume('127.0.0.1', 0).allowed, true);
    assert.equal(limiter.consume('127.0.0.1', 10).allowed, true);
    assert.equal(limiter.consume('127.0.0.1', 20).allowed, false);
    assert.equal(limiter.consume('127.0.0.1', 1_100).allowed, true);
  });
});

describe('createSessionStore', () => {
  it('touches and cleans up expired sessions', () => {
    const store = createSessionStore<{ id: string }>();

    store.set('session-1', { id: 'transport-1' }, 0);
    assert.equal(store.get('session-1')?.createdAt, 0);

    store.touch('session-1', 100);
    assert.equal(store.get('session-1')?.lastSeenAt, 100);

    const expired = store.cleanup(5_000, 1_000);
    assert.deepEqual(expired, ['session-1']);
    assert.equal(store.get('session-1'), undefined);
  });
});

describe('InMemoryConcurrencyLimiter', () => {
  it('caps in-flight requests and recovers after release', () => {
    const limiter = new InMemoryConcurrencyLimiter(2);

    assert.equal(limiter.tryAcquire(), true);
    assert.equal(limiter.tryAcquire(), true);
    assert.equal(limiter.tryAcquire(), false);

    limiter.release();
    assert.equal(limiter.tryAcquire(), true);
    assert.equal(limiter.snapshot().maxInFlight, 2);
  });
});

describe('InMemoryCircuitBreaker', () => {
  it('opens when failures exceed threshold inside the window', () => {
    const breaker = new InMemoryCircuitBreaker(1_000, 2, 5_000);

    assert.equal(breaker.isOpen(0), false);
    assert.equal(breaker.recordFailure(0), false);
    assert.equal(breaker.recordFailure(100), true);
    assert.equal(breaker.isOpen(101), true);
    assert.equal(breaker.isOpen(6_000), false);
  });
});

describe('InMemoryAlertMonitor', () => {
  it('emits RPS, 429 and 5xx alerts over threshold', () => {
    const monitor = new InMemoryAlertMonitor(1_000, 2, 2, 2);

    monitor.recordRequest(0);
    monitor.recordRequest(100);
    monitor.recordRequest(200);
    monitor.recordResponse(429, 250);
    monitor.recordResponse(429, 260);
    monitor.recordResponse(500, 300);
    monitor.recordResponse(503, 350);

    const alerts = monitor.evaluate(400);
    const kinds = alerts.map((item) => item.kind).sort();

    assert.deepEqual(kinds, ['rate_limited', 'rps', 'server_error']);
  });
});
