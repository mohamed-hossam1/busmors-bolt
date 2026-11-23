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