import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryRateLimitStore } from '../../src/rate-limit/memory-store.js';

describe('MemoryRateLimitStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows a burst up to the limit', async () => {
    const store = new MemoryRateLimitStore();

    for (let i = 0; i < 5; i++) {
      const result = await store.consume('acme', 1, 5, 1000);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(5);
      expect(result.remaining).toBe(5 - (i + 1));
    }
  });

  it('denies the request that exceeds the limit', async () => {
    const store = new MemoryRateLimitStore();

    for (let i = 0; i < 5; i++) {
      await store.consume('acme', 1, 5, 1000);
    }

    const result = await store.consume('acme', 1, 5, 1000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(5);
  });

  it('reports remaining tokens before the withdrawal when denied', async () => {
    const store = new MemoryRateLimitStore();
    // Drain to exactly 1 token remaining.
    for (let i = 0; i < 4; i++) {
      await store.consume('acme', 1, 5, 1000);
    }

    const result = await store.consume('acme', 2, 5, 1000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(1);
  });

  it('computes resetMs as the time the bucket will be full again when allowed', async () => {
    const store = new MemoryRateLimitStore();
    // limit=10, windowMs=1000 -> 100ms per token. Consume 4, leaving 6/10.
    const result = await store.consume('acme', 4, 10, 1000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(6);
    // 4 tokens short of full * 100ms/token = 400ms from now (t=0).
    expect(result.resetMs).toBe(400);
  });

  it('computes resetMs as the time enough tokens will be available when denied', async () => {
    const store = new MemoryRateLimitStore();
    // Drain the bucket entirely (limit=5).
    for (let i = 0; i < 5; i++) {
      await store.consume('acme', 1, 5, 1000);
    }

    // windowMs=1000, limit=5 -> 200ms per token. Need 3 tokens -> 600ms.
    const result = await store.consume('acme', 3, 5, 1000);
    expect(result.allowed).toBe(false);
    expect(result.resetMs).toBe(600);
  });

  it('refills tokens over elapsed time', async () => {
    const store = new MemoryRateLimitStore();

    // Drain the bucket (limit=5, windowMs=1000 -> 200ms/token).
    for (let i = 0; i < 5; i++) {
      await store.consume('acme', 1, 5, 1000);
    }
    let result = await store.consume('acme', 1, 5, 1000);
    expect(result.allowed).toBe(false);

    // Advance halfway through the window: 2.5 tokens should be available.
    vi.advanceTimersByTime(500);
    result = await store.consume('acme', 2, 5, 1000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);

    // Advance the rest of the window; ~2.5 more tokens accrue on top of the
    // 0.5 left over (spending tokens mid-window delays reaching full
    // capacity relative to the theoretical linear refill curve).
    vi.advanceTimersByTime(500);
    result = await store.consume('acme', 3, 5, 1000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('never refills beyond the bucket capacity', async () => {
    const store = new MemoryRateLimitStore();
    await store.consume('acme', 1, 5, 1000);

    // Advance far beyond the window; tokens should cap at `limit`.
    vi.advanceTimersByTime(1_000_000);
    const result = await store.consume('acme', 5, 5, 1000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('reset() clears a bucket back to full capacity', async () => {
    const store = new MemoryRateLimitStore();
    for (let i = 0; i < 5; i++) {
      await store.consume('acme', 1, 5, 1000);
    }
    const denied = await store.consume('acme', 1, 5, 1000);
    expect(denied.allowed).toBe(false);

    store.reset('acme');

    const result = await store.consume('acme', 1, 5, 1000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('reset() on an unknown key is a harmless no-op', () => {
    const store = new MemoryRateLimitStore();
    expect(() => store.reset('never-seen')).not.toThrow();
  });

  it('keeps independent keys from interfering with each other', async () => {
    const store = new MemoryRateLimitStore();

    for (let i = 0; i < 5; i++) {
      await store.consume('acme', 1, 5, 1000);
    }
    const acmeResult = await store.consume('acme', 1, 5, 1000);
    expect(acmeResult.allowed).toBe(false);

    const globexResult = await store.consume('globex', 1, 5, 1000);
    expect(globexResult.allowed).toBe(true);
    expect(globexResult.remaining).toBe(4);
  });

  it('allows different limits/windows to be used per call for the same key', async () => {
    const store = new MemoryRateLimitStore();
    const first = await store.consume('acme', 1, 3, 1000);
    expect(first.remaining).toBe(2);
    expect(first.limit).toBe(3);

    // A subsequent call is free to pass a different limit; the store just
    // reports it back and caps the (already-lower) token count against it.
    const second = await store.consume('acme', 1, 10, 1000);
    expect(second.limit).toBe(10);
  });
});
