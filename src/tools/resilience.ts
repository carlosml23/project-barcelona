import { z } from "zod";

// ── Configuration ────────────────────────────────────────────────────────────

export const ResilienceConfigSchema = z.object({
  maxRetries: z.number().int().min(0).default(3),
  baseDelayMs: z.number().int().min(1).default(1000),
  timeoutMs: z.number().int().min(1).default(15_000),
  circuitThreshold: z.number().int().min(1).default(5),
  circuitCooldownMs: z.number().int().min(1).default(60_000),
});

export type ResilienceConfig = z.infer<typeof ResilienceConfigSchema>;

// ── Circuit Breaker State ────────────────────────────────────────────────────

interface CircuitState {
  consecutiveFailures: number;
  openedAt: number | null; // timestamp when circuit opened
}

const circuits = new Map<string, CircuitState>();

function getCircuit(key: string): CircuitState {
  const existing = circuits.get(key);
  if (existing) return existing;
  const fresh: CircuitState = { consecutiveFailures: 0, openedAt: null };
  circuits.set(key, fresh);
  return fresh;
}

export class CircuitOpenError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly cooldownMs: number,
  ) {
    super(`Circuit open for "${toolName}" — cooling down for ${cooldownMs}ms`);
    this.name = "CircuitOpenError";
  }
}

// ── Transient Error Detection ────────────────────────────────────────────────

const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function isTransientError(err: unknown): boolean {
  if (err instanceof Error) {
    // Network errors
    if (err.name === "TypeError" && err.message.includes("fetch")) return true;
    if ("code" in err) {
      const code = (err as { code?: string }).code;
      if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND") return true;
    }
    // AbortError from timeout
    if (err.name === "AbortError") return true;
    // HTTP status codes embedded in error messages
    for (const status of TRANSIENT_STATUS_CODES) {
      if (err.message.includes(String(status))) return true;
    }
  }
  return false;
}

// ── Core: withResilience ─────────────────────────────────────────────────────

export async function withResilience<T>(
  toolName: string,
  fn: (signal: AbortSignal) => Promise<T>,
  config?: Partial<ResilienceConfig>,
): Promise<T> {
  const cfg = ResilienceConfigSchema.parse(config ?? {});
  const circuit = getCircuit(toolName);

  // Check circuit breaker
  if (circuit.openedAt !== null) {
    const elapsed = Date.now() - circuit.openedAt;
    if (elapsed < cfg.circuitCooldownMs) {
      throw new CircuitOpenError(toolName, cfg.circuitCooldownMs - elapsed);
    }
    // Cooldown passed — half-open: allow one attempt
    circuit.openedAt = null;
    circuit.consecutiveFailures = 0;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    // Create per-attempt AbortController with timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

    try {
      const result = await fn(controller.signal);
      clearTimeout(timer);

      // Success — reset circuit
      circuit.consecutiveFailures = 0;
      circuit.openedAt = null;
      return result;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;

      // Record failure for circuit breaker
      circuit.consecutiveFailures++;
      if (circuit.consecutiveFailures >= cfg.circuitThreshold) {
        circuit.openedAt = Date.now();
      }

      // Only retry on transient errors
      if (!isTransientError(err) || attempt === cfg.maxRetries) {
        break;
      }

      // Exponential backoff: baseDelay * 2^attempt
      const delay = cfg.baseDelayMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  throw lastError;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reset all circuit breakers — useful for testing. */
export function resetCircuits(): void {
  circuits.clear();
}
