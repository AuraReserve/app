import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@/components/common/asset-type-select", () => ({
  AssetTypeSelect: ({ value, onValueChange, placeholder }: { value: string; onValueChange: (v: string) => void; placeholder?: string }) => (
    <input
      placeholder={placeholder ?? "e.g. gold, bitcoin, USDC"}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    />
  ),
}));

const assetTypeListMock = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/entities", () => ({
  Space: { filter: spaceFilterMock, create: spaceCreateMock },
  AssetType: { list: assetTypeListMock },
}));

const CreateSpaceDialog = (await import("@/components/spaces/create-space-dialog")).default;

describe("CreateSpaceDialog multi-input and output data streams", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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

  it("can add a data input and navigate through to review", async () => {
    spaceFilterMock.mockResolvedValue([]);
    spaceCreateMock.mockResolvedValue({ id: "space_1" });

    const onOpenChange = vi.fn();
    const onSpaceCreated = vi.fn();

    render(<CreateSpaceDialog open onOpenChange={onOpenChange} onSpaceCreated={onSpaceCreated} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Space Name *"), "Multi Input Space");
    await waitFor(() => expect(spaceFilterMock).toHaveBeenCalledWith({ slug: "multi-input-space" }));

    // Step 1 → Step 2 (Data Inputs)
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // Add an input
    await user.click(screen.getByRole("button", { name: /add data input/i }));

    // The first input card should be expanded — fill in asset type
    const assetTypeInputs = screen.getAllByPlaceholderText("Select asset type...");
    await user.type(assetTypeInputs[0], "gold");

    // Stream name auto-suggested from asset type
    const streamNameInputs = screen.getAllByPlaceholderText("e.g. Gold Reserves");
    expect(streamNameInputs[0]).toHaveValue("Gold");

    // Step 2 → Step 3 (Data Outputs) — button says "Continue" when inputs exist
    await user.click(screen.getByRole("button", { name: "Continue" }));
    // Step 3 → Step 4 (Review) — skip (no outputs)
    await user.click(screen.getByRole("button", { name: /skip/i }));

    // Review step should show the input and outputs
    expect(screen.getByText("Data Stores (1)")).toBeInTheDocument();
    expect(screen.getByText("Gold")).toBeInTheDocument();
    expect(screen.getByText("Data Outputs (0)")).toBeInTheDocument();

    const createButton = await screen.findByRole("button", { name: "Create Space" });
    await waitFor(() => expect(createButton).toBeEnabled());
    await user.click(createButton);

    await waitFor(() => expect(spaceCreateMock).toHaveBeenCalled());
    expect(onSpaceCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows Skip button on step 2 when no inputs are configured", async () => {
    spaceFilterMock.mockResolvedValue([]);

    render(<CreateSpaceDialog open onOpenChange={() => {}} onSpaceCreated={() => {}} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Space Name *"), "Test Space");
    await waitFor(() => expect(spaceFilterMock).toHaveBeenCalledWith({ slug: "test-space" }));

    // Step 1 → Step 2 (Data Inputs)
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // With no inputs, button says "Skip"
    expect(screen.getByRole("button", { name: /skip/i })).toBeInTheDocument();

    // Add an input — button should change to "Continue"
    await user.click(screen.getByRole("button", { name: /add data input/i }));
    expect(screen.queryByRole("button", { name: /skip/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("validates that asset type is required for added inputs", async () => {
    spaceFilterMock.mockResolvedValue([]);

    render(<CreateSpaceDialog open onOpenChange={() => {}} onSpaceCreated={() => {}} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Space Name *"), "Test Space");
    await waitFor(() => expect(spaceFilterMock).toHaveBeenCalledWith({ slug: "test-space" }));

    // Step 1 → Step 2 (Data Inputs)
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // Add an input but don't fill in required fields
    await user.click(screen.getByRole("button", { name: /add data input/i }));

    // Try to advance — should fail because stream name (auto-suggested from asset type) is empty
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/stream name is required/i)).toBeInTheDocument();
  });

  it("can add and remove a data output on step 3", async () => {
    spaceFilterMock.mockResolvedValue([]);

    render(<CreateSpaceDialog open onOpenChange={() => {}} onSpaceCreated={() => {}} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Space Name *"), "Test Space");
    await waitFor(() => expect(spaceFilterMock).toHaveBeenCalledWith({ slug: "test-space" }));

    // Step 1 → Step 2 (Data Inputs) → Step 3 (Data Outputs)
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: /skip/i }));

    // Now on Step 3: no outputs, should show "Skip"
    expect(screen.getByRole("button", { name: /skip/i })).toBeInTheDocument();

    // Add an output
    await user.click(screen.getByRole("button", { name: /add data output/i }));

    // Should show API Output card (default) — text appears in card header and option dropdown
    expect(screen.getAllByText("API Endpoint").length).toBeGreaterThanOrEqual(1);

    // Button should now say "Continue"
    expect(screen.queryByRole("button", { name: /skip/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();

    // Remove it
    const trashButtons = screen.getAllByRole("button").filter(
      (btn) => btn.querySelector("svg") && btn.className.includes("hover:text-red-600"),
    );
    expect(trashButtons.length).toBeGreaterThanOrEqual(1);
    await user.click(trashButtons[0]);

    // Back to Skip
    expect(screen.getByRole("button", { name: /skip/i })).toBeInTheDocument();
  });

  it("shows outputs in review step", async () => {
    spaceFilterMock.mockResolvedValue([]);
    spaceCreateMock.mockResolvedValue({ id: "space_1" });

    render(<CreateSpaceDialog open onOpenChange={() => {}} onSpaceCreated={() => {}} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Space Name *"), "Test Space");
    await waitFor(() => expect(spaceFilterMock).toHaveBeenCalledWith({ slug: "test-space" }));

    // Step 1 → Step 2 → Step 3
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: /skip/i }));

    // Add an output
    await user.click(screen.getByRole("button", { name: /add data output/i }));

    // Step 3 → Step 4 (Review)
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // Review shows 0 inputs and 1 output
    expect(screen.getByText("Data Stores (0)")).toBeInTheDocument();
    expect(screen.getByText("Data Outputs (1)")).toBeInTheDocument();
    expect(screen.getAllByText("API Endpoint").length).toBeGreaterThanOrEqual(1);
  });
});
