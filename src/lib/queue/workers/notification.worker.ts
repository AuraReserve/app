import { prisma } from "@/lib/prisma";
import { enqueueDeliver } from "../jobs";
import { getChannel } from "@/lib/notifications/registry";
import type { NotifyJobData, DeliverJobData } from "../jobs";
import type { NotificationPayload } from "@/lib/notifications/registry";

export async function processNotify(data: NotifyJobData): Promise<void> {
  const si = await prisma.spaceIntegration.findUnique({
    where: { id: data.spaceIntegrationId },
    include: {
      space: { select: { id: true, name: true } },
      integration: { select: { id: true, key: true, name: true } },
    },
  });

  if (!si) return;

  const payload: NotificationPayload = {
    event: "integration.failed",
    space: { id: si.space.id, name: si.space.name },
    integration: {
      id: si.integration.id,
      key: si.integration.key,
      name: si.integration.name,
    },
    error: data.error,
    attemptsMade: data.attemptsMade,
    failedAt: data.failedAt,
  };

  // 1. Always create in-app notification
  const notification = await prisma.notification.create({
    data: {
      spaceId: si.space.id,
      type: "integration_failure",
      title: `Integration failed: ${si.integration.name}`,
      message: data.error,
      metadata: {
        spaceIntegrationId: data.spaceIntegrationId,
        integrationKey: si.integration.key,
        attemptsMade: data.attemptsMade,
        failedAt: data.failedAt,
      } as never,
    },
  });

  // 2. Fan out to configured channels
  const channels = await prisma.notificationChannel.findMany({
    where: { spaceId: si.space.id, enabled: true },
  });

  for (const ch of channels) {
    await enqueueDeliver({
      notificationId: notification.id,
      channelId: ch.id,
      channelType: ch.type,
      payload,
    });
  }
}

export async function processDeliver(data: DeliverJobData): Promise<void> {
  const channel = getChannel(data.channelType);
  if (!channel) {
    console.warn(`[Notify] Unknown channel type: ${data.channelType}`);
    return;
  }

  const dbChannel = await prisma.notificationChannel.findUnique({
    where: { id: data.channelId },
  });
  if (!dbChannel || !dbChannel.enabled) return;

  const config = (dbChannel.config as Record<string, unknown>) ?? {};
  await channel.deliver(config, data.payload);
}
