import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-utils";
import { getIntegrationQueue } from "@/lib/queue/queues";

export async function GET(request: NextRequest) {
  await requireRole("owner");

  const queue = getIntegrationQueue();
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "all";
  const page = parseInt(url.searchParams.get("page") || "0");
  const pageSize = 50;

  const counts = await queue.getJobCounts();

  let jobs: unknown[] = [];
  if (state === "failed") {
    jobs = await queue.getFailed(page * pageSize, (page + 1) * pageSize - 1);
  } else if (state === "active") {
    jobs = await queue.getActive(page * pageSize, (page + 1) * pageSize - 1);
  } else if (state === "waiting") {
    jobs = await queue.getWaiting(page * pageSize, (page + 1) * pageSize - 1);
  } else if (state === "completed") {
    jobs = await queue.getCompleted(page * pageSize, (page + 1) * pageSize - 1);
  } else if (state === "delayed") {
    jobs = await queue.getDelayed(page * pageSize, (page + 1) * pageSize - 1);
  }

  const schedulers = await queue.getJobSchedulers();

  return NextResponse.json({
    counts,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jobs: jobs.map((j: any) => ({
      id: j.id,
      name: j.name,
      data: j.data,
      attemptsMade: j.attemptsMade,
      failedReason: j.failedReason,
      processedOn: j.processedOn,
      finishedOn: j.finishedOn,
      timestamp: j.timestamp,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schedulers: schedulers.map((s: any) => ({
      key: s.key,
      pattern: s.pattern,
      next: s.next,
    })),
  });
}

export async function POST(request: NextRequest) {
  await requireRole("owner");

  const queue = getIntegrationQueue();
  const body = await request.json();
  const { action, jobId } = body;

  switch (action) {
    case "retry": {
      const job = await queue.getJob(jobId);
      if (job) await job.retry();
      return NextResponse.json({ success: true });
    }
    case "remove": {
      const job = await queue.getJob(jobId);
      if (job) await job.remove();
      return NextResponse.json({ success: true });
    }
    case "pause":
      await queue.pause();
      return NextResponse.json({ success: true });
    case "resume":
      await queue.resume();
      return NextResponse.json({ success: true });
    case "clean": {
      const grace = (body.olderThanDays ?? 7) * 24 * 60 * 60 * 1000;
      await queue.clean(grace, 1000, "completed");
      return NextResponse.json({ success: true });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
