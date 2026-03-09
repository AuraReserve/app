import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import RecentActivity from "@/components/dashboard/recent-activity";

describe("RecentActivity", () => {
  it("renders audit logs in order with badges and formatted times", async () => {
    const auditLogs = [
      {
        id: "log-1",
        action: "update" as const,
        resource_type: "space" as const,
        resource_id: "space-1",
        space_id: "space-1",
        user_email: "admin@example.com",
        ip_address: "127.0.0.1",
        user_agent: "chrome",
        details: {},
        old_values: {},
        new_values: {},
        created_date: "2024-04-16T12:00:00.000Z",
      },
      {
        id: "log-2",
        action: "delete" as const,
        resource_type: "api_key" as const,
        resource_id: "key-1",
        space_id: "space-2",
        user_email: "operator@example.com",
        ip_address: "127.0.0.1",
        user_agent: "firefox",
        details: {},
        old_values: {},
        new_values: {},
        created_date: "2024-04-15T09:00:00.000Z",
      },
    ];

    const spaces = [
      { id: "space-1", name: "Gold Reserve" },
      { id: "space-2", name: "Silver Reserve" },
    ];

    render(
      <RecentActivity
        auditLogs={auditLogs}
        isLoading={false}
        spaces={spaces}
      />,
    );

    const items = await screen.findAllByTestId("recent-activity-item");
    expect(items).toHaveLength(2);

    const [first, second] = items;

    expect(within(first).getByText("update")).toBeVisible();
    expect(
      within(first).getByText(format(new Date(auditLogs[0].created_date), "MMM d, h:mm a")),
    ).toBeVisible();
    expect(within(first).getByText("Gold Reserve")).toBeVisible();

    expect(within(second).getByText("delete")).toBeVisible();
    expect(
      within(second).getByText(format(new Date(auditLogs[1].created_date), "MMM d, h:mm a")),
    ).toBeVisible();
    expect(within(second).getByText("Silver Reserve")).toBeVisible();
  });
});
