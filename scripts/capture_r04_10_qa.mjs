import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9225;
const OUT_DIR = 'media-workspace/round_04_10_evidence';
const BRAIN_DIR = '/Users/vup/.gemini/antigravity/brain/679745bc-fdd4-4e1e-9eb3-6ed2b787eeb2/evidence_r04_10';

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
  console.log('=== Round 04.10 Desktop Hero Refinement & Dual Variant QA Capture ===');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=/tmp/chrome-r04-10-profile',
    '--hide-scrollbars',
    'about:blank',
  ]);

  try {
    const wsUrl = await getWsUrl();
    const cdp = new CDPClient(wsUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');

    const desktopViewports = [
      { name: '1920x1080', w: 1920, h: 1080 },
      { name: '1440x900', w: 1440, h: 900 },
      { name: '1280x800', w: 1280, h: 800 },
    ];

    // ===============================================
    // 1. DESKTOP COMPARISON: CHROMATIC vs MONOCHROME
    // ===============================================
    for (const vp of desktopViewports) {
      console.log(`\n--- Capturing Desktop ${vp.name} ---`);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 1,
        mobile: false,
      });

      // A. Chromatic Dark (Default)
      console.log(`Loading Chromatic Dark at ${vp.name}...`);
      await cdp.send('Page.navigate', { url: `http://localhost:4328/?variant=chromatic&t=${Date.now()}` });
      await sleep(1500);

      const shotChroma = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const chromaBuf = Buffer.from(shotChroma.data, 'base64');
      const chromaPath = join(OUT_DIR, `desktop_chromatic_${vp.name}_top.png`);
      const brainChromaPath = join(BRAIN_DIR, `desktop_chromatic_${vp.name}_top.png`);
      writeFileSync(chromaPath, chromaBuf);
      writeFileSync(brainChromaPath, chromaBuf);
      console.log(`Saved: ${chromaPath}`);

      // B. Monochrome Silver (Baseline)
      console.log(`Loading Monochrome Silver at ${vp.name}...`);
      await cdp.send('Page.navigate', { url: `http://localhost:4328/?variant=monochrome&t=${Date.now()}` });
      await sleep(1500);

      const shotMono = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const monoBuf = Buffer.from(shotMono.data, 'base64');
      const monoPath = join(OUT_DIR, `desktop_monochrome_${vp.name}_top.png`);
      const brainMonoPath = join(BRAIN_DIR, `desktop_monochrome_${vp.name}_top.png`);
      writeFileSync(monoPath, monoBuf);
      writeFileSync(brainMonoPath, monoBuf);
      console.log(`Saved: ${monoPath}`);
    }

    // ===============================================
    // 2. SCROLL PROGRESSION (1920x1080 Chromatic Dark)
    // ===============================================
    console.log('\n--- Capturing Scroll Progression (1920x1080 Chromatic Dark) ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: `http://localhost:4328/?variant=chromatic&t=${Date.now()}` });
    await sleep(1500);

    const scrollSteps = [
      { name: '00_top', scrollY: 0 },
      { name: '25_p25', scrollY: 450 },
      { name: '50_p50', scrollY: 900 },
      { name: '75_p75', scrollY: 1350 },
      { name: '100_gallery', scrollY: 1900 },
    ];

    for (const step of scrollSteps) {
      await cdp.send('Runtime.evaluate', {
        expression: `window.scrollTo(0, ${step.scrollY});`,
      });
      await sleep(350);

      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(shot.data, 'base64');
      const stepPath = join(OUT_DIR, `scroll_step_${step.name}.png`);
      const brainStepPath = join(BRAIN_DIR, `scroll_step_${step.name}.png`);
      writeFileSync(stepPath, buf);
      writeFileSync(brainStepPath, buf);
      console.log(`Saved: ${stepPath}`);
    }

    // ===============================================
    // 3. MOBILE FREEZE VERIFICATION (Option B default)
    // ===============================================
    console.log('\n--- Verifying Mobile Freeze (390x844 Option B) ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.send('Page.navigate', { url: `http://localhost:4328/?t=${Date.now()}` });
    await sleep(1200);

    const shotMob = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const mobBuf = Buffer.from(shotMob.data, 'base64');
    const mobPath = join(OUT_DIR, 'mobile_freeze_verification_390x844.png');
    const brainMobPath = join(BRAIN_DIR, 'mobile_freeze_verification_390x844.png');
    writeFileSync(mobPath, mobBuf);
    writeFileSync(brainMobPath, mobBuf);
    console.log(`Saved: ${mobPath}`);

    console.log('\n✓ All QA Screenshots captured successfully!');
    cdp.close();
  } finally {
    chrome.kill('SIGKILL');
  }
}

capture().catch((err) => {
  console.error('Capture error:', err);
  process.exit(1);
});
