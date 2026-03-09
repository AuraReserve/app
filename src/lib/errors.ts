export type ErrorCode = "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "ENTITLEMENT";

export class AppError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT");
  }
}

export class EntitlementError extends AppError {
  constructor(message: string) {
    super(message, "ENTITLEMENT");
  }
}
