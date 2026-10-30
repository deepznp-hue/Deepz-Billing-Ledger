import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { tryParseMsSqlBakBytes, parseTextBackup } from './src/utils/bakParser.ts';

function parseWithNodeFallback(buffer: Buffer, filename: string) {
  const baseClean = filename.replace(/\.[^/.]+$/, '');
  const strippedTs = baseClean.replace(/^[\d\-_]+(?:AM|PM)?[_\-\s]*/i, '').trim();
  let fallbackCompanyName = (strippedTs || baseClean).replace(/[_-]+/g, ' ').trim().toUpperCase();
  if (['TEXTILE', 'BACKUP', 'DB'].includes(fallbackCompanyName)) {
    fallbackCompanyName = `${fallbackCompanyName} (${baseClean})`;
  }
  const fallbackCo = {
    n: fallbackCompanyName || 'UPLOADED COMPANY',
    a: '',
    ph: '',
    em: '',
    g: '',
    pan: '',
  };

  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const fromMsSql = tryParseMsSqlBakBytes(bytes, fallbackCompanyName, fallbackCo);
  if (fromMsSql) return fromMsSql;

  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const fromUtf8 = parseTextBackup(utf8Text, fallbackCompanyName, fallbackCo);
  if (fromUtf8) return fromUtf8;

  const utf16Text = new TextDecoder('utf-16le', { fatal: false }).decode(bytes);
  const fromUtf16 = parseTextBackup(utf16Text, fallbackCompanyName, fallbackCo);
  if (fromUtf16) return fromUtf16;

  return null;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Raw binary body parser for .bak file uploads (up to 250MB)
  app.post(
    '/api/parse-bak',
    express.raw({ type: '*/*', limit: '250mb' }),
    (req, res) => {
      const filename = String(req.query.filename || 'backup.bak');
      const bodyBuffer = req.body as Buffer;
      if (!bodyBuffer || !Buffer.isBuffer(bodyBuffer) || bodyBuffer.length === 0) {
        res.status(400).json({ ok: false, error: 'Empty file uploaded' });
        return;
      }

      const tmpFile = path.join(
        os.tmpdir(),
        `upload_${Date.now()}_${Math.random().toString(36).slice(2)}.bak`
      );
      const latestCopy = path.join(os.tmpdir(), 'latest_uploaded.bak');

      try {
        fs.writeFileSync(tmpFile, bodyBuffer);
        fs.writeFileSync(latestCopy, bodyBuffer);
      } catch {
        // If writing temp file fails, try in-memory Node fallback directly
        const fallbackDb = parseWithNodeFallback(bodyBuffer, filename);
        if (fallbackDb) {
          res.json({ ok: true, db: fallbackDb });
          return;
        }
        res.status(500).json({ ok: false, error: 'Failed to process uploaded file' });
        return;
      }

      const scriptPath = path.resolve(process.cwd(), 'scripts', 'parse_bak.py');
      execFile(
        'python3',
        [scriptPath, tmpFile, filename],
        { maxBuffer: 150 * 1024 * 1024 },
        (error, stdout, stderr) => {
          try {
            fs.unlinkSync(tmpFile);
          } catch {
            // ignore cleanup error
          }

          if (stderr) {
            try {
              fs.writeFileSync(path.join(os.tmpdir(), 'parse_bak_stderr.log'), stderr);
            } catch {
              // ignore
            }
          }

          if (!error && stdout) {
            try {
              const parsed = JSON.parse(stdout);
              if (parsed && parsed.ok && parsed.db) {
                res.json(parsed);
                return;
              }
            } catch {
              // fall through to Node.js parser
            }
          }

          // Fallback to pure Node.js parser if python3 is unavailable in the container
          try {
            const fallbackDb = parseWithNodeFallback(bodyBuffer, filename);
            if (fallbackDb) {
              res.json({ ok: true, db: fallbackDb });
              return;
            }
          } catch {
            // ignore
          }

          res.status(422).json({ ok: false, error: 'Could not parse backup file' });
        }
      );
    }
  );

  const distPath = path.resolve(process.cwd(), 'dist');
  const distIndexHtml = path.join(distPath, 'index.html');
  const isProduction =
    (process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start') &&
    fs.existsSync(distIndexHtml);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      if (fs.existsSync(distIndexHtml)) {
        res.sendFile(distIndexHtml);
      } else {
        res.status(404).send('Not Found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
