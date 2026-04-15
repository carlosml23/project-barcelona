import { describe, it, expect, beforeEach } from "vitest";
import { withResilience, CircuitOpenError, resetCircuits } from "../resilience.js";

beforeEach(() => {
  resetCircuits();
});

describe("withResilience", () => {
  it("returns result on success", async () => {
    const result = await withResilience("test", async () => "ok");
    expect(result).toBe("ok");
  });

  it("retries on transient error and succeeds", async () => {
    let attempt = 0;
    const result = await withResilience(
      "test",
      async () => {
        attempt++;
        if (attempt < 3) throw new Error("Exa search failed: 503 Service Unavailable");
        return "recovered";
      },
      { maxRetries: 3, baseDelayMs: 10 },
    );
    expect(result).toBe("recovered");
    expect(attempt).toBe(3);
  });

  it("does not retry on non-transient error", async () => {
    let attempt = 0;
    await expect(
      withResilience(
        "test",
        async () => {
          attempt++;
          throw new Error("Invalid API key");
        },
        { maxRetries: 3, baseDelayMs: 10 },
      ),
    ).rejects.toThrow("Invalid API key");
    expect(attempt).toBe(1);
  });

  it("opens circuit after threshold consecutive failures", async () => {
    const config = { maxRetries: 0, baseDelayMs: 10, circuitThreshold: 3, circuitCooldownMs: 60_000 };

    // Trigger 3 consecutive failures to open circuit
    for (let i = 0; i < 3; i++) {
      await expect(
        withResilience("flaky", async () => { throw new Error("503 error"); }, config),
      ).rejects.toThrow();
    }

    // Next call should fail immediately with CircuitOpenError
    await expect(
      withResilience("flaky", async () => "should not run", config),
    ).rejects.toThrow(CircuitOpenError);
  });

  it("resets circuit after cooldown", async () => {
    const config = { maxRetries: 0, baseDelayMs: 10, circuitThreshold: 2, circuitCooldownMs: 50 };

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      await expect(
        withResilience("reset-test", async () => { throw new Error("429 rate limited"); }, config),
      ).rejects.toThrow();
    }

    // Wait for cooldown
    await new Promise((r) => setTimeout(r, 60));

    // Should work now (half-open → success → closed)
    const result = await withResilience("reset-test", async () => "back", config);
    expect(result).toBe("back");
  });

  it("respects timeout via AbortSignal", async () => {
    await expect(
      withResilience(
        "slow",
        async (signal) => {
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve("done"), 5000);
            signal.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(new DOMException("Aborted", "AbortError"));
            });
          });
        },
        { timeoutMs: 50, maxRetries: 0 },
      ),
    ).rejects.toThrow();
  });

  it("resets circuit on success after failures", async () => {
    const config = { maxRetries: 0, baseDelayMs: 10, circuitThreshold: 5 };

    // 2 failures (below threshold)
    for (let i = 0; i < 2; i++) {
      await expect(
        withResilience("partial", async () => { throw new Error("500 error"); }, config),
      ).rejects.toThrow();
    }

    // Success resets the counter
    await withResilience("partial", async () => "ok", config);

    // 2 more failures should not open circuit (counter was reset)
    for (let i = 0; i < 2; i++) {
      await expect(
        withResilience("partial", async () => { throw new Error("502 error"); }, config),
      ).rejects.toThrow();
    }

    // Should still work (total 4 failures, but non-consecutive due to success)
    const result = await withResilience("partial", async () => "still ok", config);
    expect(result).toBe("still ok");
  });
});
