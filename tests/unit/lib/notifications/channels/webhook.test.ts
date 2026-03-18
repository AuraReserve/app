import { describe, it, expect, vi, beforeEach } from "vitest";
import { webhookChannel } from "@/lib/notifications/channels/webhook";

describe("webhookChannel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const payload = {
    event: "integration.failed",
    space: { id: "s1", name: "Test Space" },
    integration: { id: "i1", key: "webhook", name: "My Webhook" },
    error: "RPC timeout",
    attemptsMade: 3,
    failedAt: "2026-03-18T00:00:00Z",
  };

  it("POSTs payload to configured URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await webhookChannel.deliver({ url: "https://example.com/hook" }, payload);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" })
    );

    await expect(
      webhookChannel.deliver({ url: "https://example.com/hook" }, payload)
    ).rejects.toThrow("Webhook delivery failed: 500");
  });

  it("throws when URL not configured", async () => {
    await expect(webhookChannel.deliver({}, payload)).rejects.toThrow(
      "Webhook URL not configured"
    );
  });
});
