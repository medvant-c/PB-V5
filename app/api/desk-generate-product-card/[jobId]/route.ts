import { NextRequest } from "next/server";
import { hasDeskSession } from "@/lib/desk-auth";
import { getJob } from "@/lib/desk-services/product-card-jobs";

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) {
    return Response.json(
      { error: "Задача не найдена — возможно, сервер перезапустился. Попробуйте создать карточку заново." },
      { status: 404 },
    );
  }

  return Response.json({
    status: job.status,
    stage: job.stage,
    completedSlides: job.completedSlides,
    totalSlides: job.totalSlides,
    error: job.error,
    exportId: job.exportId,
  });
}
