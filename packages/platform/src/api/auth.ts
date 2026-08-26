import type { Request, Response, NextFunction } from "express";

// ============================================================================
// Authentication & Authorization
//
// verifyToken() is the single development-auth boundary currently used by
// both Express middleware (requireAuth) and UploadThing middleware.
//
// verifyCaseAccess() is the single authorization boundary for case-scope
// enforcement.
//
// Both functions currently contain a development mock. Production JWT/session
// implementation can replace verifyToken() later without changing the upload
// producer logic or any other consumer — all authentication flows through
// this single function.
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
 * Development mock: accepts "demo-token" and returns a fixed user.
 * Production: replace with JWT verification. All consumers (Express
 * middleware, UploadThing middleware) use this single function.
 */
export function verifyToken(token: string): AuthenticatedUser | null {
  if (token === "demo-token") {
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
