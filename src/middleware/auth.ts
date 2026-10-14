import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { OfficialDepartment, OfficialRole, normalizeDepartment } from "../constants/rbac";

const JWT_SECRET = process.env.JWT_SECRET || "fhtbs-erp-super-secret-jwt-key-2026";

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  role: OfficialRole;
  department: OfficialDepartment;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      userId?: string;
      username?: string;
      userRole?: OfficialRole;
      userDepartment?: OfficialDepartment;
    }
  }
}

export function signUserToken(user: AuthenticatedUser): string {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      department: user.department,
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

/**
 * P0-03 FIX: Populate session HANYA dari JWT yang terverifikasi.
 * Header x-user-username / x-user-name / x-user-role diabaikan sepenuhnya
 * untuk mencegah identity spoofing.
 */
export function populateUserSession(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Token autentikasi Bearer wajib disertakan.",
    });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      username: string;
      email: string;
      role: OfficialRole;
      department: string;
    };

    const verifiedUser: AuthenticatedUser = {
      id: decoded.sub,
      username: decoded.username,
      email: decoded.email,
      role: decoded.role,
      department: normalizeDepartment(decoded.department),
    };

    req.user = verifiedUser;
    req.userId = verifiedUser.id;
    req.username = verifiedUser.username;
    req.userRole = verifiedUser.role;
    req.userDepartment = verifiedUser.department;
    return next();
  } catch (err) {
    return res.status(401).json({
      error: "INVALID_TOKEN",
      message: "Sesi tidak valid atau telah kedaluwarsa.",
    });
  }
}
