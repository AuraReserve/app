import React from "react";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Space, ApiCall } from "@/lib/entities/types";
import { setMockCurrentUser } from "../../utils/mockCurrentUser";

const metricCalls: Array<{ title: string; value: number | string; trend?: string; color?: string }> = [];

const spaceListMock = vi.fn();
const apiListMock = vi.fn();
const auditListMock = vi.fn();

vi.mock("@/components/dashboard/metric-card", () => ({
  default: (props: { title: string; value: number | string; trend?: string }) => {
    metricCalls.push(props);
    return (
      <div data-testid={`metric-${props.title}`}>
        <span>{props.title}</span>
        <span data-testid={`metric-${props.title}-value`}>{props.value}</span>
        {props.trend && <span data-testid={`metric-${props.title}-trend`}>{props.trend}</span>}
      </div>
    );
  },
}));

vi.mock("@/components/dashboard/space-overview", () => ({
  default: () => <div data-testid="space-overview" />,
}));

vi.mock("@/components/dashboard/recent-activity", () => ({
  default: () => <div data-testid="recent-activity" />,
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/entities", () => ({
  Space: { list: spaceListMock },
  ApiCall: { list: apiListMock },
  AuditLog: { list: auditListMock },
}));

const DashboardPage = (await import("@/app/dashboard/page")).default;

let idCounter = 0;
const nextId = () => `id-${++idCounter}`;

const createSpace = (overrides: Partial<Space>): Space => ({
  id: overrides.id ?? nextId(),
  name: overrides.name ?? "Test Space",
  description: overrides.description ?? "Description",
  slug: overrides.slug ?? "test-space",
  api_identifier: overrides.api_identifier ?? "space-identifier",
  api_identifier_source: overrides.api_identifier_source ?? "slug",
  is_active: overrides.is_active ?? true,
  created_by: overrides.created_by ?? "user-1",
  created_date: overrides.created_date ?? "2024-04-14T00:00:00.000Z",
  verification_public: overrides.verification_public ?? true,
});

const createApiCall = (overrides: Partial<ApiCall>): ApiCall => ({
  id: overrides.id ?? nextId(),
  space_id: overrides.space_id ?? "space-1",
  api_key_id: overrides.api_key_id,
  ip_address: overrides.ip_address ?? "127.0.0.1",
  user_agent: overrides.user_agent ?? "agent",
  status_code: overrides.status_code ?? 200,
  response_time_ms: overrides.response_time_ms ?? 100,
  created_date: overrides.created_date ?? "2024-04-15T12:00:00.000Z",
});

describe("Dashboard metrics", () => {
  beforeEach(() => {
    idCounter = 0;
    metricCalls.length = 0;
    spaceListMock.mockReset();
    apiListMock.mockReset();
    auditListMock.mockReset();

    // Mock fetch for /api/dashboard/stats
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ totalReserveEntries: 0 }), { status: 200 })
    );

    setMockCurrentUser({
      user: {
        id: "user",
        role: "owner",
        email: "owner@example.com",
        name: "Owner Example",
        image: null,
        spaces: [],
      },
    });
  });

  it("renders latest metrics correctly", async () => {
    const now = new Date();
    const dayString = (daysAgo: number) => {
      const date = new Date(now);
      date.setUTCDate(date.getUTCDate() - daysAgo);
      return date.toISOString().split("T")[0];
    };
    const isoDate = (daysAgo: number, time = "12:00:00.000Z") => `${dayString(daysAgo)}T${time}`;

    spaceListMock.mockResolvedValue([
      createSpace({ id: "space-1", slug: "alpha-space", is_active: true, created_date: isoDate(2) }),
      createSpace({ id: "space-2", slug: "beta-space", is_active: true, created_date: isoDate(3) }),
      createSpace({ id: "space-3", slug: "gamma-space", is_active: false, created_date: isoDate(40) }),
    ]);

    apiListMock.mockResolvedValue([
      createApiCall({ id: "call-1", created_date: isoDate(0, "08:00:00.000Z") }),
      createApiCall({ id: "call-2", created_date: isoDate(0, "07:00:00.000Z") }),
      createApiCall({ id: "call-3", created_date: isoDate(1, "09:00:00.000Z") }),
    ]);

    auditListMock.mockResolvedValue([
      { id: "log-1", action: "create", resource_type: "data_stream", created_date: isoDate(0) },
      { id: "log-2", action: "update", resource_type: "space", created_date: isoDate(1) },
    ]);

    render(<DashboardPage />);

    await waitFor(() => expect(metricCalls.length).toBeGreaterThanOrEqual(4));

    const metricsByTitle = Object.fromEntries(metricCalls.map((props) => [props.title, props]));

    expect(metricsByTitle["Active Spaces"].value).toBe(2);
    expect(metricsByTitle["Active Spaces"].trend).toBe("+2 this week");

    expect(metricsByTitle["Recent Activity"].value).toBe(2);

    expect(metricsByTitle["API Calls Today"].value).toBe(2);
    expect(metricsByTitle["API Calls Today"].trend).toBe("+100% from yesterday");
  });

  it("shows zero metrics when no data exists", async () => {
    spaceListMock.mockResolvedValue([]);
    apiListMock.mockResolvedValue([]);
    auditListMock.mockResolvedValue([]);

    render(<DashboardPage />);

    await waitFor(() => expect(metricCalls.length).toBeGreaterThanOrEqual(4));

    const metricsByTitle = Object.fromEntries(metricCalls.map((props) => [props.title, props]));

    expect(metricsByTitle["Active Spaces"].value).toBe(0);
    expect(metricsByTitle["Recent Activity"].value).toBe(0);
    expect(metricsByTitle["API Calls Today"].value).toBe(0);
  });
});
