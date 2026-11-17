import express from 'express';
import http from 'http';
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
  const PRIMARY_PORT = 3000;
  const ENV_PORT = Number(process.env.PORT);

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

  // Always listen on port 3000 for AI Studio preview/proxy
  const primaryServer = http.createServer(app);
  primaryServer.on('error', (err: NodeJS.ErrnoException) => {
    console.error(`Primary server error on port ${PRIMARY_PORT}:`, err.message);
  });
  primaryServer.listen(PRIMARY_PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PRIMARY_PORT}`);
  });

  // In standalone Cloud Run deployments where PORT (e.g. 8080) is not already bound by a proxy,
  // also listen on process.env.PORT so Cloud Run startup probes succeed.
  if (ENV_PORT && ENV_PORT !== PRIMARY_PORT) {
    const envServer = http.createServer(app);
    envServer.on('error', () => {
      // Ignore EADDRINUSE when AI Studio's supervisor is already listening on ENV_PORT
    });
    envServer.listen(ENV_PORT, '0.0.0.0', () => {
      console.log(`Server also listening on http://0.0.0.0:${ENV_PORT}`);
    });
  }
}

startServer();
