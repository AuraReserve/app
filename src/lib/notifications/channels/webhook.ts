import type { NotificationChannel, NotificationPayload } from "../registry";

export const webhookChannel: NotificationChannel = {
  type: "webhook",
  async deliver(config, payload) {
    const url = config.url as string;
    if (!url) throw new Error("Webhook URL not configured");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.headers as Record<string, string> | undefined),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(
        `Webhook delivery failed: ${response.status} ${response.statusText}`
      );
    }
  },
};
