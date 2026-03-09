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
const signUpMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("@/lib/auth-client", () => ({
  signUp: {
    email: signUpMock,
  },
}));

const SignUpPage = (await import("@/app/auth/signup/page")).default;

describe("self-registration settings", () => {
  beforeEach(() => {
    pushMock.mockReset();
    signUpMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls auth signup and redirects to dashboard when self-registration is allowed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { key: "signup_enabled", value: "true" },
        { key: "allow_self_registration", value: "true" },
        { key: "require_email_verification", value: "false" },
      ],
    });
    signUpMock.mockResolvedValue({});

    vi.stubGlobal("fetch", fetchMock);

    render(<SignUpPage />);

    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Create an Account" });

    await user.type(screen.getByLabelText(/Full Name/i), "Prospective User");
    await user.type(screen.getByLabelText(/Email/i), "new@user.com");
    await user.type(screen.getByLabelText(/^Password/i), "securePass123!");
    await user.type(screen.getByLabelText(/Confirm Password/i), "securePass123!");

    await user.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() =>
      expect(signUpMock).toHaveBeenCalledWith({
        email: "new@user.com",
        password: "securePass123!",
        name: "Prospective User",
      }),
    );

    expect(await screen.findByText("Account created successfully! Redirecting to dashboard...")).toBeVisible();
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"), { timeout: 3000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 12000);

  it("shows verification message after signup when email verification is required", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { key: "signup_enabled", value: "true" },
        { key: "allow_self_registration", value: "true" },
        { key: "require_email_verification", value: "true" },
      ],
    });
    signUpMock.mockResolvedValue({});

    vi.stubGlobal("fetch", fetchMock);

    render(<SignUpPage />);

    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Create an Account" });

    await user.type(screen.getByLabelText(/Full Name/i), "Verified User");
    await user.type(screen.getByLabelText(/Email/i), "verify@user.com");
    await user.type(screen.getByLabelText(/^Password/i), "securePass123!");
    await user.type(screen.getByLabelText(/Confirm Password/i), "securePass123!");

    await user.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() =>
      expect(signUpMock).toHaveBeenCalledWith({
        email: "verify@user.com",
        password: "securePass123!",
        name: "Verified User",
      }),
    );

    // Should show verification message, NOT redirect to dashboard
    expect(await screen.findByText(/verification email has been sent/i)).toBeVisible();
    expect(screen.getByText("verify@user.com")).toBeVisible();

    // Should NOT redirect to dashboard
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(pushMock).not.toHaveBeenCalled();
  }, 12000);

  it("shows the disabled state when self-registration is not allowed", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { key: "signup_enabled", value: "true" },
        { key: "allow_self_registration", value: "false" },
      ],
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<SignUpPage />);

    expect(await screen.findByText("Signup Disabled")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create Account" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
