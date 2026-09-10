import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { migrate } from './db.js';
import { seedDemoData } from './seed.js';
import { authRouter } from './routes/auth.js';
import { reportsRouter } from './routes/reports.js';

migrate();

if (seedDemoData(false)) {
  console.log('Empty database — loaded demo seed data');
}

const app = express();
const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin, credentials: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api/reports', reportsRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT || 4000);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});