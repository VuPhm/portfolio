import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9222;
const OUT_DIR = 'media-workspace/evidence-r04';
const FRAMES_DIR = join(OUT_DIR, 'frames');
const MOBILE_FRAMES_DIR = join(OUT_DIR, 'frames-mobile');

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(FRAMES_DIR, { recursive: true });
mkdirSync(MOBILE_FRAMES_DIR, { recursive: true });

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
  console.log('=== Round 04.1 Evidence & Quality Gate Suite ===');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=/tmp/chrome-r04-profile',
    '--hide-scrollbars',
    'about:blank',
  ]);

  try {
    const wsUrl = await getWsUrl();
    const cdp = new CDPClient(wsUrl);
    await cdp.connect();
    console.log('CDP connection established');

    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');

    // ==========================================
    // 1. Desktop 1440x900 — 5 Scroll Milestones
    // ==========================================
    console.log('\n--- 1. Desktop 1440x900 (5 Scroll Milestones) ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: 'http://localhost:4328/' });
    await sleep(1500);

    const desktopMilestones = [
      { name: 'desktop-1440x900-scroll-000pct.png', y: 0, label: '0% (Hero Top)' },
      { name: 'desktop-1440x900-scroll-025pct.png', y: 225, label: '25% (Early Transition)' },
      { name: 'desktop-1440x900-scroll-050pct.png', y: 450, label: '50% (Mid Transition / Content Emerging)' },
      { name: 'desktop-1440x900-scroll-075pct.png', y: 675, label: '75% (Gallery Emerging)' },
      { name: 'desktop-1440x900-scroll-100pct.png', y: 900, label: '100% (Gallery in View)' },
    ];

    for (const m of desktopMilestones) {
      console.log(`Capturing Desktop: ${m.label} (scrollY = ${m.y})...`);
      await cdp.send('Runtime.evaluate', { expression: `window.scrollTo({ top: ${m.y}, behavior: 'instant' })` });
      await sleep(350);
      const snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT_DIR, m.name), Buffer.from(snap.data, 'base64'));
    }

    // ==========================================
    // 2. Mobile iPhone 390x844 — 3 Milestones
    // ==========================================
    console.log('\n--- 2. Mobile 390x844 (3 Milestones) ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.send('Page.reload');
    await sleep(800);
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 0, behavior: "instant" })' });
    await sleep(400);

    const mobileMilestones = [
      { name: 'mobile-390x844-01-initial.png', y: 0, label: 'Màn hình đầu (Hero Top)' },
      { name: 'mobile-390x844-02-mid-transition.png', y: 350, label: 'Giữa transition' },
      { name: 'mobile-390x844-03-gallery-arrival.png', y: 750, label: 'Điểm xuất hiện gallery' },
    ];

    for (const m of mobileMilestones) {
      console.log(`Capturing Mobile 390x844: ${m.label} (scrollY = ${m.y})...`);
      await cdp.send('Runtime.evaluate', { expression: `window.scrollTo({ top: ${m.y}, behavior: 'instant' })` });
      await sleep(350);
      const snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT_DIR, m.name), Buffer.from(snap.data, 'base64'));
    }

    // ==========================================
    // 3. Additional Responsive Checks
    // ==========================================
    console.log('\n--- 3. Additional Responsive Checks ---');
    // Laptop 1280x800
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.reload');
    await sleep(600);
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 0, behavior: "instant" })' });
    await sleep(400);
    const snap1280 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, 'desktop-1280x800-hero.png'), Buffer.from(snap1280.data, 'base64'));

    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 400, behavior: "instant" })' });
    await sleep(400);
    const snap1280Mid = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, 'desktop-1280x800-mid-transition.png'), Buffer.from(snap1280Mid.data, 'base64'));

    // Android 360x780
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.reload');
    await sleep(600);
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 0, behavior: "instant" })' });
    await sleep(400);
    const snap360 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, 'mobile-360x780-hero.png'), Buffer.from(snap360.data, 'base64'));

    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 350, behavior: "instant" })' });
    await sleep(400);
    const snap360Mid = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, 'mobile-360x780-mid-transition.png'), Buffer.from(snap360Mid.data, 'base64'));

    // ==========================================
    // 4. Hero Preview Studio
    // ==========================================
    console.log('\n--- 4. Hero Preview Studio Checks ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: 'http://localhost:4328/hero-preview' });
    await sleep(1000);

    const snapStudioB = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, 'studio-variant-b.png'), Buffer.from(snapStudioB.data, 'base64'));

    await cdp.send('Runtime.evaluate', { expression: 'document.querySelector("[data-variant=\'portrait-a\']").click()' });
    await sleep(500);
    const snapStudioA = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, 'studio-variant-a.png'), Buffer.from(snapStudioA.data, 'base64'));

    await cdp.send('Runtime.evaluate', { expression: 'document.querySelector("[data-variant=\'abstract\']").click()' });
    await sleep(500);
    const snapStudioAbs = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, 'studio-variant-abstract.png'), Buffer.from(snapStudioAbs.data, 'base64'));

    // ==========================================
    // 5. Recording Smooth Scroll Frames for Video
    // ==========================================
    console.log('\n--- 5. Recording Desktop Continuous Scroll Frames ---');
    await cdp.send('Page.navigate', { url: 'http://localhost:4328/' });
    await sleep(1000);

    const totalSteps = 45;
    const maxScroll = 900;
    for (let i = 0; i <= totalSteps; i++) {
      const scrollY = Math.round((i / totalSteps) * maxScroll);
      await cdp.send('Runtime.evaluate', { expression: `window.scrollTo({ top: ${scrollY}, behavior: 'instant' })` });
      await sleep(60);
      const frame = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
      const frameNum = String(i).padStart(4, '0');
      writeFileSync(join(FRAMES_DIR, `frame_${frameNum}.jpg`), Buffer.from(frame.data, 'base64'));
    }

    console.log('--- 6. Recording Mobile Continuous Scroll Frames ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 0, behavior: "instant" })' });
    await sleep(600);

    const mobileSteps = 40;
    const mobileMaxScroll = 844;
    for (let i = 0; i <= mobileSteps; i++) {
      const scrollY = Math.round((i / mobileSteps) * mobileMaxScroll);
      await cdp.send('Runtime.evaluate', { expression: `window.scrollTo({ top: ${scrollY}, behavior: 'instant' })` });
      await sleep(60);
      const frame = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
      const frameNum = String(i).padStart(4, '0');
      writeFileSync(join(MOBILE_FRAMES_DIR, `frame_${frameNum}.jpg`), Buffer.from(frame.data, 'base64'));
    }

    console.log('✓ All evidence captured successfully!');
    cdp.close();
  } finally {
    chrome.kill();
  }
}

capture().catch((err) => {
  console.error('Evidence capture failed:', err);
  process.exit(1);
});
