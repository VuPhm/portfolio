/**
 * Placeholder poster generator.
 *
 * Produces lightweight, text-free, cinematic abstract SVG posters (16:9, 9:16 and 16:10 covers)
 * so the gallery looks finished before real thumbnails exist. Replace any file in
 * `public/media/` with a real `.jpg` / `.webp` and update the matching content entry.
 *
 * Usage: node scripts/generate-posters.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'public', 'media');
mkdirSync(join(OUT, 'posters'), { recursive: true });
mkdirSync(join(OUT, 'covers'), { recursive: true });

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
const f = (n) => Math.round(n * 10) / 10;

function vignette(w, h) {
  return {
    defs: `<radialGradient id="vg" cx="50%" cy="45%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".55"/></radialGradient>`,
    body: `<rect width="${w}" height="${h}" fill="url(#vg)"/>`,
  };
}

function aurora(w, h, p, r) {
  let defs = `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bg[0]}"/><stop offset="1" stop-color="${p.bg[1]}"/></linearGradient>`;
  let body = `<rect width="${w}" height="${h}" fill="url(#bg)"/>`;
  p.colors.forEach((c, i) => {
    const cx = f((0.15 + r() * 0.7) * w);
    const cy = f((0.2 + r() * 0.6) * h);
    const rx = f((0.35 + r() * 0.35) * Math.max(w, h));
    defs += `<radialGradient id="a${i}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${rx}"><stop offset="0" stop-color="${c}" stop-opacity="${f(0.75 + r() * 0.2)}"/><stop offset=".45" stop-color="${c}" stop-opacity="${f(0.25 + r() * 0.1)}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
    body += `<rect width="${w}" height="${h}" fill="url(#a${i})"/>`;
  });
  return { defs, body };
}

function ribbons(w, h, p, r) {
  const base = aurora(w, h, { ...p, colors: p.colors.slice(0, 2) }, r);
  let { defs, body } = base;
  const n = 3 + Math.floor(r() * 2);
  const vertical = h > w;
  for (let i = 0; i < n; i++) {
    const c1 = p.colors[i % p.colors.length];
    const c2 = p.colors[(i + 1) % p.colors.length];
    defs += `<linearGradient id="r${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
    const sw = f((0.08 + r() * 0.12) * Math.min(w, h) * (vertical ? 1.4 : 1));
    let d;
    if (vertical) {
      const x = () => f((0.1 + r() * 0.8) * w);
      d = `M${x()} ${-0.1 * h} C${x()} ${f(h * 0.3)} ${x()} ${f(h * 0.6)} ${x()} ${f(h * 1.1)}`;
    } else {
      const y = () => f((0.15 + r() * 0.7) * h);
      d = `M${-0.1 * w} ${y()} C${f(w * 0.3)} ${y()} ${f(w * 0.65)} ${y()} ${f(w * 1.1)} ${y()}`;
    }
    body += `<path d="${d}" fill="none" stroke="url(#r${i})" stroke-width="${f(sw * 2.4)}" stroke-linecap="round" opacity=".14"/>`;
    body += `<path d="${d}" fill="none" stroke="url(#r${i})" stroke-width="${sw}" stroke-linecap="round" opacity="${f(0.7 + r() * 0.25)}"/>`;
  }
  return { defs, body };
}

function horizon(w, h, p, r) {
  const hy = f(h * (h > w ? 0.6 : 0.64));
  const sun = p.colors[0];
  const cx = f(w * (0.3 + r() * 0.4));
  const sr = f(Math.min(w, h) * (0.09 + r() * 0.05));
  const cy = f(hy - sr * 0.55);
  let defs = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bg[0]}"/><stop offset=".75" stop-color="${p.colors[1]}"/><stop offset="1" stop-color="${p.colors[2] ?? sun}"/></linearGradient>`;
  defs += `<radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${f(sr * 6)}"><stop offset="0" stop-color="${sun}" stop-opacity=".7"/><stop offset=".3" stop-color="${sun}" stop-opacity=".18"/><stop offset="1" stop-color="${sun}" stop-opacity="0"/></radialGradient>`;
  defs += `<linearGradient id="disk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8ec"/><stop offset="1" stop-color="${sun}"/></linearGradient>`;
  defs += `<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bg[1]}" stop-opacity=".85"/><stop offset="1" stop-color="#000"/></linearGradient>`;
  defs += `<clipPath id="above"><rect width="${w}" height="${hy}"/></clipPath>`;
  let body = `<rect width="${w}" height="${h}" fill="url(#sky)"/><rect width="${w}" height="${h}" fill="url(#glow)"/>`;
  body += `<circle cx="${cx}" cy="${cy}" r="${sr}" fill="url(#disk)" clip-path="url(#above)"/>`;
  // distant ridge
  let ridge = `M0 ${hy}`;
  const steps = 7;
  for (let i = 0; i <= steps; i++) {
    const x = f((i / steps) * w);
    const y = f(hy - (0.02 + r() * 0.07) * h);
    ridge += ` Q${f(x - w / steps / 2)} ${f(y - r() * 0.03 * h)} ${x} ${y}`;
  }
  ridge += ` L${w} ${hy} Z`;
  body += `<path d="${ridge}" fill="${p.bg[1]}" opacity=".55"/>`;
  body += `<rect y="${hy}" width="${w}" height="${f(h - hy)}" fill="url(#ground)"/>`;
  for (let i = 0; i < 6; i++) {
    const yy = f(hy + (i + 1) * (h - hy) * 0.09);
    const ww = f(sr * (2.4 - i * 0.32));
    body += `<rect x="${f(cx - ww / 2)}" y="${yy}" width="${ww}" height="${f(Math.max(2, h * 0.004))}" rx="2" fill="${sun}" opacity="${f(0.5 - i * 0.07)}"/>`;
  }
  return { defs, body };
}

function orb(w, h, p, r) {
  const base = aurora(w, h, { ...p, colors: [p.colors[2] ?? p.colors[0]] }, r);
  let { defs, body } = base;
  const R = f(Math.min(w, h) * 0.26);
  const cx = f(w * (0.42 + r() * 0.16));
  const cy = f(h * 0.47);
  defs += `<radialGradient id="sph" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".18" stop-color="${p.colors[0]}"/><stop offset=".7" stop-color="${p.colors[1]}"/><stop offset="1" stop-color="${p.bg[1]}"/></radialGradient>`;
  defs += `<radialGradient id="shadow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".7"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`;
  defs += `<radialGradient id="halo" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${f(R * 2.6)}"><stop offset=".35" stop-color="${p.colors[0]}" stop-opacity=".35"/><stop offset="1" stop-color="${p.colors[0]}" stop-opacity="0"/></radialGradient>`;
  body += `<rect width="${w}" height="${h}" fill="url(#halo)"/>`;
  body += `<ellipse cx="${cx}" cy="${f(cy + R * 1.18)}" rx="${f(R * 1.1)}" ry="${f(R * 0.16)}" fill="url(#shadow)"/>`;
  body += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#sph)"/>`;
  body += `<circle cx="${cx}" cy="${cy}" r="${f(R - 1.5)}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="3"/>`;
  return { defs, body };
}

const COMPS = { aurora, ribbons, horizon, orb };

function svg(w, h, comp, palette, seedKey) {
  const r = rng(hash(seedKey));
  const { defs, body } = COMPS[comp](w, h, palette, r);
  const v = vignette(w, h);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"><defs>${defs}${v.defs}</defs>${body}${v.body}</svg>\n`;
}

/** Channel-style cover: a triptych of vertical frames floating on a dark stage. */
function triptych(w, h, palettes, seedKey) {
  const r = rng(hash(seedKey));
  const ph = h * 0.52;
  const pw = (ph * 9) / 16;
  const gap = w * 0.022;
  const total = pw * 3 + gap * 2;
  let defs = `<radialGradient id="stage" cx="50%" cy="55%" r="70%"><stop offset="0" stop-color="#1c1c22"/><stop offset="1" stop-color="#050506"/></radialGradient>`;
  let body = `<rect width="${w}" height="${h}" fill="url(#stage)"/>`;
  palettes.forEach((p, i) => {
    const x = (w - total) / 2 + i * (pw + gap);
    const y = (h - ph) / 2 + (i === 1 ? -h * 0.025 : h * 0.015);
    defs += `<clipPath id="c${i}"><rect x="${f(x)}" y="${f(y)}" width="${f(pw)}" height="${f(ph)}" rx="${f(pw * 0.08)}"/></clipPath>`;
    defs += `<radialGradient id="sh${i}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${p.colors[0]}" stop-opacity=".35"/><stop offset="1" stop-color="${p.colors[0]}" stop-opacity="0"/></radialGradient>`;
    body += `<ellipse cx="${f(x + pw / 2)}" cy="${f(y + ph / 2)}" rx="${f(pw)}" ry="${f(ph * 0.75)}" fill="url(#sh${i})"/>`;
    let inner = `<rect x="${f(x)}" y="${f(y)}" width="${f(pw)}" height="${f(ph)}" fill="${p.bg[0]}"/>`;
    p.colors.forEach((c, j) => {
      const cx = f(x + (0.2 + r() * 0.6) * pw);
      const cy = f(y + (0.2 + r() * 0.6) * ph);
      defs += `<radialGradient id="t${i}${j}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${f(ph * (0.4 + r() * 0.3))}"><stop offset="0" stop-color="${c}" stop-opacity=".9"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
      inner += `<rect x="${f(x)}" y="${f(y)}" width="${f(pw)}" height="${f(ph)}" fill="url(#t${i}${j})"/>`;
    });
    body += `<g clip-path="url(#c${i})">${inner}</g>`;
    body += `<rect x="${f(x)}" y="${f(y)}" width="${f(pw)}" height="${f(ph)}" rx="${f(pw * 0.08)}" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>\n`;
}

// ---------------------------------------------------------------------------
// Palettes — neutral dark stages; colour comes from the "footage".
// ---------------------------------------------------------------------------
const P = {
  dusk: { bg: ['#06141c', '#04080b'], colors: ['#ffb067', '#1f6f8b', '#e0703a'] },
  night: { bg: ['#07061a', '#020208'], colors: ['#6c4cff', '#d13fa0', '#2a2f9e', '#ff7ab8'] },
  sand: { bg: ['#1a130c', '#070504'], colors: ['#f2c38b', '#a65b33', '#d98a4e'] },
  olive: { bg: ['#0e120a', '#040503'], colors: ['#c9c48a', '#55693a', '#8a8f52'] },
  slate: { bg: ['#0a0f16', '#030406'], colors: ['#9fb8d6', '#3b5778', '#d9e4f2'] },
  ember: { bg: ['#160806', '#050202'], colors: ['#ff8a4c', '#8f1f2b', '#ffc27a'] },
  coral: { bg: ['#1a0710', '#060205'], colors: ['#ff6f91', '#ff9a5a', '#7a2b8f'] },
  ocean: { bg: ['#03111c', '#010509'], colors: ['#3cc7ff', '#1d4fd8', '#86f0e0'] },
  violet: { bg: ['#0d0618', '#040208'], colors: ['#b28cff', '#4b2bd1', '#ff8fd8'] },
  gold: { bg: ['#140f04', '#050402'], colors: ['#ffd36b', '#c26b1c', '#fff1c2'] },
  mint: { bg: ['#03130f', '#010604'], colors: ['#6ef0c0', '#167a6a', '#c8ffe9'] },
  rain: { bg: ['#070b12', '#020305'], colors: ['#7aa6ff', '#2a3c6e', '#c6d6ff'] },
  chroma: { bg: ['#05050a', '#000000'], colors: ['#ff4f8b', '#ffb03a', '#3fd0ff', '#8b5cff'] },
};

const H = [1600, 900];
const V = [900, 1600];
const C = [1600, 1000];

const posters = [
  // Standalone
  ['kinetic-silence', H, 'horizon', P.dusk],
  ['nocturne', H, 'aurora', P.night],
  // Series — Field Notes
  ['field-notes-01', H, 'horizon', P.sand],
  ['field-notes-02', H, 'orb', P.slate],
  ['field-notes-03', H, 'ribbons', P.olive],
  ['field-notes-04', H, 'horizon', P.ember],
  // Channel — Daily Frames (vertical)
  ['daily-frames-pulse', V, 'ribbons', P.coral],
  ['daily-frames-commute', V, 'horizon', P.ocean],
  ['daily-frames-rain', V, 'aurora', P.rain],
  ['daily-frames-neon', V, 'orb', P.violet],
  ['daily-frames-ritual', V, 'aurora', P.gold],
  ['daily-frames-golden', V, 'horizon', P.gold],
  // Brand — Seasonal Campaign
  ['campaign-film', H, 'ribbons', P.chroma],
  ['campaign-motion', V, 'ribbons', P.chroma],
  ['campaign-detail', V, 'orb', P.chroma],
  ['campaign-color', V, 'aurora', P.chroma],
  // Draft
  ['untitled-draft', H, 'aurora', P.mint],
];

for (const [name, [w, h], comp, pal] of posters) {
  writeFileSync(join(OUT, 'posters', `${name}.svg`), svg(w, h, comp, pal, name));
}

writeFileSync(join(OUT, 'covers', 'field-notes.svg'), svg(...C, 'horizon', P.sand, 'cover-field-notes'));
writeFileSync(join(OUT, 'covers', 'daily-frames.svg'), triptych(...C, [P.ocean, P.coral, P.gold], 'cover-daily'));
writeFileSync(join(OUT, 'covers', 'seasonal-campaign.svg'), svg(...C, 'ribbons', P.chroma, 'cover-campaign'));
writeFileSync(join(OUT, 'og.svg'), svg(1200, 630, 'horizon', P.dusk, 'og'));

console.log(`Generated ${posters.length} posters + 3 covers in ${OUT}`);

