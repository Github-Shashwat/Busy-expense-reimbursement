import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { requireAuth, requireApprover, signToken, type AuthUser } from '../auth.js';
import { query } from '../postgres.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Email and password required' });

  try {
    const result = await query<AuthUser & { password_hash: string }>(
      `SELECT id, email, name, role, password_hash FROM users WHERE email = $1`,
      [body.data.email.toLowerCase()],
    );
    const user = result.rows[0];

    if (!user || !bcrypt.compareSync(body.data.password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const authUser: AuthUser = { id: user.id, email: user.email, name: user.name, role: user.role };
    res.json({ token: signToken(authUser), user: authUser });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/approvers', requireAuth, async (_req, res, next) => {
  try {
    const result = await query(`SELECT id, name, email FROM users WHERE role = 'approver' ORDER BY name`);
    res.json({ approvers: result.rows });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/users', requireAuth, requireApprover, async (_req, res, next) => {
  try {
    const result = await query(`SELECT id, name, email, role FROM users ORDER BY name`);
    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  }
});
