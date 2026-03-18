import { prisma } from "@/lib/prisma";
import type { NotificationChannel } from "../registry";

export const inAppChannel: NotificationChannel = {
  type: "in-app",
  async deliver(_config, payload) {
    await prisma.notification.create({
      data: {
        spaceId: payload.space.id,
        type: payload.event,
        title: `Integration failed: ${payload.integration.name}`,
        message: payload.error,
        metadata: {
          integrationId: payload.integration.id,
          integrationKey: payload.integration.key,
          attemptsMade: payload.attemptsMade,
          failedAt: payload.failedAt,
        } as never,
      },
    });
  },
};
