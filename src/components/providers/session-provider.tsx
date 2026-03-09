"use client";

import { ReactNode } from "react";

interface SessionProviderProps {
  children: ReactNode;
}

/**
 * Session Provider
 * Better Auth doesn't require a dedicated session context provider.
 * This component is kept for backwards compatibility and can be removed
 * if there are no other providers nested within it.
 */
export function SessionProvider({ children }: SessionProviderProps) {
  return <>{children}</>;
}
