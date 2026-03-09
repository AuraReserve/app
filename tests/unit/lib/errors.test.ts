import { describe, it, expect } from "vitest";
import { AppError, NotFoundError, ValidationError, ConflictError, EntitlementError } from "@/lib/errors";

describe("AppError", () => {
  it("creates error with code", () => {
    const err = new AppError("not found", "NOT_FOUND");
    expect(err.message).toBe("not found");
    expect(err.code).toBe("NOT_FOUND");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });
});

describe("convenience subclasses", () => {
  it("NotFoundError has NOT_FOUND code", () => {
    expect(new NotFoundError("x").code).toBe("NOT_FOUND");
  });
  it("ValidationError has VALIDATION code", () => {
    expect(new ValidationError("x").code).toBe("VALIDATION");
  });
  it("ConflictError has CONFLICT code", () => {
    expect(new ConflictError("x").code).toBe("CONFLICT");
  });
  it("EntitlementError has ENTITLEMENT code", () => {
    expect(new EntitlementError("x").code).toBe("ENTITLEMENT");
  });
});
