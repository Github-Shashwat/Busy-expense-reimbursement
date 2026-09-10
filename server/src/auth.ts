import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from './db.js';

export type AuthUser = { id: number; email: string; name: string; role: Role };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function jwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret';
}

export function signToken(user: AuthUser) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    jwtSecret(),
    { expiresIn: '7d' },
  );
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Sign in required' });
  }
  try {
    req.user = jwt.verify(header.slice(7), jwtSecret()) as AuthUser;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireApprover(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'approver') {
    return res.status(403).json({ error: 'Approver role required' });
  }
  next();
}
