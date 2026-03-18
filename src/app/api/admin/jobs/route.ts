import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-utils";
import { getIntegrationQueue } from "@/lib/queue/queues";
import { prisma } from "@/lib/prisma";
import type { IntegrationDirection } from "@prisma/client";

const DIRECTION_INPUT = "INPUT" as unknown as IntegrationDirection;

/**
 * Resolve spaceIntegrationIds to display info (name, space, direction, link).
 * Batches a single DB query for all IDs.
 */
async function resolveIntegrations(ids: string[]): Promise<
  Record<string, { label: string; spaceName: string; spaceSlug: string; direction: string; href: string }>
> {
  if (ids.length === 0) return {};

  const integrations = await prisma.spaceIntegration.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      direction: true,
      integration: { select: { displayName: true, key: true } },
      space: { select: { name: true, slug: true } },
      stream: { select: { name: true } },
    },
  });

  const map: Record<string, { label: string; spaceName: string; spaceSlug: string; direction: string; href: string }> = {};
  for (const si of integrations) {
    const dir = si.direction === DIRECTION_INPUT ? "input" : "output";
    map[si.id] = {
      label: si.stream?.name
        ? `${si.integration.displayName} — ${si.stream.name}`
        : si.integration.displayName,
      spaceName: si.space.name,
      spaceSlug: si.space.slug,
      direction: dir,
      href: `/spaces/${si.space.slug}/${dir}/${si.id}`,
    };
  }
  return map;
}

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

  // Collect all spaceIntegrationIds from jobs and schedulers
  const siIds = new Set<string>();
  for (const j of jobs as Array<{ data?: { spaceIntegrationId?: string } }>) {
    if (j.data?.spaceIntegrationId) siIds.add(j.data.spaceIntegrationId);
  }
  for (const s of schedulers) {
    if (typeof s.key === "string") siIds.add(s.key);
  }

  const integrationMap = await resolveIntegrations([...siIds]);

  return NextResponse.json({
    counts,
    integrations: integrationMap,
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
    case "drain": {
      // Remove all waiting and delayed jobs
      await queue.drain();
      return NextResponse.json({ success: true });
    }
    case "obliterate": {
      // Nuclear option: remove everything including schedulers
      await queue.obliterate({ force: true });
      return NextResponse.json({ success: true });
    }
    case "clean-failed": {
      await queue.clean(0, 10000, "failed");
      return NextResponse.json({ success: true });
    }
    case "clean-all": {
      await queue.drain();
      await queue.clean(0, 10000, "completed");
      await queue.clean(0, 10000, "failed");
      return NextResponse.json({ success: true });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
