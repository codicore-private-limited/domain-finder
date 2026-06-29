import app from "./app";
import { logger } from "./lib/logger";
import { hunter } from "./lib/hunter";
import { newsIngest } from "./lib/news/ingest";
import { expiringMonitor } from "./lib/news/expiring";
import { workerRegistry } from "./lib/workers/registry";
import { db, discoveriesTable, ensureSchema } from "@workspace/db";
import { desc } from "drizzle-orm";

// Keep the process alive when background loops (hunter / news ingest /
// workers) throw. Node 24 terminates the process on unhandled rejections by
// default, which was causing the server to die silently shortly after boot
// and surface as a persistent 502 from the edge.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandledRejection");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "uncaughtException");
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, "0.0.0.0", (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Auto-arm the hunter on boot so the live page is always producing diamonds.
  // Defer briefly so the server is fully up before history loads.
  setTimeout(() => {
    // Bring the discoveries table up to date (adds missing diamond/viewed
    // columns on legacy production DBs) before the hunter loads history.
    void ensureSchema()
      .then(() => logger.info({}, "Schema ensured"))
      .catch((err) => logger.error({ err }, "Schema ensure failed"))
      .finally(() => {
        void hunter
          .start()
          .then(() => logger.info({}, "Hunter auto-armed"))
          .catch((err) => logger.error({ err }, "Hunter auto-arm failed"));
      });
    // Kick off a one-shot RDAP re-verification of legacy diamonds in background.
    void hunter.runLegacyCleanup();

    // One-shot quality sweep: drop legacy gibberish discoveries and refresh
    // scores to the current real-word rating model.
    void hunter.purgeMeaninglessDiscoveries();

    // Start continuous news ingestion (feeds trend signals into hunter).
    try {
      newsIngest.start();
      logger.info({}, "News ingest started");
    } catch (err) {
      logger.error({ err }, "News ingest start failed");
    }

    // Expiring/drop-catch monitor is OPT-IN only (set EXPIRING_MONITOR=1).
    // The user prefers fresh-registration discovery over chasing expiring names,
    // so this stays off by default. The /api/news/expiring/* routes still work
    // for manual on-demand scans.
    if (process.env.EXPIRING_MONITOR === "1") {
      try {
        expiringMonitor.start();
        logger.info({}, "Expiring monitor started (opt-in)");
      } catch (err) {
        logger.error({ err }, "Expiring monitor start failed");
      }
    }

    // Register all 12 Codicore workers in the DB so the /workers UI lights up.
    void workerRegistry
      .initialize()
      .catch((err) => logger.error({ err }, "Worker registry init failed"));

    // Warm the DB query plan so the first user-facing discoveries request is fast.
    void db
      .select({ id: discoveriesTable.id })
      .from(discoveriesTable)
      .orderBy(desc(discoveriesTable.valueScore))
      .limit(1)
      .then(() => logger.info({}, "DB query plan warmed"))
      .catch(() => {/* ignore */});
  }, 500);
});

// Render's proxy keeps connections alive; Node's default 5s keep-alive can
// race the proxy and surface as intermittent 502/Connection-reset errors.
// Bumping these per Render's Node.js troubleshooting guidance.
server.keepAliveTimeout = 120_000;
server.headersTimeout = 120_000;
