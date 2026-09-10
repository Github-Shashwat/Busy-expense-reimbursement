import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth, requireApprover, signToken, type AuthUser } from '../auth.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Email and password required' });

  const user = db
    .prepare(`SELECT id, email, name, role, password_hash FROM users WHERE email = ?`)
    .get(body.data.email.toLowerCase()) as (AuthUser & { password_hash: string }) | undefined;

  if (!user || !bcrypt.compareSync(body.data.password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const authUser: AuthUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  res.json({ token: signToken(authUser), user: authUser });
});

authRouter.get('/approvers', requireAuth, (_req, res) => {
  const rows = db
    .prepare(`SELECT id, name, email FROM users WHERE role = 'approver' ORDER BY name`)
    .all();
  res.json({ approvers: rows });
});

authRouter.get('/users', requireAuth, requireApprover, (_req, res) => {
  const rows = db.prepare(`SELECT id, name, email, role FROM users ORDER BY name`).all();
  res.json({ users: rows });
});
