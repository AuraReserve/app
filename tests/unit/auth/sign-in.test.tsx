import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ priority: _priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test mock
    <img {...props} alt={props.alt || "image"} />
  ),
}));

const pushMock = vi.fn();
const refreshMock = vi.fn();
let searchParamsInstance = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => searchParamsInstance,
}));

const signInMock = vi.fn();
const socialSignInMock = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  signIn: {
    email: signInMock,
    social: socialSignInMock,
  },
}));

const SignInPage = (await import("@/app/auth/signin/page")).default;

const mockFetchResponse = {
  ok: true,
  json: async () => [],
};

describe("credentials sign-in flow", () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    signInMock.mockReset();
    socialSignInMock.mockReset();
    searchParamsInstance = new URLSearchParams();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects to the callback URL after a successful credentials sign-in", async () => {
    searchParamsInstance = new URLSearchParams([["callbackUrl", "/spaces/example"]]);
    signInMock.mockResolvedValue({});

    render(<SignInPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email address"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: /^Sign in$/i }));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "password123",
        callbackURL: "/spaces/example",
      });
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/spaces/example");
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it('shows the invalid credentials alert and stays on "/auth/signin" when authentication fails', async () => {
    searchParamsInstance = new URLSearchParams();
    signInMock.mockResolvedValue({ error: { message: "invalid credentials" } });

    render(<SignInPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email address"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: /^Sign in$/i }));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "wrong-password",
        callbackURL: "/dashboard",
      });
    });

    expect(await screen.findByText("Invalid email or password.")).toBeVisible();
    expect(pushMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
