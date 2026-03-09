import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";
import { mockCurrentUserState, resetMockCurrentUser } from "./tests/utils/mockCurrentUser";

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => mockCurrentUserState,
}));

beforeEach(() => {
  resetMockCurrentUser();
});
