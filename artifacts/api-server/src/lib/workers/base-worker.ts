import { EventEmitter } from "node:events";
import {
  db,
  workersTable,
  workerRunsTable,
  opportunitiesTable,
  type WorkerRow,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

export interface WorkerDefinition {
  id: string;
  displayName: string;
  category: "domains" | "crypto" | "social" | "compute" | "defi";
  riskLevel: "low" | "medium" | "high" | "very_high";
  legalStatus: "clean" | "tos_grey" | "tos_violation";
  description: string;
  /** Default poll interval if the worker uses a timer loop. */
  intervalMs: number;
  /** True once the actual logic is wired (vs pure skeleton). */
  implemented: boolean;
}

export interface DiscoveredOpportunity {
  externalKey: string;
  kind: string;
  score: number;
  confidence: number;
  payload: Record<string, unknown>;
  rationale?: string;
  expiresAt?: Date;
}

export interface RunResult {
  opportunitiesFound: number;
  stats: Record<string, unknown>;
}

/**
 * Base class every Codicore worker inherits from. Provides:
 * - DB-backed run lifecycle (worker_runs ledger).
 * - Opportunity persistence with worker-scoped dedupe.
 * - Standard start/stop with interval scheduling.
 * - Event emitter for live telemetry.
 *
 * Subclasses implement `runOnce()` only.
 */
export abstract class BaseWorker extends EventEmitter {
  readonly def: WorkerDefinition;
  protected running = false;
  protected timer: NodeJS.Timeout | null = null;
  protected currentRunId: number | null = null;

  constructor(def: WorkerDefinition) {
    super();
    this.def = def;
  }

  /** Ensure a row exists in `workers` table for this worker. */
  async register(): Promise<void> {
    await db
      .insert(workersTable)
      .values({
        id: this.def.id,
        displayName: this.def.displayName,
        category: this.def.category,
        riskLevel: this.def.riskLevel,
        legalStatus: this.def.legalStatus,
        description: this.def.description,
        implemented: this.def.implemented,
      })
      .onConflictDoUpdate({
        target: workersTable.id,
        set: {
          displayName: this.def.displayName,
          category: this.def.category,
          riskLevel: this.def.riskLevel,
          legalStatus: this.def.legalStatus,
          description: this.def.description,
          implemented: this.def.implemented,
          updatedAt: new Date(),
        },
      });
  }

  isRunning(): boolean {
    return this.running;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await db
      .update(workersTable)
      .set({ enabled: true, lastStartedAt: new Date(), updatedAt: new Date() })
      .where(eq(workersTable.id, this.def.id));
    logger.info({ worker: this.def.id }, "Worker started");
    this.emit("started");
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.def.intervalMs);
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await db
      .update(workersTable)
      .set({ enabled: false, lastStoppedAt: new Date(), updatedAt: new Date() })
      .where(eq(workersTable.id, this.def.id));
    logger.info({ worker: this.def.id }, "Worker stopped");
    this.emit("stopped");
  }

  private async tick(): Promise<void> {
    if (!this.def.implemented) {
      // Skeleton — record a skipped run so the UI shows "not implemented".
      await this.recordSkipped("worker is a skeleton — runOnce() not implemented yet");
      return;
    }
    const [run] = await db
      .insert(workerRunsTable)
      .values({ workerId: this.def.id, status: "running" })
      .returning({ id: workerRunsTable.id });
    this.currentRunId = run?.id ?? null;
    const started = Date.now();
    try {
      const result = await this.runOnce();
      await db
        .update(workerRunsTable)
        .set({
          status: "ok",
          finishedAt: new Date(),
          opportunitiesFound: result.opportunitiesFound,
          stats: { ...result.stats, durationMs: Date.now() - started },
        })
        .where(eq(workerRunsTable.id, run!.id));
      await db
        .update(workersTable)
        .set({
          totalRuns: (await this.getRunCount()) + 1,
          totalOpportunities:
            (await this.getOpportunityCount()) + result.opportunitiesFound,
          updatedAt: new Date(),
        })
        .where(eq(workersTable.id, this.def.id));
      this.emit("ran", result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ worker: this.def.id, err }, "Worker run failed");
      await db
        .update(workerRunsTable)
        .set({ status: "error", finishedAt: new Date(), error: msg })
        .where(eq(workerRunsTable.id, run!.id));
      await db
        .update(workersTable)
        .set({ lastError: msg, updatedAt: new Date() })
        .where(eq(workersTable.id, this.def.id));
      // NOTE: must NOT be the reserved "error" event — an EventEmitter with no
      // "error" listener throws when one is emitted, which would turn a routine
      // worker run failure into an uncaught exception. Use a plain event name.
      this.emit("runError", err);
    } finally {
      this.currentRunId = null;
    }
  }

  private async recordSkipped(reason: string): Promise<void> {
    await db.insert(workerRunsTable).values({
      workerId: this.def.id,
      status: "skipped",
      finishedAt: new Date(),
      stats: { reason },
    });
  }

  private async getRunCount(): Promise<number> {
    const row = await db
      .select({ n: workersTable.totalRuns })
      .from(workersTable)
      .where(eq(workersTable.id, this.def.id))
      .limit(1);
    return row[0]?.n ?? 0;
  }

  private async getOpportunityCount(): Promise<number> {
    const row = await db
      .select({ n: workersTable.totalOpportunities })
      .from(workersTable)
      .where(eq(workersTable.id, this.def.id))
      .limit(1);
    return row[0]?.n ?? 0;
  }

  protected async persistOpportunities(
    items: DiscoveredOpportunity[],
  ): Promise<number> {
    if (items.length === 0) return 0;
    const rows = items.map((o) => ({
      workerId: this.def.id,
      externalKey: o.externalKey,
      kind: o.kind,
      score: String(o.score),
      confidence: String(o.confidence),
      payload: o.payload,
      rationale: o.rationale ?? null,
      expiresAt: o.expiresAt ?? null,
    }));
    const result = await db
      .insert(opportunitiesTable)
      .values(rows)
      .onConflictDoNothing({
        target: [opportunitiesTable.workerId, opportunitiesTable.externalKey],
      })
      .returning({ id: opportunitiesTable.id });
    return result.length;
  }

  async getRow(): Promise<WorkerRow | null> {
    const rows = await db
      .select()
      .from(workersTable)
      .where(eq(workersTable.id, this.def.id))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Subclasses implement the actual hunting logic here. */
  protected abstract runOnce(): Promise<RunResult>;
}
