import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9222;
const HTTP_PORT = 4321;
const DIST_DIR = join(process.cwd(), 'dist');
const OUT_DIR = join(process.cwd(), 'design/hero/round-04-15/qa');
mkdirSync(OUT_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

function startServer() {
  const server = createServer((req, res) => {
    let url = req.url.split('?')[0];
    if (url === '/') url = '/index.html';
    else if (!extname(url)) url += '/index.html';

    const fp = join(DIST_DIR, url);
    if (existsSync(fp) && statSync(fp).isFile()) {
      const ext = extname(fp);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(readFileSync(fp));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  return new Promise((resolve) => {
    server.listen(HTTP_PORT, () => {
      console.log(`Static server running on http://127.0.0.1:${HTTP_PORT}`);
      resolve(server);
    });
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (_) {}
    await sleep(200);
  }
  throw new Error('Chrome remote debugging did not respond');
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      };
    });
  }

  async send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function main() {
  const httpServer = await startServer();

  console.log('Spawning headless Chrome...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-background-networking',
    '--disable-default-apps',
    '--mute-audio',
    '--hide-scrollbars',
    'about:blank'
  ]);

  try {
    const wsUrl = await getWsUrl();
    const cdp = new CDPClient(wsUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');

    async function captureViewport(name, width, height, deviceScaleFactor, scrollY = 0) {
      console.log(`Capturing ${name} (${width}x${height}, dpr=${deviceScaleFactor}, scrollY=${scrollY})...`);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor,
        mobile: width < 768
      });
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/` });
      await sleep(1500); // Allow Astro hero sequence preloader to load frame 0

      if (scrollY > 0) {
        await cdp.send('Runtime.evaluate', {
          expression: `window.scrollTo({ top: ${scrollY}, behavior: 'instant' });`
        });
        await sleep(500);
      }

      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(data, 'base64');
      const outPath = join(OUT_DIR, `${name}.png`);
      writeFileSync(outPath, buf);
      console.log(`Saved: ${outPath} (${buf.length} bytes)`);
    }

    // 1. Desktop 1920x1080 — Top landing
    await captureViewport('browser_desktop_1920x1080_top', 1920, 1080, 1, 0);

    // 2. Desktop 1920x1080 — Mid scroll (Progress ~ 50% Chromatic Awakening)
    await captureViewport('browser_desktop_1920x1080_scrolled_mid', 1920, 1080, 1, 900);

    // 3. Desktop 1920x1080 — Deep scroll (Progress ~ 85% Gallery Transition)
    await captureViewport('browser_desktop_1920x1080_scrolled_gallery', 1920, 1080, 1, 1600);

    // 4. Laptop 1440x900 — Top landing
    await captureViewport('browser_desktop_1440x900_top', 1440, 900, 1, 0);

    // 5. Compact Laptop 1280x800 — Top landing
    await captureViewport('browser_desktop_1280x800_top', 1280, 800, 1, 0);

    // 6. Mobile 390x844 — Top landing (Regression check)
    await captureViewport('browser_mobile_390x844_top', 390, 844, 2, 0);

    // 7. Mobile 390x844 — Scrolled (Regression check)
    await captureViewport('browser_mobile_390x844_scrolled', 390, 844, 2, 600);

    cdp.close();
  } finally {
    chrome.kill();
    httpServer.close();
    console.log('Capture finished cleanly.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
