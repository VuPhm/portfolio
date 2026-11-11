#!/usr/bin/env node
/**
 * Media Inspection CLI — Round 03.1
 *
 * Uses `ffprobe` + a fast ISO-BMFF atom header scanner to inspect master/optimized videos:
 *  - Codec, profile, level, and container (MP4/MOV/MKV/WebM)
 *  - Duration, resolution, aspect ratio, orientation (16:9 landscape / 9:16 portrait), frame rate (CFR/VFR)
 *  - Video/audio/overall bitrate and file size
 *  - Audio codec, channels, sample rate
 *  - Pixel format, bit depth (8/10/12-bit), chroma subsampling, color space, HDR metadata (PQ/HLG/BT.2020/Dolby Vision)
 *  - Faststart (`moov` atom before `mdat`) and browser playability (Safari/iPhone, Chrome, Firefox)
 *  - Actionable recommendation: KEEP | REMUX | TRANSCODE | REVIEW
 *
 * Never modifies or re-encodes files.
 *
 * Usage:
 *  pnpm media:inspect <file-or-directory> [--preset web-standard] [--json report.json]
 */

import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const PRESETS_PATH = join(ROOT, 'config', 'media-presets.json');
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.mts', '.m2ts']);

export function loadMediaPresets() {
  if (!existsSync(PRESETS_PATH)) {
    throw new Error(`Missing presets configuration at ${PRESETS_PATH}`);
  }
  return JSON.parse(readFileSync(PRESETS_PATH, 'utf8'));
}

/**
 * Walks top-level ISO BMFF (MP4 / MOV / M4V) boxes by reading only 8–16 byte headers
 * to verify whether the `moov` atom appears before `mdat` (`+faststart`).
 */
export function inspectIsoBmffBoxes(filePath) {
  let fd;
  try {
    const stat = statSync(filePath);
    const totalSize = stat.size;
    if (totalSize < 16) return { isIsoBmff: false, faststart: false, atoms: [], moovOffset: null, mdatOffset: null };

    fd = openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    let offset = 0;
    const atoms = [];
    let moovOffset = null;
    let mdatOffset = null;
    let maxBoxes = 64;

    while (offset + 8 <= totalSize && maxBoxes-- > 0) {
      const bytesRead = readSync(fd, buf, 0, Math.min(16, totalSize - offset), offset);
      if (bytesRead < 8) break;

      let boxSize = buf.readUInt32BE(0);
      const boxType = buf.toString('ascii', 4, 8);

      // Validate printable ASCII fourcc
      if (!/^[\x20-\x7E]{4}$/.test(boxType)) {
        break;
      }

      if (boxSize === 1) {
        if (bytesRead < 16) break;
        const bigSize = buf.readBigUInt64BE(8);
        boxSize = Number(bigSize);
      } else if (boxSize === 0) {
        boxSize = totalSize - offset;
      }

      atoms.push({ type: boxType.trim(), offset, size: boxSize });
      if (boxType === 'moov' && moovOffset === null) moovOffset = offset;
      if (boxType === 'mdat' && mdatOffset === null) mdatOffset = offset;

      if (boxSize < 8) break;
      offset += boxSize;
    }

    const isIsoBmff = atoms.some((a) => ['ftyp', 'moov', 'mdat', 'wide', 'free'].includes(a.type));
    const faststart = Boolean(isIsoBmff && moovOffset !== null && (mdatOffset === null || moovOffset < mdatOffset));

    return {
      isIsoBmff,
      faststart,
      moovOffset,
      mdatOffset,
      atoms: atoms.map((a) => a.type),
    };
  } catch {
    return { isIsoBmff: false, faststart: false, atoms: [], moovOffset: null, mdatOffset: null };
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // ignore close error
      }
    }
  }
}

function parseFraction(rateStr) {
  if (!rateStr || typeof rateStr !== 'string') return 0;
  if (rateStr.includes('/')) {
    const [num, den] = rateStr.split('/').map(Number);
    if (!den || Number.isNaN(num) || Number.isNaN(den)) return 0;
    return num / den;
  }
  const n = Number(rateStr);
  return Number.isNaN(n) ? 0 : n;
}

