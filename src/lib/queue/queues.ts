import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";

let integrationQueue: Queue | null = null;

export function getIntegrationQueue(): Queue {
  if (!integrationQueue) {
    integrationQueue = new Queue("integrations", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return integrationQueue;
}
