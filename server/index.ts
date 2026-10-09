// Starcall API server. In production it also serves the built client from dist/.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { HealthInfo } from '../shared/types.ts';
import { sttProviders, ttsProviders } from './ai/speech.ts';
import { attachUser } from './auth.ts';
import { catalogSize, loadCatalog } from './catalog/catalog.ts';
import { config, llmConfigured } from './config.ts';
import { db } from './db.ts';
import { accountRouter } from './routes/account.ts';
import { adminRouter } from './routes/admin.ts';
import { avatarRouter, avatarProviders } from './routes/avatar.ts';
import { billingRouter, paymentsConfigured } from './routes/billing.ts';
import { catalogRouter } from './routes/catalog.ts';
import { chatRouter } from './routes/chat.ts';
import { communityRouter } from './routes/community.ts';

export function createApp(): express.Express {
  db();
  loadCatalog();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
    res.setHeader('permissions-policy', 'camera=(self), microphone=(self), geolocation=()');
    next();
  });

  // Stripe needs the raw body, so billing is mounted before any JSON parser.
  app.use('/api', billingRouter);
  app.use('/api', attachUser);

  app.get('/api/health', (_req, res) => {
    const info: HealthInfo = {
      ok: true,
      llm: { provider: llmConfigured() ? 'anthropic' : 'offline', model: llmConfigured() ? config.anthropic.model : undefined },
      tts: ttsProviders(),
      stt: sttProviders(),
      translate: llmConfigured(),
      avatarProviders: avatarProviders(),
      payments: paymentsConfigured(),
      moderation: ['rules', ...(config.openai.apiKey && config.openai.moderation ? ['openai'] : [])],
      catalogSize: catalogSize(),
    };
    res.json(info);
  });

  app.use('/api', express.json({ limit: '256kb' }), catalogRouter);
  app.use('/api', accountRouter);
  app.use('/api', chatRouter);
  app.use('/api', communityRouter);
  app.use('/api', avatarRouter);
  app.use('/api/admin', adminRouter);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  const dist = resolve(process.cwd(), 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'server', message: 'Unexpected server error.' });
  });

  return app;
}

if (process.argv[1]?.endsWith('server/index.ts')) {
  const app = createApp();
  app.listen(config.port, () => {
    const llm = llmConfigured() ? `Claude (${config.anthropic.model})` : 'offline demo replies (set ANTHROPIC_API_KEY)';
    console.log(`Starcall API on http://localhost:${config.port}`);
    console.log(`  catalogue: ${catalogSize()} characters · AI: ${llm}`);
    console.log(`  server TTS: ${ttsProviders().join(', ') || 'none (browser voices)'} · server STT: ${sttProviders().join(', ') || 'none (browser recognition)'}`);
    if (config.production && !process.env.SESSION_SECRET) {
      console.warn('  warning: SESSION_SECRET is not set, so everyone is signed out whenever the server restarts.');
    }
  });
}
