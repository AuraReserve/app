import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const spaceFilterMock = vi.fn();

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => {
  const ReactLib = require("react") as typeof import("react");

  const SelectTrigger = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  const SelectValue = ({ placeholder }: { placeholder?: string }) => <>{placeholder ?? ""}</>;
  const SelectContent = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  const SelectItem = ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  );

  const isSelectTrigger = (
    element: React.ReactNode,
  ): element is React.ReactElement<{ children?: React.ReactNode }> =>
    ReactLib.isValidElement(element) && element.type === SelectTrigger;

  const isSelectContent = (
    element: React.ReactNode,
  ): element is React.ReactElement<{ children?: React.ReactNode }> =>
    ReactLib.isValidElement(element) && element.type === SelectContent;

  const isSelectValue = (
    element: React.ReactNode,
  ): element is React.ReactElement<{ placeholder?: string }> =>
    ReactLib.isValidElement(element) && element.type === SelectValue;

  const Select = ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: React.ReactNode;
  }) => {
    let placeholder: string | undefined;
    const options: React.ReactElement[] = [];

    ReactLib.Children.forEach(children, (child: React.ReactNode) => {
      if (isSelectTrigger(child)) {
        ReactLib.Children.forEach(child.props.children, (nested: React.ReactNode) => {
          if (isSelectValue(nested)) {
            placeholder = nested.props.placeholder;
          }
        });
      }

      if (isSelectContent(child)) {
        ReactLib.Children.forEach(child.props.children, (nested: React.ReactNode) => {
          if (
            ReactLib.isValidElement(nested) &&
            (nested.type === "option" || nested.type === SelectItem)
          ) {
            const optionElement = nested as React.ReactElement<{ value: string }>;
            options.push(ReactLib.cloneElement(optionElement, { key: optionElement.props.value }));
          }
        });
      }
    });

    return (
      <select
        aria-label={placeholder ?? "select"}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options}
      </select>
    );
  };

  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

vi.mock("@/lib/entities", () => ({
  Space: { filter: spaceFilterMock },
}));

const MembersPage = (await import("@/app/spaces/[slug]/members/page-client")).default;

const createSpace = () => ({
  id: "space-1",
  name: "Alpha Space",
  slug: "alpha-space",
  description: "Membership",
  api_identifier: "alpha-space",
  api_identifier_source: "slug" as const,
  asset_type: "gold",
  unit: "BTC",
  is_active: true,
  created_by: "user-1",
  ripcord_enabled: false,
  api_public: false,
  created_date: "2024-04-01T00:00:00.000Z",
});

const createUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "user-1",
  email: "owner@example.com",
  full_name: "Owner Example",
  role: "owner",
  auth_provider: "credentials",
  is_active: true,
  created_date: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

const clone = <T,>(value: T): T => structuredClone(value);

