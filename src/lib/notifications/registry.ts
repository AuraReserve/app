export interface NotificationPayload {
  event: string;
  space: { id: string; name: string };
  integration: { id: string; key: string; name: string };
  error: string;
  attemptsMade: number;
  failedAt: string;
}

export interface NotificationChannel {
  type: string;
  deliver(config: Record<string, unknown>, payload: NotificationPayload): Promise<void>;
}

const channels = new Map<string, NotificationChannel>();

export function registerChannel(channel: NotificationChannel): void {
  channels.set(channel.type, channel);
}

export function getChannel(type: string): NotificationChannel | undefined {
  return channels.get(type);
}

export function getAllChannelTypes(): string[] {
  return Array.from(channels.keys());
}
