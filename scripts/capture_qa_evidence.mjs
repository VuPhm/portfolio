import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9222;
const OUT_DIR = 'media-workspace/screenshots-r04';

mkdirSync(OUT_DIR, { recursive: true });

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
  console.log('Launching Headless Chrome for Quality Gate Verification...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    '--hide-scrollbars',
    'about:blank',
  ]);

  try {
    const wsUrl = await getWsUrl();
    const cdp = new CDPClient(wsUrl);
    await cdp.connect();
    console.log('CDP connected');

    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');

    // 1. Desktop 1440x900 - Stage 01 (Hero Top)
    console.log('Capturing Desktop 1440x900 Stage 01...');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: 'http://localhost:4328/' });
    await sleep(1500);

    const snapHero1440 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, '01-desktop-1440x900-hero-stage01.png'), Buffer.from(snapHero1440.data, 'base64'));

    // 2. Desktop 1440x900 - Stage 02 (Cinematic Transition: scroll 240px)
    console.log('Capturing Desktop 1440x900 Stage 02 (Scroll Transition)...');
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 260, behavior: "instant" })' });
    await sleep(600);
    const snapTrans1440 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, '02-desktop-1440x900-hero-stage02-transition.png'), Buffer.from(snapTrans1440.data, 'base64'));

    // 3. Desktop 1440x900 - Stage 03 (Content Reveal: Collections & Videos: scroll 620px)
    console.log('Capturing Desktop 1440x900 Stage 03 (Content Reveal)...');
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 580, behavior: "instant" })' });
    await sleep(600);
    const snapContent1440 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, '03-desktop-1440x900-stage03-content-reveal.png'), Buffer.from(snapContent1440.data, 'base64'));

    // 4. Desktop 1440x900 - Profile & About Section
    console.log('Capturing Desktop 1440x900 Profile & About...');
    await cdp.send('Runtime.evaluate', { expression: 'document.getElementById("about").scrollIntoView({ behavior: "instant" })' });
    await sleep(500);
    const snapAbout1440 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, '04-desktop-1440x900-about.png'), Buffer.from(snapAbout1440.data, 'base64'));

    // 5. Desktop 1440x900 - Contact Section
    console.log('Capturing Desktop 1440x900 Contact...');
    await cdp.send('Runtime.evaluate', { expression: 'document.getElementById("contact").scrollIntoView({ behavior: "instant" })' });
    await sleep(500);
    const snapContact1440 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, '05-desktop-1440x900-contact.png'), Buffer.from(snapContact1440.data, 'base64'));

    // 6. Desktop 1280x800 Viewport
    console.log('Capturing Desktop 1280x800 Hero...');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 0, behavior: "instant" })' });
    await sleep(600);
    const snapDesk1280 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, '06-desktop-1280x800-hero.png'), Buffer.from(snapDesk1280.data, 'base64'));

    // 7. Mobile iPhone 390x844 - Hero Top
    console.log('Capturing Mobile 390x844 Hero...');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 0, behavior: "instant" })' });
    await sleep(600);
    const snapMobile390 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, '07-mobile-390x844-hero.png'), Buffer.from(snapMobile390.data, 'base64'));

    // 8. Mobile 390x844 - Content Gallery
    console.log('Capturing Mobile 390x844 Content...');
    await cdp.send('Runtime.evaluate', { expression: 'document.getElementById("collections").scrollIntoView({ behavior: "instant" })' });
    await sleep(500);
    const snapMobileContent = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, '08-mobile-390x844-collections.png'), Buffer.from(snapMobileContent.data, 'base64'));

    // 9. Mobile Android 360x780 Viewport
    console.log('Capturing Mobile 360x780 Hero...');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 780,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 0, behavior: "instant" })' });
    await sleep(500);
    const snapMobile360 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, '09-mobile-360x780-hero.png'), Buffer.from(snapMobile360.data, 'base64'));

    // 10. Hero Preview Studio (/hero-preview) - Variant B, Variant A, Abstract
    console.log('Capturing Hero Preview Studio...');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: 'http://localhost:4328/hero-preview' });
    await sleep(1200);
    const snapStudioB = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, '10-preview-studio-variant-b.png'), Buffer.from(snapStudioB.data, 'base64'));

    // Switch to Variant A
    await cdp.send('Runtime.evaluate', { expression: 'document.querySelector("[data-variant=\'portrait-a\']").click()' });
    await sleep(600);
    const snapStudioA = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, '11-preview-studio-variant-a.png'), Buffer.from(snapStudioA.data, 'base64'));

    // Switch to Abstract
    await cdp.send('Runtime.evaluate', { expression: 'document.querySelector("[data-variant=\'abstract\']").click()' });
    await sleep(600);
    const snapStudioAbs = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, '12-preview-studio-variant-abstract.png'), Buffer.from(snapStudioAbs.data, 'base64'));

    console.log('✓ All 12 QA screenshots successfully captured!');
    cdp.close();
  } finally {
    chrome.kill();
  }
}

capture().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
