import "server-only";

// In-memory job store for the product-card generation pipeline. The app runs
// as a single persistent `next start` node process (no serverless split, no
// vercel.json), so module-level state survives across requests within a
// process — good enough for a single-manager-at-a-time internal tool without
// standing up a real job queue. A process restart drops in-flight jobs; the
// client treats a missing job id as "expired" and asks the manager to retry.

type ProductCardJobStage = "brief" | "images" | "packaging";
type ProductCardJobStatus = "running" | "done" | "error";

interface ProductCardJob {
  status: ProductCardJobStatus;
  stage: ProductCardJobStage;
  totalSlides: number;
  completedSlides: number;
  error: string | null;
  exportId: string | null;
  createdAt: number;
}

const jobs = new Map<string, ProductCardJob>();

// Long enough to cover a slow generation plus a manager who tabbed away and
// came back; short enough that a long-running process doesn't accumulate
// finished jobs forever.
const JOB_TTL_MS = 30 * 60 * 1000;

function pruneExpiredJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}

function createJob(id: string) {
  pruneExpiredJobs();
  jobs.set(id, {
    status: "running",
    stage: "brief",
    totalSlides: 0,
    completedSlides: 0,
    error: null,
    exportId: null,
    createdAt: Date.now(),
  });
}

function updateJob(id: string, patch: Partial<Omit<ProductCardJob, "createdAt">>) {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch);
}

function getJob(id: string): ProductCardJob | undefined {
  return jobs.get(id);
}

export { createJob, updateJob, getJob };
export type { ProductCardJob, ProductCardJobStage, ProductCardJobStatus };
