import type { IncomingMessage, ServerResponse } from 'node:http';
import { getApp } from '../server/handler.ts';

/** Vercel Node function: every /api/v1/* and /healthz request is rewritten here (see vercel.json). */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getApp();
    app(req, res);
  } catch (err) {
    console.error('[startup]', err instanceof Error ? err.message : err);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'The service is starting or misconfigured', code: 'startup' }));
  }
}
