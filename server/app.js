import express from 'express';
import cors from 'cors';
import { BANKS, PRODUCTS, SEGMENTS, CORRIDORS } from './data.js';
import { computeBenchmark, parseStatement } from './benchmark.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Reference data used to populate the calculator form.
  app.get('/api/reference', (_req, res) => {
    res.json({
      banks: BANKS,
      segments: SEGMENTS,
      corridors: Object.entries(CORRIDORS).map(([id, c]) => ({ id, label: c.label })),
      products: Object.entries(PRODUCTS).map(([id, p]) => ({
        id,
        label: p.label,
        rateType: p.rateType,
        unit: p.unit,
        segment: p.segment || ['individual', 'sme', 'corporate'],
        defaultTenor: p.defaultTenor || 1,
        corridorBased: !!p.corridorBased,
        volumeBased: !!p.volumeBased,
        variants: p.variants
          ? Object.entries(p.variants).map(([vid, v]) => ({ id: vid, label: v.label }))
          : null,
      })),
    });
  });

  // Instant free benchmark for a single product.
  app.post('/api/benchmark', (req, res) => {
    const result = computeBenchmark(req.body || {});
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  });

  // Parse pasted statement / transaction text and benchmark each detected fee.
  app.post('/api/parse', (req, res) => {
    const { text } = req.body || {};
    if (typeof text !== 'string') {
      return res.status(400).json({ error: 'Body must include a "text" string' });
    }
    res.json(parseStatement(text));
  });

  // Reveal endpoint — gated in the real product behind lead capture / plan.
  // Prototype: always responds that the reveal requires a connection request.
  app.post('/api/reveal', (req, res) => {
    const { email } = req.body || {};
    const ok = typeof email === 'string' && /.+@.+\..+/.test(email);
    if (!ok) return res.status(400).json({ error: 'A valid email is required to request a reveal.' });
    // NOTE: prototype does not persist personal data or send email.
    res.json({
      status: 'received',
      message:
        'Request received. In production a specialist would contact you to reveal providers and discuss savings.',
    });
  });

  return app;
}

export default createApp;
