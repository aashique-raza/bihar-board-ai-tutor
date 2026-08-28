// Runs after `vite build`. Boots the built dist/ output on a local static
// server, renders each public route in headless Chrome, and overwrites the
// output with the fully-rendered HTML so crawlers (Google, WhatsApp,
// Telegram) get real content instead of an empty <div id="root">.
//
// API calls are aborted during render (see PAGES loop) so AppInitializer's
// auth check fails fast and the page settles into its logged-out state —
// the same state a first-time visitor/crawler would see.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

// Minimal static server mimicking the Vercel SPA rewrite (unknown paths -> index.html).
// The SPA fallback is served from an in-memory snapshot (indexTemplate) taken once,
// right after `vite build` — NOT re-read from disk on each request. Each page in
// PAGES gets overwritten with its own rendered output as the loop progresses, and if
// the fallback re-read the current file, later routes would inherit whatever the
// previous route just wrote (e.g. /support would boot from Landing's rendered HTML,
// picking up its title/canonical as plain static markup Helmet doesn't know to remove).
function startStaticServer(indexTemplate) {
  const server = createServer(async (req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = path.join(distDir, urlPath);

    if (urlPath !== '/' && existsSync(filePath) && !urlPath.endsWith('/')) {
      try {
        const data = await readFile(filePath);
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
        return;
      } catch {
        // fall through to SPA fallback below
      }
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(indexTemplate);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const PAGES = [
  {
    route: '/',
    outputFile: 'index.html',
    // .landing-brand-name is the <h1> — only mounts once auth check settles
    // and GuestOnlyRoute decides the visitor is logged out.
    waitFor: (page) => page.waitForSelector('.landing-brand-name', { timeout: 15000 }),
  },
  {
    route: '/support',
    outputFile: 'support.html',
    waitFor: (page) => page.getByText('Koi problem hai').waitFor({ timeout: 15000 }),
  },
];

async function prerender() {
  const indexTemplate = await readFile(path.join(distDir, 'index.html'), 'utf-8');
  const server = await startStaticServer(indexTemplate);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ headless: true });

  try {
    for (const { route, outputFile, waitFor } of PAGES) {
      const page = await browser.newPage();

      // Abort every API call — prerendering needs no real data, and this
      // makes AppInitializer's auth check fail fast instead of waiting on
      // a real (or timed-out) backend request.
      await page.route('**/*', (playwrightRoute, request) => {
        const type = request.resourceType();
        if (type === 'xhr' || type === 'fetch') {
          playwrightRoute.abort();
        } else {
          playwrightRoute.continue();
        }
      });

      console.log(`[prerender] rendering ${route} ...`);
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
      await waitFor(page);
      // Small buffer for react-helmet-async's effect to flush the <title>/<meta> updates
      await new Promise((resolve) => setTimeout(resolve, 300));

      const html = await page.content();
      const outputPath = path.join(distDir, outputFile);
      await writeFile(outputPath, `<!doctype html>\n${html}`);
      console.log(`[prerender] wrote ${outputFile}`);

      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}

prerender().catch((err) => {
  console.error('[prerender] failed:', err);
  process.exit(1);
});
