import type { Request, Response, NextFunction } from "express";

// ============================================================================
// Authentication & Authorization
//
// verifyToken() is the single development-auth boundary used by both Express
// middleware (requireAuth) and UploadThing middleware (resolveUploadAuth).
//
// verifyCaseAccess() is the single authorization boundary for case-scope
// enforcement.
//
// AUTHENTICATION IS DEVELOPMENT-ONLY. The "demo-token" credential is a
// development mock accepted in non-production environments ONLY. In
// production verifyToken() rejects every token, including "demo-token",
// which makes all protected endpoints fail closed until a real identity
// system is introduced. Production deployments MUST NOT present the demo
// credential anywhere.
// ============================================================================

export interface AuthenticatedUser {
  id: string;
  role: "INVESTIGATOR" | "ADMIN" | "AUDITOR";
  allowedCases: string[];
}

/**
 * Single authentication boundary. Returns the authenticated principal
 * if the token is valid, or null if it is not.
 *
 * Development mock: accepts "demo-token" and returns a fixed user, but ONLY
 * when NODE_ENV is not "production". Production rejects every token (the
 * real identity system is not implemented yet), so protected endpoints fail
 * closed in production.
 */
export function verifyToken(token: string): AuthenticatedUser | null {
  if (token === "demo-token" && process.env.NODE_ENV !== "production") {
    return {
      id: "usr_demo_123",
      role: "INVESTIGATOR",
      allowedCases: ["550e8400-e29b-41d4-a716-446655440010", "550e8400-e29b-41d4-a716-446655440011"],
    };
  }
  return null;
}

/**
 * Single authorization boundary. Checks whether the authenticated
 * principal has access to the given case.
 *
 * Used by both Express requireCaseAccess middleware and UploadThing
 * onUploadComplete callback.
 */
export function verifyCaseAccess(
  user: AuthenticatedUser,
  caseId: string,
): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return user.allowedCases.includes(caseId);
}

/**
 * UploadThing authorization guard (Prompt 3 §8/§10).
 *
 * The browser upload flow cannot attach a Bearer token (AUTH_TOKEN is
 * server-only), so those requests are authenticated by UploadThing's own
 * signed-upload handshake and allowed through with no principal — case
 * authorization is enforced later at the evidence-submission API boundary,
 * the single queue producer.
 *
 * Defense in depth: if a request DOES present a Bearer token, it must pass
 * the same verifyToken() boundary as the REST API. A present-but-invalid
 * token is rejected rather than silently downgraded to the anonymous path.
 */
export type UploadAuthResult =
  | { readonly authorized: true; readonly user: AuthenticatedUser | null }
  | { readonly authorized: false; readonly reason: string };

export function resolveUploadAuth(headers: {
  readonly authorization?: string;
}): UploadAuthResult {
  const authHeader = headers.authorization;
  if (!authHeader) {
    return { authorized: true, user: null };
  }
  if (!authHeader.startsWith("Bearer ")) {
    return { authorized: false, reason: "Malformed authorization header" };
  }
  const user = verifyToken(authHeader.slice("Bearer ".length).trim());
  if (!user) {
    return { authorized: false, reason: "Invalid upload token" };
  }
  return { authorized: true, user };
}

// Extend Express Request to include INDAGO User context
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// 1. Core Authentication Middleware
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  const parts = authHeader.split(" ");
  const token = parts[1] ?? "";
  const user = verifyToken(token);

  if (!user) {
    return res.status(403).json({ error: "Invalid token" });
  }

  req.user = user;
  return next();
};

// 2. Role-Based Access Control (RBAC) Gate
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions for this action" });
    }
    return next();
  };
};

// 3. Case-Scope Enforcement Gate
export const requireCaseAccess = (req: Request, res: Response, next: NextFunction) => {
  // Extract caseId from body, query, or params
  const caseId = req.body.caseId || req.query.caseId || req.params.caseId;

  if (!caseId) {
    return res.status(400).json({ error: "caseId is required for this operation" });
  }

  if (!req.user || !verifyCaseAccess(req.user, caseId)) {
    return res.status(403).json({
      error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
    });
  }

  return next();
};
