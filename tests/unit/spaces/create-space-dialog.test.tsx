import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { setMockCurrentUser } from "../../utils/mockCurrentUser";
import { getGlobalPermissions } from "@/lib/permissions";

const spaceFilterMock = vi.fn();
const spaceCreateMock = vi.fn();

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/entities", () => ({
  Space: { filter: spaceFilterMock, create: spaceCreateMock },
}));

const CreateSpaceDialog = (await import("@/components/spaces/create-space-dialog")).default;

describe("CreateSpaceDialog", () => {
  beforeEach(() => {
    spaceFilterMock.mockReset();
    spaceCreateMock.mockReset();
    setMockCurrentUser({
      user: {
        id: "user-1",
        role: "owner",
        email: "owner@example.com",
        name: "Owner Example",
        image: null,
        permissions: getGlobalPermissions("owner"),
        spaces: [],
        twoFactorEnabled: false,
      },
    });
  });

  it("sanitizes slug, navigates through wizard, and submits the payload", async () => {
    spaceFilterMock.mockResolvedValue([]);
    spaceCreateMock.mockResolvedValue({ id: "space-1" });
    const onOpenChange = vi.fn();
    const onSpaceCreated = vi.fn();

    render(
      <CreateSpaceDialog
        open
        onOpenChange={onOpenChange}
        onSpaceCreated={onSpaceCreated}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Space Name *"), "Alpha Space");

    expect(screen.getByLabelText("Slug *")).toHaveValue("alpha-space");

    await waitFor(() => expect(spaceFilterMock).toHaveBeenCalledWith({ slug: "alpha-space" }));

    // Step 1 → Step 2 (Data Inputs)
    await user.click(screen.getByRole("button", { name: "Continue" }));
    // Step 2 → Step 3 (Data Outputs) — skip with no inputs
    await user.click(screen.getByRole("button", { name: /skip/i }));
    // Step 3 → Step 4 (Review) — skip with no outputs
    await user.click(screen.getByRole("button", { name: /skip/i }));
    const createButton = await screen.findByRole("button", { name: "Create Space" });
    await waitFor(() => expect(createButton).toBeEnabled());
    await user.click(createButton);

    await waitFor(() => expect(spaceCreateMock).toHaveBeenCalled());

    expect(spaceCreateMock).toHaveBeenCalledWith({
      name: "Alpha Space",
      description: "",
      slug: "alpha-space",
      created_by: "user-1",
      is_active: true,
      api_identifier: "alpha-space",
      api_identifier_source: "slug",
      verification_public: true,
    });

    expect(onSpaceCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("flags duplicate slugs returned by the API lookup", async () => {
    spaceFilterMock.mockResolvedValue([{ id: "space-1" }]);

    render(
      <CreateSpaceDialog
        open
        onOpenChange={() => {}}
        onSpaceCreated={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Space Name *"), "Existing Space");
    await waitFor(() => expect(spaceFilterMock).toHaveBeenCalledWith({ slug: "existing-space" }));

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(spaceCreateMock).not.toHaveBeenCalled();
    const errorMessages = screen.getAllByText("Slug is already in use. Please choose another.");
    expect(errorMessages.length).toBeGreaterThan(0);
  });

  it("creates space immediately with Create Now on step 1", async () => {
    spaceFilterMock.mockResolvedValue([]);
    spaceCreateMock.mockResolvedValue({ id: "space-1" });

    const onOpenChange = vi.fn();
    const onSpaceCreated = vi.fn();

    render(
      <CreateSpaceDialog
        open
        onOpenChange={onOpenChange}
        onSpaceCreated={onSpaceCreated}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Space Name *"), "Quick Space");
    await waitFor(() => expect(spaceFilterMock).toHaveBeenCalledWith({ slug: "quick-space" }));

    await user.click(screen.getByRole("button", { name: "Create Now" }));

    await waitFor(() => expect(spaceCreateMock).toHaveBeenCalled());
    expect(spaceCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Quick Space",
        slug: "quick-space",
      }),
    );
    expect(onSpaceCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not create immediately when advancing from step 3 to step 4 with rapid clicks", async () => {
    spaceFilterMock.mockResolvedValue([]);
    spaceCreateMock.mockResolvedValue({ id: "space-1" });

    render(
      <CreateSpaceDialog
        open
        onOpenChange={() => {}}
        onSpaceCreated={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Space Name *"), "Alpha Space");
    await waitFor(() => expect(spaceFilterMock).toHaveBeenCalledWith({ slug: "alpha-space" }));

    // Step 1 → Step 2 (Data Inputs)
    await user.click(screen.getByRole("button", { name: "Continue" }));
    // Step 2 → Step 3 (Data Outputs) — skip (no inputs)
    await user.click(screen.getByRole("button", { name: /skip/i }));
    // Step 3 → Step 4 — double click on Skip should not trigger creation
    await user.dblClick(screen.getByRole("button", { name: /skip/i }));

    expect(spaceCreateMock).not.toHaveBeenCalled();
  });
});