describe("Space membership management", () => {
  beforeEach(() => {
    spaceFilterMock.mockReset();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists only unassigned users and posts selection when adding a member with auditor role", async () => {
    spaceFilterMock.mockResolvedValue([createSpace()]);

    const existingMember = {
      id: "member-1",
      userId: "user-1",
      spaceId: "space-1",
      role: "admin",
      user: {
        id: "user-1",
        email: "owner@example.com",
        fullName: "Owner Example",
        role: "owner",
      },
    };

    const allUsers = [
      createUser(),
      createUser({
        id: "user-2",
        email: "analyst@example.com",
        full_name: "Analyst Jones",
        role: "member",
      }),
    ];

    let currentMembers = [existingMember];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/csrf-token") {
        return { ok: true, json: async () => ({ csrfToken: "test-csrf-token" }) };
      }

      if (url === "/api/spaces/space-1/role") {
        return {
          ok: true,
          json: async () => ({ role: "admin" }),
        };
      }

      if (url === "/api/spaces/space-1/members" && (!init || !init.method || init.method === "GET")) {
        return {
          ok: true,
          json: async () => clone(currentMembers),
        };
      }

      if (url === "/api/spaces/space-1/members" && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}"));
        const matchedUser = allUsers.find((user) => user.email === body.email);
        currentMembers = [
          ...currentMembers,
          {
            id: `member-${matchedUser?.id ?? "unknown"}`,
            userId: matchedUser?.id ?? "unknown",
            spaceId: "space-1",
            role: body.role,
            user: {
              id: matchedUser?.id ?? "unknown",
              email: matchedUser?.email ?? "",
              fullName: matchedUser?.full_name ?? "Unknown User",
              role: matchedUser?.role ?? "member",
            },
          },
        ];
        return { ok: true, json: async () => ({}) };
      }

      throw new Error(`Unhandled fetch call: ${url} ${init?.method ?? "GET"}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      render(
        <MembersPage
          slug="alpha-space"
        />,
      );
    });

    await waitFor(() => expect(spaceFilterMock).toHaveBeenCalled());
    expect(await screen.findByText("Members (1)")).toBeVisible();

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Add Member" })[0]);

    const dialogHeading = await screen.findByRole("heading", { name: "Invite Member" });
    expect(dialogHeading).toBeVisible();

    const dialogContent = dialogHeading.parentElement?.parentElement as HTMLElement;

    // Fill in email address
    const emailInput = within(dialogContent).getByPlaceholderText("user@example.com");
    await user.type(emailInput, "analyst@example.com");

    // Select role
    const roleSelect = within(dialogContent).getByRole("combobox");
    const roleOptions = within(roleSelect).getAllByRole("option").map((option) => option.textContent);
    expect(roleOptions).toContain("Admin");
    expect(roleOptions).toContain("Auditor");
    expect(roleOptions).toContain("Member");
    await user.selectOptions(roleSelect, "auditor");

    const inviteButton = within(dialogContent).getByRole("button", { name: "Invite Member" });
    await waitFor(() => expect(inviteButton).toBeEnabled());

    await user.click(inviteButton);

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([input, init]) => typeof input === "string"
          && input === "/api/spaces/space-1/members"
          && init?.method === "POST",
      );
      expect(postCall).toBeTruthy();
      const [, init] = postCall!;
      const payload = JSON.parse(String(init?.body ?? "{}"));
      expect(payload).toEqual({ email: "analyst@example.com", role: "auditor" });
    });

    await waitFor(() => expect(screen.getByText("Members (2)")).toBeVisible());
  });

  it("patches member roles including auditor and deletes memberships after confirmation", async () => {
    spaceFilterMock.mockResolvedValue([createSpace()]);

    let currentMembers = [
      {
        id: "member-1",
        userId: "user-1",
        spaceId: "space-1",
        role: "member",
        user: {
          id: "user-1",
          email: "member@example.com",
          fullName: "Member One",
          role: "member",
        },
      },
      {
        id: "member-2",
        userId: "user-2",
        spaceId: "space-1",
        role: "auditor",
        user: {
          id: "user-2",
          email: "auditor@example.com",
          fullName: "Auditor Two",
          role: "member",
        },
      },
    ];

    const allUsers = [
      createUser(),
      createUser({
        id: "user-2",
        email: "auditor@example.com",
        full_name: "Auditor Two",
        role: "member",
      }),
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/csrf-token") {
        return { ok: true, json: async () => ({ csrfToken: "test-csrf-token" }) };
      }

      if (url === "/api/spaces/space-1/role") {
        return {
          ok: true,
          json: async () => ({ role: "admin" }),
        };
      }

      if (url === "/api/spaces/space-1/members" && (!init || !init.method || init.method === "GET")) {
        return { ok: true, json: async () => clone(currentMembers) };
      }

      if (url === "/api/entities/users") {
        return { ok: true, json: async () => clone(allUsers) };
      }

      if (url.startsWith("/api/spaces/space-1/members/") && init?.method === "PATCH") {
        const memberId = url.split("/").pop()!;
        const body = JSON.parse(String(init.body ?? "{}"));
        currentMembers = currentMembers.map((member) =>
          member.id === memberId ? { ...member, role: body.role } : member,
        );
        return { ok: true, json: async () => ({}) };
      }

      if (url.startsWith("/api/spaces/space-1/members/") && init?.method === "DELETE") {
        const memberId = url.split("/").pop()!;
        currentMembers = currentMembers.filter((member) => member.id !== memberId);
        return { ok: true, json: async () => ({}) };
      }

      throw new Error(`Unhandled fetch call: ${url} ${init?.method ?? "GET"}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    try {
      await act(async () => {
        render(
          <MembersPage
            slug="alpha-space"
          />,
        );
      });

      await waitFor(() => expect(spaceFilterMock).toHaveBeenCalled());
      expect(await screen.findByText("Members (2)")).toBeVisible();

      const memberRow = screen.getByText("Member One").closest("div")?.parentElement?.parentElement as HTMLElement;
      const roleSelect = within(memberRow).getByRole("combobox");

      // Verify auditor role is available in the dropdown
      const roleOptions = within(roleSelect).getAllByRole("option").map((option) => option.textContent);
      expect(roleOptions).toContain("Admin");
      expect(roleOptions).toContain("Auditor");
      expect(roleOptions).toContain("Member");

      const user = userEvent.setup();
      await user.selectOptions(roleSelect, "auditor");

      await waitFor(() => {
        const patchCall = fetchMock.mock.calls.find(
          ([input, init]) => typeof input === "string"
            && input === "/api/spaces/space-1/members/member-1"
            && init?.method === "PATCH",
        );
        expect(patchCall).toBeTruthy();
        const [, init] = patchCall!;
        const payload = JSON.parse(String(init?.body ?? "{}"));
        expect(payload).toEqual({ role: "auditor" });
      });

      expect(await screen.findByText("Role updated successfully")).toBeVisible();

      const deleteButton = within(memberRow).getAllByRole("button", { hidden: true }).at(-1);
      expect(deleteButton).toBeDefined();
      await user.click(deleteButton!);

      await waitFor(() => {
        const deleteCall = fetchMock.mock.calls.find(
          ([input, init]) => typeof input === "string"
            && input === "/api/spaces/space-1/members/member-1"
            && init?.method === "DELETE",
        );
        expect(deleteCall).toBeTruthy();
      });

      expect(await screen.findByText("Member removed successfully")).toBeVisible();
      await waitFor(() => expect(screen.queryByText("Member One")).not.toBeInTheDocument());
    } finally {
      confirmSpy.mockRestore();
    }
  });
});
