import { Queue, Worker } from "bullmq";
import { redis } from "./redis";

const connection = { host: new URL(process.env.REDIS_URL || "redis://localhost:63790").hostname, port: parseInt(new URL(process.env.REDIS_URL || "redis://localhost:63790").port || "6379") };

export const enrichQueue = new Queue("enrich", { connection });

const globalForWorker = globalThis as unknown as { enrichWorker?: Worker };

export async function ensureWorker() {
  if (globalForWorker.enrichWorker) return;

  await enrichQueue.obliterate({ force: true }).catch(() => {});
  console.log("[enrich-worker] Queue cleaned, starting worker");

  globalForWorker.enrichWorker = new Worker("enrich", async (job) => {
    const { runEnrichment } = await import("./enrich-worker");
    await runEnrichment(job.data.login);
  }, {
    connection,
    concurrency: 2,
  });

  globalForWorker.enrichWorker.on("failed", (job, err) => {
    console.error(`[enrich-worker] Job ${job?.id} failed:`, err.message);
  });
}

export async function getActiveJob(login: string): Promise<string | null> {
  return redis.get(`scout:job:${login}`);
}

export async function setActiveJob(login: string, jobId: string): Promise<void> {
  await redis.setex(`scout:job:${login}`, 600, jobId);
}

export async function clearActiveJob(login: string): Promise<void> {
  await redis.del(`scout:job:${login}`);
}
