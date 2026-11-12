import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9224;
const OUT_DIR = 'media-workspace/evidence_r04_9';
const BRAIN_DIR = '/Users/vup/.gemini/antigravity/brain/679745bc-fdd4-4e1e-9eb3-6ed2b787eeb2/evidence';

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(BRAIN_DIR, { recursive: true });

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
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
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

async function capture() {
  console.log('=== Round 04.9 Mobile Quality Recovery QA Capture ===');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=/tmp/chrome-r04-9-profile',
    '--hide-scrollbars',
    'about:blank',
  ]);

  try {
    const wsUrl = await getWsUrl();
    const cdp = new CDPClient(wsUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');

    const viewports = [
      { name: '390x844', w: 390, h: 844 },
      { name: '375x812', w: 375, h: 812 },
      { name: '360x780', w: 360, h: 780 },
    ];

    // ===============================================
    // 1. OPTION B: STATIC MOBILE HERO (Default)
    // ===============================================
    console.log('\n--- 1. Testing Option B: Static Mobile Hero ---');
    for (const vp of viewports) {
      console.log(`\nCapturing Option B on ${vp.name}...`);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 2,
        mobile: true,
      });
      await cdp.send('Page.navigate', { url: 'http://localhost:4328/' });
      await sleep(1200);

      // Top (scrollY = 0)
      console.log(`  Top (y=0)...`);
      await cdp.send('Runtime.evaluate', { expression: `window.scrollTo({ top: 0, behavior: 'instant' })` });
      await sleep(300);
      let snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT_DIR, `opt_b_${vp.name}_01_top.png`), Buffer.from(snap.data, 'base64'));
      writeFileSync(join(BRAIN_DIR, `opt_b_${vp.name}_01_top.png`), Buffer.from(snap.data, 'base64'));

      // Mid scroll (scrollY = 250)
      console.log(`  Mid (y=250)...`);
      await cdp.send('Runtime.evaluate', { expression: `window.scrollTo({ top: 250, behavior: 'instant' })` });
      await sleep(300);
      snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT_DIR, `opt_b_${vp.name}_02_mid.png`), Buffer.from(snap.data, 'base64'));
      writeFileSync(join(BRAIN_DIR, `opt_b_${vp.name}_02_mid.png`), Buffer.from(snap.data, 'base64'));

      // Gallery arrival (scrollY = vp.h)
      console.log(`  Gallery arrival (y=${vp.h})...`);
      await cdp.send('Runtime.evaluate', { expression: `window.scrollTo({ top: ${vp.h}, behavior: 'instant' })` });
      await sleep(300);
      snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT_DIR, `opt_b_${vp.name}_03_gallery.png`), Buffer.from(snap.data, 'base64'));
      writeFileSync(join(BRAIN_DIR, `opt_b_${vp.name}_03_gallery.png`), Buffer.from(snap.data, 'base64'));
    }

    // ===============================================
    // 2. OPTION A: OPTIMIZED SEQUENCE (via ?mobile=seq)
    // ===============================================
    console.log('\n--- 2. Testing Option A: Clean Mobile Sequence ---');
    for (const vp of [viewports[0]]) { // Test 390x844
      console.log(`\nCapturing Option A on ${vp.name}...`);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 2,
        mobile: true,
      });
      await cdp.send('Page.navigate', { url: 'http://localhost:4328/?mobile=seq' });
      await sleep(1500);

      // Top (scrollY = 0)
      console.log(`  Top (y=0)...`);
      await cdp.send('Runtime.evaluate', { expression: `window.scrollTo({ top: 0, behavior: 'instant' })` });
      await sleep(300);
      let snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT_DIR, `opt_a_${vp.name}_01_top.png`), Buffer.from(snap.data, 'base64'));
      writeFileSync(join(BRAIN_DIR, `opt_a_${vp.name}_01_top.png`), Buffer.from(snap.data, 'base64'));

      // Mid (scrollY = 230)
      console.log(`  Mid (y=230)...`);
      await cdp.send('Runtime.evaluate', { expression: `window.scrollTo({ top: 230, behavior: 'instant' })` });
      await sleep(300);
      snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT_DIR, `opt_a_${vp.name}_02_mid.png`), Buffer.from(snap.data, 'base64'));
      writeFileSync(join(BRAIN_DIR, `opt_a_${vp.name}_02_mid.png`), Buffer.from(snap.data, 'base64'));

      // Gallery arrival (scrollY = 460)
      console.log(`  Gallery arrival (y=460)...`);
      await cdp.send('Runtime.evaluate', { expression: `window.scrollTo({ top: 460, behavior: 'instant' })` });
      await sleep(300);
      snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT_DIR, `opt_a_${vp.name}_03_gallery.png`), Buffer.from(snap.data, 'base64'));
      writeFileSync(join(BRAIN_DIR, `opt_a_${vp.name}_03_gallery.png`), Buffer.from(snap.data, 'base64'));
    }

    // ===============================================
    // 3. DESKTOP 1440x900 VERIFICATION (Zero Regression)
    // ===============================================
    console.log('\n--- 3. Verifying Desktop 1440x900 ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: 'http://localhost:4328/' });
    await sleep(1500);
    const snapDesk = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, 'desktop_1440x900_top.png'), Buffer.from(snapDesk.data, 'base64'));
    writeFileSync(join(BRAIN_DIR, 'desktop_1440x900_top.png'), Buffer.from(snapDesk.data, 'base64'));

    cdp.close();
    console.log('\nAll QA screenshots captured successfully.');
  } finally {
    chrome.kill();
  }
}

capture().catch((e) => {
  console.error(e);
  process.exit(1);
});

