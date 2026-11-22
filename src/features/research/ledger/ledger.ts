import type { ResearchBudget } from '../contracts'

/** Typed, non-retryable allowance failure. The system never buys credits. */
export class InsufficientAllowanceError extends Error {
  readonly code = 'insufficient_allowance'
  readonly retryable = false
  constructor(public readonly remaining: ResearchBudget) {
    super('The free-tier allowance is exhausted for this run. Scope was reduced; no credits were purchased.')
    this.name = 'InsufficientAllowanceError'
  }
}

export interface Reservation {
  reservationId: string
  callId: string
  allowance: ResearchBudget
}

export interface SettleResult {
  reservationId: string
  settled: boolean
  usage: { calls: number; pages: number; tokens: number; credits: number }
  allowance: ResearchBudget
}

/** Persistence seam. The real backend calls the reserve/settle RPCs. */
export interface LedgerBackend {
  reserve(input: { taskId: string; callId: string; provider: string; operation: string; estimate: { calls: number; pages: number; tokens: number; credits: number } }): Promise<Reservation>
  settle(input: { taskId: string; callId: string; usage: { calls: number; pages: number; tokens: number; credits: number } }): Promise<SettleResult>
  release(input: { taskId: string; callId: string }): Promise<void>
}

export interface LedgerSnapshot {
  allowance: ResearchBudget
  reserved: number
  settledCalls: number
}

/**
 * One shared free-tier ledger: reserve → execute → settle.
 * Every provider call goes through here, so no subagent owns an unaccounted budget.
 */
export class FreeTierLedger {
  private remaining: ResearchBudget
  private reservedCalls = 0
  private settledCalls = 0

  constructor(private readonly backend: LedgerBackend, initial: ResearchBudget, private readonly taskId: string) {
    this.remaining = { ...initial }
  }

  get snapshot(): LedgerSnapshot {
    return { allowance: { ...this.remaining }, reserved: this.reservedCalls, settledCalls: this.settledCalls }
  }

  get exhausted(): boolean {
    return this.remaining.calls <= 0 || this.remaining.pages <= 0 || this.remaining.credits <= 0
  }

  /** Reserve before execution. Throws a typed non-retryable error when exhausted. */
  async reserve(provider: string, operation: string, estimate: { calls: number; pages: number; tokens: number; credits: number }): Promise<Reservation> {
    if (this.remaining.calls < estimate.calls || this.remaining.pages < estimate.pages || this.remaining.credits < estimate.credits) {
      throw new InsufficientAllowanceError({ ...this.remaining })
    }
    const reservation = await this.backend.reserve({ taskId: this.taskId, callId: crypto.randomUUID(), provider, operation, estimate })
    this.remaining = {
      calls: Math.max(0, reservation.allowance.calls),
      pages: Math.max(0, reservation.allowance.pages),
      tokens: Math.max(0, reservation.allowance.tokens),
      credits: Math.max(0, reservation.allowance.credits),
      seconds: this.remaining.seconds,
    }
    this.reservedCalls += 1
    return reservation
  }

  /** Settle with the actual usage; the allowance reflects what was really spent. */
  async settle(callId: string, usage: { calls: number; pages: number; tokens: number; credits: number }): Promise<SettleResult> {
    const result = await this.backend.settle({ taskId: this.taskId, callId, usage })
    this.remaining = {
      calls: Math.max(0, result.allowance.calls),
      pages: Math.max(0, result.allowance.pages),
      tokens: Math.max(0, result.allowance.tokens),
      credits: Math.max(0, result.allowance.credits),
      seconds: this.remaining.seconds,
    }
    this.settledCalls += 1
    return result
  }

  /** A failed call must not keep its reservation. */
  async release(callId: string): Promise<void> {
    await this.backend.release({ taskId: this.taskId, callId })
    this.reservedCalls = Math.max(0, this.reservedCalls - 1)
  }

  /** Reduce scope instead of buying credits. */
  reducedBudget(fraction = 0.5): ResearchBudget {
    return {
      calls: Math.max(1, Math.floor(this.remaining.calls * fraction)),
      pages: Math.max(1, Math.floor(this.remaining.pages * fraction)),
      tokens: Math.max(500, Math.floor(this.remaining.tokens * fraction)),
      seconds: this.remaining.seconds,
      credits: Math.max(1, Math.floor(this.remaining.credits * fraction)),
    }
  }
}

/** In-memory ledger for tests and for a single in-process research run. */
export function memoryLedgerBackend(initial: ResearchBudget) {
  const allowance = { ...initial }
  const calls = new Map<string, { calls: number; pages: number; credits: number; tokens: number }>()
  let sequence = 0
  return {
    allowance,
    backend: {
      async reserve(input: { callId: string; estimate: { calls: number; pages: number; credits: number; tokens: number } }): Promise<Reservation> {
        sequence += 1
        calls.set(input.callId, { calls: input.estimate.calls, pages: input.estimate.pages, credits: input.estimate.credits, tokens: input.estimate.tokens })
        allowance.calls -= 1
        allowance.pages -= input.estimate.pages
        allowance.credits -= input.estimate.credits
        return { reservationId: `res-${sequence}`, callId: input.callId, allowance: { ...allowance } }
      },
      async settle(input: { callId: string; usage: { calls: number; pages: number; credits: number; tokens: number } }): Promise<SettleResult> {
        const reserved = calls.get(input.callId) ?? { calls: 0, pages: 0, credits: 0, tokens: 0 }
        calls.delete(input.callId)
        allowance.tokens -= input.usage.tokens
        allowance.pages = Math.max(0, allowance.pages - Math.max(0, input.usage.pages - reserved.pages))
        allowance.credits = Math.max(0, allowance.credits - Math.max(0, input.usage.credits - reserved.credits))
        return { reservationId: 'res', settled: true, usage: input.usage, allowance: { ...allowance } }
      },
      async release(input: { callId: string }): Promise<void> {
        const reserved = calls.get(input.callId)
        if (!reserved) return
        calls.delete(input.callId)
        allowance.calls += reserved.calls
        allowance.pages += reserved.pages
        allowance.credits += reserved.credits
      },
    } satisfies LedgerBackend,
  }
}