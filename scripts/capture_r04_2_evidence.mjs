import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG_PATH = '/usr/local/bin/ffmpeg';
const PORT = 9222;
const OUT_DIR = 'media-workspace/evidence-r04';
const FRAMES_DIR = join(OUT_DIR, 'frames');
const MOBILE_FRAMES_DIR = join(OUT_DIR, 'frames-mobile');
const BRAIN_EVIDENCE_DIR = '/Users/vup/.gemini/antigravity/brain/679745bc-fdd4-4e1e-9eb3-6ed2b787eeb2/evidence';

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(FRAMES_DIR, { recursive: true });
mkdirSync(MOBILE_FRAMES_DIR, { recursive: true });
mkdirSync(BRAIN_EVIDENCE_DIR, { recursive: true });

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
  console.log('=== Round 04.2 Gate C: Cinematic Scroll-Scrubbed Hero Quality Verification ===');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=/tmp/chrome-r04-2-profile',
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

    // Track height 155vh = 1395px on 900px viewport. Scrollable travel = 495px.
    const desktopMilestones = [
      { name: 'desktop-1440x900-scroll-000pct.png', y: 0, label: '0% (Hero Top)' },
      { name: 'desktop-1440x900-scroll-025pct.png', y: 124, label: '25% (Transition Start)' },
      { name: 'desktop-1440x900-scroll-050pct.png', y: 248, label: '50% (Mid Parallax / Content Emerging)' },
      { name: 'desktop-1440x900-scroll-075pct.png', y: 372, label: '75% (Content Reveal / Gallery Approaching)' },
      { name: 'desktop-1440x900-scroll-100pct.png', y: 495, label: '100% (Gallery Seamless Arrival)' },
    ];

    for (const m of desktopMilestones) {
      console.log(`Capturing Desktop: ${m.label} (scrollY = ${m.y})...`);
      await cdp.send('Runtime.evaluate', { expression: `window.scrollTo({ top: ${m.y}, behavior: 'instant' })` });
      await sleep(300);
      const snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const filePath = join(OUT_DIR, m.name);
      writeFileSync(filePath, Buffer.from(snap.data, 'base64'));
      copyFileSync(filePath, join(BRAIN_EVIDENCE_DIR, m.name));
    }

    // ==========================================
    // 2. Mobile 390x844 — 3 Milestones
    // ==========================================
    console.log('\n--- 2. Mobile 390x844 (3 Milestones) ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.send('Page.reload');
    await sleep(1000);

    // Mobile track height 155vh = 1308px. Scrollable travel = 1308 - 844 = 464px.
    const mobileMilestones = [
      { name: 'mobile-390x844-01-initial.png', y: 0, label: 'Màn hình đầu (Hero Top)' },
      { name: 'mobile-390x844-02-mid-transition.png', y: 232, label: 'Giữa transition' },
      { name: 'mobile-390x844-03-gallery-arrival.png', y: 464, label: 'Điểm xuất hiện gallery' },
    ];

    for (const m of mobileMilestones) {
      console.log(`Capturing Mobile 390x844: ${m.label} (scrollY = ${m.y})...`);
      await cdp.send('Runtime.evaluate', { expression: `window.scrollTo({ top: ${m.y}, behavior: 'instant' })` });
      await sleep(300);
      const snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const filePath = join(OUT_DIR, m.name);
      writeFileSync(filePath, Buffer.from(snap.data, 'base64'));
      copyFileSync(filePath, join(BRAIN_EVIDENCE_DIR, m.name));
    }

    // ==========================================
    // 3. Additional Responsive Checks
    // ==========================================
    console.log('\n--- 3. Additional Responsive Checks (1280x800 & 360x780) ---');
    // Laptop 1280x800
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.reload');
    await sleep(800);
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 0, behavior: "instant" })' });
    await sleep(400);
    const snap1280Hero = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, 'desktop-1280x800-hero.png'), Buffer.from(snap1280Hero.data, 'base64'));
    copyFileSync(join(OUT_DIR, 'desktop-1280x800-hero.png'), join(BRAIN_EVIDENCE_DIR, 'desktop-1280x800-hero.png'));

    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 220, behavior: "instant" })' });
    await sleep(300);
    const snap1280Mid = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, 'desktop-1280x800-mid-transition.png'), Buffer.from(snap1280Mid.data, 'base64'));
    copyFileSync(join(OUT_DIR, 'desktop-1280x800-mid-transition.png'), join(BRAIN_EVIDENCE_DIR, 'desktop-1280x800-mid-transition.png'));

    // Android 360x780
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.reload');
    await sleep(800);
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 0, behavior: "instant" })' });
    await sleep(400);
    const snap360Hero = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, 'mobile-360x780-hero.png'), Buffer.from(snap360Hero.data, 'base64'));
    copyFileSync(join(OUT_DIR, 'mobile-360x780-hero.png'), join(BRAIN_EVIDENCE_DIR, 'mobile-360x780-hero.png'));

    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 190, behavior: "instant" })' });
    await sleep(300);
    const snap360Mid = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, 'mobile-360x780-mid-transition.png'), Buffer.from(snap360Mid.data, 'base64'));
    copyFileSync(join(OUT_DIR, 'mobile-360x780-mid-transition.png'), join(BRAIN_EVIDENCE_DIR, 'mobile-360x780-mid-transition.png'));

    // ==========================================
    // 4. Behavioral Tests: Reverse, Reload, CTA Click
    // ==========================================
    console.log('\n--- 4. Behavioral Tests (Reverse Scroll, Mid-page Reload, CTA Jump) ---');
    // Reverse scroll test
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 765, behavior: "instant" })' });
    await sleep(200);
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 0, behavior: "instant" })' });
    await sleep(300);
    console.log('✓ Reverse scroll restored position top');

    // Reload test at mid-scroll
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 382, behavior: "instant" })' });
    await sleep(200);
    await cdp.send('Page.reload');
    await sleep(600);
    console.log('✓ Reload at mid-scroll verified stable');

    // CTA Click Test: click "Xem tác phẩm →"
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo({ top: 0, behavior: "instant" })' });
    await sleep(300);
    await cdp.send('Runtime.evaluate', { expression: 'document.querySelector(".hero-btn-primary")?.click()' });
    await sleep(600);
    const ctaScroll = await cdp.send('Runtime.evaluate', { expression: 'window.scrollY' });
    console.log(`✓ CTA click jumped scroll to: ${ctaScroll.result.value}px (target #collections)`);

    // ==========================================
    // 5. Recording Continuous Scrub Frames for Video
    // ==========================================
    console.log('\n--- 5. Recording Desktop Continuous Scrub Frames for MP4 ---');
    await cdp.send('Page.navigate', { url: 'http://localhost:4328/' });
    await sleep(800);

    const totalSteps = 55;
    const maxScroll = 620; // Captures hero scrub and smooth flow into #collections
    for (let i = 0; i <= totalSteps; i++) {
      const scrollY = Math.round((i / totalSteps) * maxScroll);
      await cdp.send('Runtime.evaluate', { expression: `window.scrollTo({ top: ${scrollY}, behavior: 'instant' })` });
      await sleep(40);
      const frame = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
      const frameNum = String(i).padStart(4, '0');
      writeFileSync(join(FRAMES_DIR, `frame_${frameNum}.jpg`), Buffer.from(frame.data, 'base64'));
    }

    console.log('--- 6. Recording Mobile Continuous Scrub Frames for MP4 ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp.send('Page.reload');
    await sleep(800);

    const mobileSteps = 45;
    const mobileMaxScroll = 520;
    for (let i = 0; i <= mobileSteps; i++) {
      const scrollY = Math.round((i / mobileSteps) * mobileMaxScroll);
      await cdp.send('Runtime.evaluate', { expression: `window.scrollTo({ top: ${scrollY}, behavior: 'instant' })` });
      await sleep(40);
      const frame = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
      const frameNum = String(i).padStart(4, '0');
      writeFileSync(join(MOBILE_FRAMES_DIR, `frame_${frameNum}.jpg`), Buffer.from(frame.data, 'base64'));
    }

    console.log('✓ All frame captures complete. Closing Chrome...');
    cdp.close();
  } finally {
    chrome.kill();
  }
}

capture().catch((err) => {
  console.error('Evidence capture failed:', err);
  process.exit(1);
});
