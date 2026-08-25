import type { Request, Response, NextFunction } from "express";

// Extend Express Request to include INDAGO User context
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: "INVESTIGATOR" | "ADMIN" | "AUDITOR";
        allowedCases: string[]; // G-A12: Case-scope boundary list
      };
    }
  }
}

// 1. Core Authentication Middleware
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.split(" ")[1];

  // Mock decoding a valid JWT. 
  if (token === "demo-token") {
    req.user = {
      id: "usr_demo_123",
      role: "INVESTIGATOR",
      // Hardcode a demo case ID so we can test the case-scope boundary
      allowedCases: ["case-042", "case-043"] 
    };
    return next();
  }

  return res.status(403).json({ error: "Invalid token" });
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

  if (!req.user?.allowedCases.includes(caseId)) {
    return res.status(403).json({ 
      error: `Security Violation: Unauthorized access to case boundary ${caseId}` 
    });
  }

  return next();
};