function gcd(a, b) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

export function formatDuration(seconds) {
  if (!seconds || !Number.isFinite(seconds)) return '0:00';
  const totalSec = Math.round(seconds);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function inferBitDepth(videoStream) {
  const raw = Number(videoStream?.bits_per_raw_sample);
  if (raw && raw >= 8) return raw;
  const pixFmt = String(videoStream?.pix_fmt ?? '');
  if (/12(le|be)?$/.test(pixFmt) || pixFmt.includes('p12')) return 12;
  if (/10(le|be)?$/.test(pixFmt) || pixFmt.includes('p10') || pixFmt.includes('p010')) return 10;
  return 8;
}

function inferChromaSubsampling(pixFmt = '') {
  if (pixFmt.includes('444') || pixFmt.includes('gbr')) return '4:4:4';
  if (pixFmt.includes('422')) return '4:2:2';
  if (pixFmt.includes('420') || pixFmt === 'nv12' || pixFmt === 'p010le') return '4:2:0';
  return 'unknown';
}

function detectHdr(videoStream) {
  if (!videoStream) return { isHdr: false, format: 'SDR', details: [] };
  const transfer = String(videoStream.color_transfer ?? '').toLowerCase();
  const primaries = String(videoStream.color_primaries ?? '').toLowerCase();
  const space = String(videoStream.color_space ?? '').toLowerCase();
  const sideData = Array.isArray(videoStream.side_data_list) ? videoStream.side_data_list : [];

  const details = [];
  let isHdr = false;
  let format = 'SDR';

  const hasDovi = sideData.some((s) => /dovi|dolby/i.test(String(s.side_data_type ?? '')));
  const hasMasteringDisplay = sideData.some((s) => /mastering display/i.test(String(s.side_data_type ?? '')));
  const hasCll = sideData.some((s) => /content light level/i.test(String(s.side_data_type ?? '')));

  if (hasDovi) {
    isHdr = true;
    format = 'Dolby Vision';
    details.push('Dolby Vision RPU/configuration side data');
  } else if (transfer === 'smpte2084') {
    isHdr = true;
    format = 'HDR10 (PQ / SMPTE ST 2084)';
    details.push('Transfer: smpte2084 (PQ)');
  } else if (transfer === 'arib-std-b67') {
    isHdr = true;
    format = 'HLG (ARIB STD-B67)';
    details.push('Transfer: arib-std-b67 (HLG)');
  } else if (primaries === 'bt2020' || space.startsWith('bt2020')) {
    isHdr = true;
    format = 'Wide Color Gamut (BT.2020)';
    details.push(`Color primaries/space: ${primaries || space}`);
  }

  if (hasMasteringDisplay) details.push('Mastering Display Metadata');
  if (hasCll) details.push('Content Light Level (MaxCLL/MaxFALL)');

  return { isHdr, format, details };
}

/**
 * Inspects a single video file with `ffprobe` and evaluates it against the target preset.
 */
export function inspectMediaFile(filePath, targetPresetId = 'web-standard') {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  const presetsConfig = loadMediaPresets();
  const preset = presetsConfig.presets[targetPresetId] ?? presetsConfig.presets['web-standard'];
  const thresholds = presetsConfig.inspectionThresholds;

  const rawJson = execFileSync(
    'ffprobe',
    ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', absPath],
    { encoding: 'utf8' }
  );
  const probe = JSON.parse(rawJson);
  const format = probe.format ?? {};
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const vStream = streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  const aStream = streams.find((s) => s.codec_type === 'audio');

  const stat = statSync(absPath);
  const sizeBytes = Number(format.size ?? stat.size);
  const durationSec = Number(format.duration ?? vStream?.duration ?? 0);
  const overallBitrateKbps = Math.round(Number(format.bit_rate ?? (durationSec > 0 ? (sizeBytes * 8) / durationSec : 0)) / 1000);

  if (!vStream) {
    return {
      file: absPath,
      fileName: basename(absPath),
      valid: false,
      decision: 'REVIEW',
      reasons: ['No playable video stream found in container.'],
    };
  }

  // Handle rotation metadata if present
  const sideData = Array.isArray(vStream.side_data_list) ? vStream.side_data_list : [];
  const rotationSide = sideData.find((s) => s.rotation !== undefined);
  const rotationTag = Number(vStream.tags?.rotate ?? rotationSide?.rotation ?? 0);
  const swapDims = Math.abs(rotationTag) === 90 || Math.abs(rotationTag) === 270;

  const rawWidth = Number(vStream.width ?? 0);
  const rawHeight = Number(vStream.height ?? 0);
  const width = swapDims ? rawHeight : rawWidth;
  const height = swapDims ? rawWidth : rawHeight;
  const divisor = gcd(width, height);
  const ratioW = Math.round(width / divisor);
  const ratioH = Math.round(height / divisor);
  const aspectNumeric = height > 0 ? width / height : 16 / 9;
  const is16x9 = Math.abs(aspectNumeric - 16 / 9) < 0.04;
  const is9x16 = Math.abs(aspectNumeric - 9 / 16) < 0.04;
  const aspectRatio = is16x9 ? '16:9' : is9x16 ? '9:16' : `${ratioW}:${ratioH}`;
  const orientation = height > width ? 'portrait' : 'landscape';

  const rFps = parseFraction(vStream.r_frame_rate);
  const avgFps = parseFraction(vStream.avg_frame_rate) || rFps;
  const fps = Math.round((avgFps || rFps) * 100) / 100;
  const isVfr = rFps > 0 && avgFps > 0 && Math.abs(rFps - avgFps) / rFps > 0.03;

  const videoBitrateKbps = Math.round(
    Number(vStream.bit_rate ?? Math.max(0, (overallBitrateKbps * 1000) - Number(aStream?.bit_rate ?? 0))) / 1000
  );
  const audioBitrateKbps = aStream ? Math.round(Number(aStream.bit_rate ?? 128000) / 1000) : 0;

  const pixFmt = String(vStream.pix_fmt ?? 'unknown');
  const bitDepth = inferBitDepth(vStream);
  const chroma = inferChromaSubsampling(pixFmt);
  const colorSpace = vStream.color_space ?? 'bt709 (assumed)';
  const colorTransfer = vStream.color_transfer ?? 'bt709 (assumed)';
  const colorPrimaries = vStream.color_primaries ?? 'bt709 (assumed)';
  const colorRange = vStream.color_range ?? 'tv';
  const fieldOrder = vStream.field_order ?? 'progressive';
  const isInterlaced = fieldOrder !== 'progressive' && fieldOrder !== 'unknown';

  const hdr = detectHdr(vStream);
  const boxInfo = inspectIsoBmffBoxes(absPath);
  const ext = extname(absPath).toLowerCase();
  const videoCodec = String(vStream.codec_name ?? 'unknown').toLowerCase();
  const codecTag = String(vStream.codec_tag_string ?? '').toLowerCase();
  const audioCodec = aStream ? String(aStream.codec_name ?? 'unknown').toLowerCase() : 'none';

  // Browser compatibility checks
  const isH264 = videoCodec === 'h264';
  const isHevc = videoCodec === 'hevc' || videoCodec === 'h265';
  const is8Bit420 = bitDepth === 8 && pixFmt === 'yuv420p';
  const isMp4Container = ext === '.mp4' && (format.format_name ?? '').includes('mp4');
  const isAudioWebSafe = !aStream || audioCodec === 'aac' || audioCodec === 'mp3';

  const safariIosPlayable =
    ((isH264 && is8Bit420) || (isHevc && codecTag === 'hvc1')) &&
    (ext === '.mp4' || ext === '.mov' || ext === '.m4v') &&
    isAudioWebSafe &&
    boxInfo.faststart;

  const chromiumPlayable =
    ((isH264 && is8Bit420) || ['vp9', 'av1'].includes(videoCodec)) &&
    ['.mp4', '.webm', '.mov'].includes(ext) &&
    (isAudioWebSafe || audioCodec === 'opus');

  const firefoxPlayable =
    ((isH264 && is8Bit420) || ['vp9', 'av1'].includes(videoCodec)) &&
    ['.mp4', '.webm'].includes(ext) &&
    (isAudioWebSafe || audioCodec === 'opus');

  const universalBrowserPlayable =
    isMp4Container && isH264 && is8Bit420 && isAudioWebSafe && boxInfo.faststart && !hdr.isHdr && !isInterlaced;

  // Target dimension & bitrate envelope
  const maxDim = preset.maxDimensions?.[orientation] ?? { width: 1920, height: 1080 };
  const withinResolution = width <= maxDim.width && height <= maxDim.height;
  const maxBitrateKbps =
    targetPresetId === 'web-high-quality'
      ? thresholds.webHighQualityMaxBitrateKbps
      : preset.maxrateKbps
        ? Math.round(preset.maxrateKbps * 1.15)
        : thresholds.webStandardMaxBitrateKbps;
  const withinBitrate = overallBitrateKbps <= maxBitrateKbps;

  // Determine KEEP / REMUX / TRANSCODE / REVIEW
  let decision = 'TRANSCODE';
  const reasons = [];
  const suggestedActions = [];

  if (hdr.isHdr) {
    decision = 'REVIEW';
    reasons.push(`HDR / Wide-Gamut source detected (${hdr.format}: ${hdr.details.join(', ')}).`);
    reasons.push('Auto-converting HDR to SDR without deliberate tone mapping causes clipped highlights or washed-out colors.');
    suggestedActions.push(
      'Export a Rec.709 (SDR) graded master from DaVinci Resolve / Premiere / Final Cut, OR pass `--tonemap hable` to `pnpm media:encode`.'
    );
  } else if (isInterlaced) {
    decision = 'REVIEW';
    reasons.push(`Interlaced scan detected (field_order="${fieldOrder}").`);
    suggestedActions.push('Deinterlace during encode or re-export as progressive scan.');
  } else if (!is16x9 && !is9x16) {
    decision = 'REVIEW';
    reasons.push(`Non-standard aspect ratio ${aspectRatio} (${width}×${height}) outside portfolio 16:9 / 9:16 system.`);
    suggestedActions.push('Verify whether this cut should be framed in 16:9 or 9:16, or pass `--allow-custom-aspect` if intentional.');
  } else {
    // Standard SDR 16:9 or 9:16 progressive source
    const streamCompliant =
      isH264 &&
      is8Bit420 &&
      withinResolution &&
      withinBitrate &&
      isAudioWebSafe &&
      (preset.audio !== false || !aStream);

    if (streamCompliant && isMp4Container && boxInfo.faststart) {
      decision = 'KEEP';
      reasons.push(
        `Already H.264 8-bit yuv420p SDR in MP4 with +faststart (${width}×${height}, ${overallBitrateKbps} kbps ≤ ${maxBitrateKbps} kbps ceiling).`
      );
      suggestedActions.push('No re-encode needed. Use directly to preserve 100% generation quality.');
    } else if (streamCompliant && (!isMp4Container || !boxInfo.faststart)) {
      decision = 'REMUX';
      if (!isMp4Container) {
        reasons.push(`Streams are web-ready H.264/AAC, but container is "${ext}" instead of ".mp4".`);
      }
      if (!boxInfo.faststart) {
        reasons.push('`moov` atom is placed after `mdat` (missing `+faststart`), which delays HTTP Range playback on Safari/iPhone.');
      }
      suggestedActions.push(
        `Run lossless remux: ffmpeg -i "${basename(absPath)}" -c copy -movflags +faststart output.mp4 (0% quality loss, instant).`
      );
    } else {
      decision = 'TRANSCODE';
      if (!isH264) reasons.push(`Video codec is "${videoCodec}" (target: H.264 / libx264 for universal browser compatibility).`);
      if (!is8Bit420) reasons.push(`Pixel format is "${pixFmt}" (${bitDepth}-bit ${chroma}); browsers require 8-bit yuv420p.`);
      if (!withinResolution) reasons.push(`Resolution ${width}×${height} exceeds ${targetPresetId} max (${maxDim.width}×${maxDim.height}).`);
      if (!withinBitrate) reasons.push(`Bitrate ${overallBitrateKbps} kbps exceeds ${targetPresetId} ceiling (${maxBitrateKbps} kbps).`);
      if (!isAudioWebSafe) reasons.push(`Audio codec is "${audioCodec}" (target: AAC stereo).`);
      if (preset.audio === false && aStream) reasons.push(`Preset "${targetPresetId}" requires muted video (-an), but source has audio.`);
      if (!boxInfo.faststart) reasons.push('Missing `+faststart` (`moov` atom not at front of file).');
      suggestedActions.push(`Transcode with preset: pnpm media:encode --input "${absPath}" --preset ${targetPresetId}`);
    }
  }

  return {
    file: absPath,
    fileName: basename(absPath),
    valid: true,
    targetPreset: targetPresetId,
    container: {
      ext,
      formatName: format.format_name ?? 'unknown',
      majorBrand: format.tags?.major_brand ?? 'unknown',
      sizeBytes,
      sizeFormatted: formatBytes(sizeBytes),
      overallBitrateKbps,
      faststart: boxInfo.faststart,
      moovOffset: boxInfo.moovOffset,
      mdatOffset: boxInfo.mdatOffset,
      atoms: boxInfo.atoms,
    },
    video: {
      codec: videoCodec,
      profile: vStream.profile ?? 'unknown',
      level: vStream.level ?? 'unknown',
      codecTag,
      width,
      height,
      aspectRatio,
      orientation,
      fps,
      rFrameRate: vStream.r_frame_rate,
      avgFrameRate: vStream.avg_frame_rate,
      isVfr,
      durationSec: Math.round(durationSec * 100) / 100,
      durationFormatted: formatDuration(durationSec),
      bitrateKbps: videoBitrateKbps,
      pixFmt,
      bitDepth,
      chromaSubsampling: chroma,
      colorSpace,
      colorTransfer,
      colorPrimaries,
      colorRange,
      fieldOrder,
      isInterlaced,
      hdr,
    },
    audio: aStream
      ? {
          present: true,
          codec: audioCodec,
          profile: aStream.profile ?? 'unknown',
          channels: Number(aStream.channels ?? 0),
          channelLayout: aStream.channel_layout ?? 'unknown',
          sampleRate: Number(aStream.sample_rate ?? 0),
          bitrateKbps: audioBitrateKbps,
        }
      : {
          present: false,
          codec: 'none',
          channels: 0,
          sampleRate: 0,
          bitrateKbps: 0,
        },
    compatibility: {
      universalBrowserPlayable,
      safariIosPlayable,
      chromiumPlayable,
      firefoxPlayable,
    },
    decision,
    reasons,
    suggestedActions,
  };
}

function collectVideoFiles(targetPath) {
  const abs = resolve(targetPath);
  if (!existsSync(abs)) throw new Error(`Path does not exist: ${abs}`);
  const st = statSync(abs);
  if (st.isFile()) return [abs];

  const results = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && VIDEO_EXTS.has(extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
  }
  walk(abs);
  return results.sort();
}

function printInspectionReport(reports) {
  console.log('\n=== Round 03.1 — Media Inspection Report (ffprobe) ===');
  for (const r of reports) {
    if (!r.valid) {
      console.log(`\n✖ ${r.fileName} -> [${r.decision}]`);
      for (const reason of r.reasons) console.log(`  • ${reason}`);
      continue;
    }
    const badge =
      r.decision === 'KEEP'
        ? '✓ KEEP (No re-encode)'
        : r.decision === 'REMUX'
          ? '⚡ REMUX (Lossless copy + faststart)'
          : r.decision === 'REVIEW'
            ? '⚠ REVIEW (Manual / HDR check required)'
            : '⚙ TRANSCODE (Encode needed)';

    console.log(`\n------------------------------------------------------------`);
    console.log(`File          : ${r.fileName}`);
    console.log(`Path          : ${r.file}`);
    console.log(`Decision      : ${badge}`);
    console.log(`Container     : ${r.container.ext} (${r.container.formatName}, brand: ${r.container.majorBrand})`);
    console.log(`Size & Bitrate: ${r.container.sizeFormatted} (${r.container.sizeBytes.toLocaleString()} B) · ${r.container.overallBitrateKbps} kbps total`);
    console.log(`Faststart     : ${r.container.faststart ? 'Yes (moov before mdat)' : 'NO (moov after mdat or missing)'} [atoms: ${r.container.atoms.join(' → ')}]`);
    console.log(`Video Stream  : ${r.video.codec.toUpperCase()} (${r.video.profile}@L${r.video.level}) · ${r.video.width}×${r.video.height} (${r.video.aspectRatio} ${r.video.orientation}) · ${r.video.fps} fps${r.video.isVfr ? ' (VFR)' : ' (CFR)'} · ${r.video.durationFormatted} (${r.video.durationSec}s)`);
    console.log(`Color & Pixel : ${r.video.pixFmt} (${r.video.bitDepth}-bit ${r.video.chromaSubsampling}) · space=${r.video.colorSpace} / transfer=${r.video.colorTransfer} / primaries=${r.video.colorPrimaries}`);
    console.log(`HDR Status    : ${r.video.hdr.isHdr ? `YES — ${r.video.hdr.format}` : 'No (SDR)'}`);
    console.log(
      `Audio Stream  : ${
        r.audio.present
          ? `${r.audio.codec.toUpperCase()} · ${r.audio.channels}ch (${r.audio.channelLayout}) · ${r.audio.sampleRate} Hz · ${r.audio.bitrateKbps} kbps`
          : 'Muted / No audio track'
      }`
    );
    console.log(
      `Browser Ready : Universal=${r.compatibility.universalBrowserPlayable ? 'Yes' : 'No'} | Safari/iOS=${r.compatibility.safariIosPlayable ? 'Yes' : 'No'} | Chrome=${r.compatibility.chromiumPlayable ? 'Yes' : 'No'} | Firefox=${r.compatibility.firefoxPlayable ? 'Yes' : 'No'}`
    );
    console.log(`Analysis      :`);
    for (const reason of r.reasons) console.log(`  • ${reason}`);
    for (const act of r.suggestedActions) console.log(`  → ${act}`);
  }

  const counts = { KEEP: 0, REMUX: 0, TRANSCODE: 0, REVIEW: 0 };
  for (const r of reports) counts[r.decision] = (counts[r.decision] ?? 0) + 1;
  console.log(`\n------------------------------------------------------------`);
  console.log(
    `Summary (${reports.length} file(s)): KEEP=${counts.KEEP} | REMUX=${counts.REMUX} | TRANSCODE=${counts.TRANSCODE} | REVIEW=${counts.REVIEW}`
  );
}

function parseCliArgs(argv) {
  const args = { targets: [], preset: 'web-standard', jsonOut: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preset' && argv[i + 1]) args.preset = argv[++i];
    else if (a === '--json' && argv[i + 1]) args.jsonOut = argv[++i];
    else if (!a.startsWith('-')) args.targets.push(a);
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.targets.length === 0) {
    console.log(`Usage:
  pnpm media:inspect <video-file-or-folder> [--preset web-standard|web-high-quality|hover-preview|hero-ambient] [--json report.json]`);
    process.exit(0);
  }

  const files = [];
  for (const t of args.targets) {
    files.push(...collectVideoFiles(t));
  }

  if (files.length === 0) {
    console.log('No video files found in the specified path(s).');
    process.exit(0);
  }

  const reports = files.map((f) => inspectMediaFile(f, args.preset));
  printInspectionReport(reports);

  if (args.jsonOut) {
    const outPath = resolve(args.jsonOut);
    writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2) + '\n');
    console.log(`\nSaved JSON inspection report to: ${outPath}`);
  }
}

