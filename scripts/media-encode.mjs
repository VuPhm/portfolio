#!/usr/bin/env node
/**
 * Media Preparation & Encoding CLI — Round 03.1
 *
 * Local FFmpeg media preparation pipeline tailored for Mac Intel 16GB:
 *  - Presets: `poster`, `hover-preview`, `hero-ambient`, `web-standard`, `web-high-quality`
 *  - Strictly read-only on master sources (Google Drive folder or local master directory)
 *  - Smart inspection before encode:
 *      • KEEP      → skips re-encode when source is already compliant (or copies/links)
 *      • REMUX     → runs lossless `-c copy -movflags +faststart` when only container/moov needs fixing
 *      • REVIEW    → refuses to blindly strip HDR to SDR unless `--tonemap <hable|mobius|reinhard>` is passed
 *      • TRANSCODE → encodes H.264 MP4 (`yuv420p`), AAC stereo (when audio is needed), `+faststart`
 *  - Preserves 16:9 / 9:16 aspect ratio, NEVER upscales, NEVER alters FPS unless requested
 *  - Sequential execution (`concurrency = 1`) with bounded thread count (`-threads 6`) for Intel 16GB Macs
 *  - Optional `--compare` computes objective before/after quality metrics (SSIM, PSNR, and VMAF)
 *
 * Usage:
 *  pnpm media:encode --input <file-or-dir> [--slug <slug>] [--collection <slug>]
 *                    [--preset poster,hover-preview,web-standard]
 *                    [--crf 20] [--x264-preset slow] [--ss 1.5] [--duration 5]
 *                    [--tonemap hable] [--compare] [--copy-posters]
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, openSync, readSync, closeSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { cpus, freemem, totalmem } from 'node:os';
import { basename, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatBytes, inspectIsoBmffBoxes, inspectMediaFile, loadMediaPresets } from './media-inspect.mjs';

const ROOT = process.cwd();
const DEFAULT_OUT_DIR = join(ROOT, 'media-workspace', 'optimized');
const DEFAULT_MANIFEST_PATH = join(ROOT, 'media-workspace', 'media-manifest.json');
const PUBLIC_POSTERS_DIR = join(ROOT, 'public', 'media', 'posters');

function slugify(input) {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Computes a fast partial + size SHA-256 fingerprint (or full hash for files <= 64 MB)
 * so versioned URLs and source integrity checks are deterministic without stalling on multi-GB masters.
 */
export function computeFileHash8(filePath) {
  const st = statSync(filePath);
  const hash = createHash('sha256');
  const MAX_FULL = 64 * 1024 * 1024;
  if (st.size <= MAX_FULL) {
    hash.update(readFileSync(filePath));
  } else {
    const fd = openSync(filePath, 'r');
    const chunk = Buffer.alloc(4 * 1024 * 1024);
    try {
      const headBytes = readSync(fd, chunk, 0, chunk.length, 0);
      hash.update(chunk.subarray(0, headBytes));
      const tailBytes = readSync(fd, chunk, 0, chunk.length, Math.max(0, st.size - chunk.length));
      hash.update(chunk.subarray(0, tailBytes));
      hash.update(String(st.size));
    } finally {
      closeSync(fd);
    }
  }
  return hash.digest('hex').slice(0, 8);
}

export function checkHardwareResources(presetsConfig) {
  const policy = presetsConfig.hardwarePolicy ?? {};
  const cpuList = cpus();
  const cpuModel = cpuList[0]?.model ?? 'Unknown CPU';
  const logicalCores = cpuList.length || 4;
  const totalRamMb = Math.round(totalmem() / (1024 * 1024));
  const freeRamMb = Math.round(freemem() / (1024 * 1024));
  const recommendedThreads = Math.min(policy.defaultFfmpegThreads ?? 6, Math.max(2, Math.floor(logicalCores * 0.6)));

  return {
    cpuModel,
    logicalCores,
    totalRamMb,
    freeRamMb,
    recommendedThreads,
    concurrency: 1,
    lowMemoryWarning: freeRamMb < (policy.minFreeMemoryMb ?? 1024),
  };
}

/**
 * Builds the non-upscaling video scale filter that preserves 16:9 / 9:16 aspect ratio
 * and guarantees even dimensions required by `yuv420p`.
 */
function buildScaleFilter(sourceWidth, sourceHeight, maxDimensions, orientation) {
  const maxBox = maxDimensions?.[orientation] ?? { width: 1920, height: 1080 };
  const targetW = Math.min(sourceWidth, maxBox.width);
  const targetH = Math.min(sourceHeight, maxBox.height);
  const scaleRatio = Math.min(targetW / sourceWidth, targetH / sourceHeight, 1);
  const outW = Math.max(2, Math.floor((sourceWidth * scaleRatio) / 2) * 2);
  const outH = Math.max(2, Math.floor((sourceHeight * scaleRatio) / 2) * 2);

  if (outW === sourceWidth && outH === sourceHeight && outW % 2 === 0 && outH % 2 === 0) {
    return { filter: null, outW, outH };
  }
  return {
    filter: `scale=${outW}:${outH}:flags=lanczos`,
    outW,
    outH,
  };
}

/**
 * Builds the HDR-to-SDR tone-mapping filter chain when `--tonemap` is explicitly supplied.
 */
function buildTonemapFilter(tonemapMethod = 'hable') {
  const algo = ['hable', 'mobius', 'reinhard', 'linear', 'gamma', 'clip'].includes(tonemapMethod)
    ? tonemapMethod
    : 'hable';
  return [
    'colorspace=all=bt709:trc=linear:iall=bt2020',
    'format=gbrpf32le',
    `tonemap=tonemap=${algo}:desat=0`,
    'colorspace=all=bt709:itrc=linear:iprimaries=bt709:ispace=gbr:format=yuv420p',
  ].join(',');
}

/**
 * Runs objective before/after quality comparison (PSNR, SSIM, and optional VMAF)
 * on the encoded output against the source window.
 */
export function runQualityComparison({
  sourcePath,
  encodedPath,
  startSec = 0,
  durationSec = 5,
  width,
  height,
  threads = 4,
}) {
  const compareDuration = Math.min(durationSec || 6, 8);
  const scaleRef = `scale=${width}:${height}:flags=lanczos,format=yuv420p,setpts=PTS-STARTPTS`;
  const scaleMain = `scale=${width}:${height}:flags=lanczos,format=yuv420p,setpts=PTS-STARTPTS`;

  // 1. Run SSIM + PSNR in a single pass
  const filterGraph = `[0:v]${scaleMain},split=2[d1][d2];[1:v]${scaleRef},split=2[r1][r2];[d1][r1]ssim[s];[d2][r2]psnr[p]`;

  const args = [
    '-hide_banner',
    '-threads',
    String(threads),
    '-t',
    String(compareDuration),
    '-i',
    encodedPath,
    ...(startSec > 0 ? ['-ss', String(startSec)] : []),
    '-t',
    String(compareDuration),
    '-i',
    sourcePath,
    '-lavfi',
    filterGraph,
    '-map',
    '[s]',
    '-map',
    '[p]',
    '-f',
    'null',
    '-',
  ];

  const res = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  const stderr = String(res.stderr ?? '');

  // Parse SSIM All:0.987654 (19.08) or All:0.987654 (19.08 dB)
  const ssimMatch = stderr.match(/SSIM\s+.*All:([0-9.]+)(?:\s*\(([0-9.]+|inf)(?:\s*dB)?\))?/i);
  // Parse PSNR average:42.34
  const psnrMatch = stderr.match(/PSNR\s+.*average:([0-9.]+|inf)/i);

  let vmafScore = null;
  // 2. Try VMAF if libvmaf is available (fast subsample n_subsample=2)
  const vmafGraph = `[0:v]${scaleMain}[dist];[1:v]${scaleRef}[ref];[dist][ref]libvmaf=n_threads=${threads}:n_subsample=2`;
  const vmafArgs = [
    '-hide_banner',
    '-threads',
    String(threads),
    '-t',
    String(compareDuration),
    '-i',
    encodedPath,
    ...(startSec > 0 ? ['-ss', String(startSec)] : []),
    '-t',
    String(compareDuration),
    '-i',
    sourcePath,
    '-lavfi',
    vmafGraph,
    '-f',
    'null',
    '-',
  ];
  const vmafRes = spawnSync('ffmpeg', vmafArgs, { encoding: 'utf8' });
  const vmafStderr = String(vmafRes.stderr ?? '');
  const vmafMatch = vmafStderr.match(/VMAF score:\s*([0-9.]+)/i);
  if (vmafMatch) {
    vmafScore = Number(Number(vmafMatch[1]).toFixed(2));
  }

  return {
    windowSec: compareDuration,
    ssim: ssimMatch ? Number(Number(ssimMatch[1]).toFixed(5)) : null,
    ssimDb: ssimMatch && ssimMatch[2] !== 'inf' ? Number(Number(ssimMatch[2]).toFixed(2)) : null,
    psnrDb: psnrMatch && psnrMatch[1] !== 'inf' ? Number(Number(psnrMatch[1]).toFixed(2)) : null,
    vmaf: vmafScore,
  };
}

/**
 * Encodes a single source file for a specific preset.
 */
export function encodeWithPreset({
  inputPath,
  slug,
  collectionSlug = null,
  presetId,
  outDir = DEFAULT_OUT_DIR,
  crfOverride = null,
  x264PresetOverride = null,
  startSecOverride = null,
  durationSecOverride = null,
  muteOverride = false,
  tonemap = null,
  force = false,
  compare = false,
  copyPostersToPublic = true,
}) {
  const presetsConfig = loadMediaPresets();
  const preset = presetsConfig.presets[presetId];
  if (!preset) {
    throw new Error(`Unknown preset "${presetId}". Available: ${Object.keys(presetsConfig.presets).join(', ')}`);
  }

  const hw = checkHardwareResources(presetsConfig);
  const inspection = inspectMediaFile(inputPath, presetId);
  if (!inspection.valid) {
    throw new Error(`Invalid media file "${inputPath}": ${inspection.reasons.join('; ')}`);
  }

  // Enforce HDR safety rule: never silently convert HDR to SDR without tone-mapping
  if (inspection.video.hdr.isHdr && !tonemap) {
    return {
      presetId,
      status: 'SKIPPED_REVIEW',
      reason: `HDR source detected (${inspection.video.hdr.format}). Refusing automatic SDR conversion without --tonemap <hable|mobius|reinhard>.`,
      inspection,
    };
  }

  const folderScope = collectionSlug ? join('collections', collectionSlug, slug) : join('standalone', slug);
  const targetDir = join(outDir, folderScope);
  mkdirSync(targetDir, { recursive: true });

  const outFileName = `${presetId}${preset.ext}`;
  const outPath = join(targetDir, outFileName);

  const srcW = inspection.video.width;
  const srcH = inspection.video.height;
  const orientation = inspection.video.orientation;
  const srcDuration = inspection.video.durationSec;

  const { filter: scaleFilter, outW, outH } = buildScaleFilter(srcW, srcH, preset.maxDimensions, orientation);
  const vFilters = [];
  if (inspection.video.hdr.isHdr && tonemap) {
    vFilters.push(buildTonemapFilter(tonemap));
  }
  if (scaleFilter) {
    vFilters.push(scaleFilter);
  }

  const startedAt = Date.now();

  // Case 1: Image Poster (`poster` preset)
  if (preset.kind === 'image') {
    const seekSec =
      startSecOverride !== null
        ? Number(startSecOverride)
        : Math.min(Math.max(0, srcDuration * (preset.seekPercent ?? 0.15)), Math.max(0, srcDuration - 0.1));

    const vfChain = [...vFilters];
    const tmpPngPath = `${outPath}.tmp.png`;

    // Extract high-precision PNG frame via FFmpeg, then encode to WebP with `cwebp` (or FFmpeg libwebp)
    const extractPngArgs = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      seekSec.toFixed(2),
      '-i',
      inspection.file,
      '-frames:v',
      '1',
      ...(vfChain.length > 0 ? ['-vf', vfChain.join(',')] : []),
      '-c:v',
      'png',
      tmpPngPath,
    ];

    execFileSync('ffmpeg', extractPngArgs, { stdio: 'inherit' });
    try {
      const cwebpRes = spawnSync(
        'cwebp',
        [
          '-quiet',
          '-q',
          String(preset.quality ?? 82),
          '-m',
          String(preset.compressionLevel ?? 6),
          tmpPngPath,
          '-o',
          outPath,
        ],
        { encoding: 'utf8' }
      );
      if (cwebpRes.status !== 0) {
        // Fallback to ffmpeg libwebp if cwebp is unavailable
        execFileSync(
          'ffmpeg',
          [
            '-y',
            '-hide_banner',
            '-loglevel',
            'error',
            '-i',
            tmpPngPath,
            '-c:v',
            'libwebp',
            '-quality',
            String(preset.quality ?? 82),
            outPath,
          ],
          { stdio: 'inherit' }
        );
      }
    } finally {
      if (existsSync(tmpPngPath)) {
        try {
          unlinkSync(tmpPngPath);
        } catch {
          // ignore cleanup error
        }
      }
    }

    const stat = statSync(outPath);
    const hash8 = computeFileHash8(outPath);

    let publicPosterPath = null;
    if (copyPostersToPublic) {
      mkdirSync(PUBLIC_POSTERS_DIR, { recursive: true });
      const destPoster = join(PUBLIC_POSTERS_DIR, `${slug}.webp`);
      copyFileSync(outPath, destPoster);
      publicPosterPath = `/media/posters/${slug}.webp`;
    }

    return {
      presetId,
      status: 'ENCODED',
      actionTaken: 'EXTRACT_WEBP_POSTER',
      outputPath: outPath,
      publicPosterPath,
      width: outW,
      height: outH,
      orientation,
      sizeBytes: stat.size,
      sizeFormatted: formatBytes(stat.size),
      hash8,
      elapsedMs: Date.now() - startedAt,
    };
  }

  // Case 2: Full-length video preset (`web-standard` / `web-high-quality`) where source is already KEEP or REMUX
  const isClipPreset = Boolean(preset.durationSec);
  if (!isClipPreset && !force && !tonemap && crfOverride === null) {
    if (inspection.decision === 'KEEP') {
      copyFileSync(inspection.file, outPath);
      const stat = statSync(outPath);
      const hash8 = computeFileHash8(outPath);
      return {
        presetId,
        status: 'KEPT',
        actionTaken: 'COPY_COMPLIANT_SOURCE',
        reason: 'Source already satisfies preset codec, pixel format, resolution, bitrate, and faststart.',
        outputPath: outPath,
        width: srcW,
        height: srcH,
        fps: inspection.video.fps,
        durationSec: srcDuration,
        orientation,
        sourceSizeBytes: inspection.container.sizeBytes,
        sizeBytes: stat.size,
        sizeFormatted: formatBytes(stat.size),
        savingsVsFullPercent: 0,
        faststart: true,
        hash8,
        elapsedMs: Date.now() - startedAt,
      };
    }

    if (inspection.decision === 'REMUX') {
      const remuxArgs = [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        inspection.file,
        '-c',
        'copy',
        ...(preset.audio === false || muteOverride ? ['-an'] : []),
        '-movflags',
        '+faststart',
        outPath,
      ];
      execFileSync('ffmpeg', remuxArgs, { stdio: 'inherit' });
      const stat = statSync(outPath);
      const boxCheck = inspectIsoBmffBoxes(outPath);
      const hash8 = computeFileHash8(outPath);
      return {
        presetId,
        status: 'REMUXED',
        actionTaken: 'LOSSLESS_REMUX_FASTSTART',
        reason: 'Source video/audio streams were already compliant; remuxed into MP4 with +faststart (zero quality loss).',
        outputPath: outPath,
        width: srcW,
        height: srcH,
        fps: inspection.video.fps,
        durationSec: srcDuration,
        orientation,
        sourceSizeBytes: inspection.container.sizeBytes,
        sizeBytes: stat.size,
        sizeFormatted: formatBytes(stat.size),
        savingsVsFullPercent: Number(((1 - stat.size / inspection.container.sizeBytes) * 100).toFixed(1)),
        faststart: boxCheck.faststart,
        hash8,
        elapsedMs: Date.now() - startedAt,
      };
    }
  }

  // Case 3: Transcode video (`hover-preview`, `hero-ambient`, `web-standard`, `web-high-quality`)
  const crf = crfOverride !== null ? Number(crfOverride) : preset.crf;
  const x264Preset = x264PresetOverride || preset.x264Preset || 'slow';

  let clipStartSec = 0;
  let clipDurationSec = null;
  if (preset.durationSec) {
    const requestedDur =
      durationSecOverride !== null ? Number(durationSecOverride) : preset.durationSec.default;
    const boundedDur = Math.max(
      preset.durationSec.min,
      Math.min(preset.durationSec.max, requestedDur)
    );
    clipDurationSec = Math.min(boundedDur, srcDuration);
    clipStartSec =
      startSecOverride !== null
        ? Number(startSecOverride)
        : srcDuration > clipDurationSec * 1.4
          ? Number((srcDuration * (preset.seekPercent ?? 0.15)).toFixed(2))
          : 0;
  } else {
    if (startSecOverride !== null) clipStartSec = Number(startSecOverride);
    if (durationSecOverride !== null) clipDurationSec = Number(durationSecOverride);
  }

  const includeAudio = Boolean(preset.audio && !muteOverride && inspection.audio.present);

  const ffmpegArgs = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-threads',
    String(hw.recommendedThreads),
    ...(clipStartSec > 0 ? ['-ss', String(clipStartSec)] : []),
    '-i',
    inspection.file,
    ...(clipDurationSec ? ['-t', String(clipDurationSec)] : []),
    ...(vFilters.length > 0 ? ['-vf', vFilters.join(',')] : []),
    '-c:v',
    preset.videoCodec ?? 'libx264',
    '-pix_fmt',
    preset.pixFmt ?? 'yuv420p',
    '-profile:v',
    preset.profile ?? 'high',
    '-level:v',
    preset.level ?? '4.1',
    '-preset',
    x264Preset,
    '-crf',
    String(crf),
  ];

  // Preserve original frame rate without duplicating or dropping frames unnecessarily
  if (preset.preserveFps !== false) {
    ffmpegArgs.push('-fps_mode', 'passthrough');
  }

  // Adaptive quantization for smooth gradients on dark portfolio backgrounds
  if (preset.aqMode) {
    ffmpegArgs.push('-aq-mode', String(preset.aqMode));
  }
  if (preset.aqStrength) {
    ffmpegArgs.push('-aq-strength', String(preset.aqStrength));
  }

  if (preset.maxrateKbps && preset.bufsizeKbps) {
    ffmpegArgs.push('-maxrate', `${preset.maxrateKbps}k`, '-bufsize', `${preset.bufsizeKbps}k`);
  }

  // Explicitly tag Rec.709 color metadata on SDR outputs so Safari/Chrome render consistent gamma
  if (!inspection.video.hdr.isHdr || tonemap) {
    ffmpegArgs.push(
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-colorspace',
      'bt709'
    );
  }

  if (includeAudio) {
    ffmpegArgs.push(
      '-c:a',
      preset.audioCodec ?? 'aac',
      '-b:a',
      `${preset.audioBitrateKbps ?? 160}k`,
      '-ac',
      String(Math.min(inspection.audio.channels || 2, preset.audioChannels ?? 2)),
      '-ar',
      String(preset.audioSampleRate ?? 48000)
    );
  } else {
    ffmpegArgs.push('-an');
  }

  if (preset.faststart !== false) {
    ffmpegArgs.push('-movflags', '+faststart');
  }

  ffmpegArgs.push(outPath);

  execFileSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });

  const outInspection = inspectMediaFile(outPath, presetId);
  const hash8 = computeFileHash8(outPath);
  const elapsedMs = Date.now() - startedAt;

  // Calculate size comparison relative to the equivalent duration of the source
  const effectiveDuration = clipDurationSec ?? srcDuration;
  const proportionalSourceBytes =
    clipDurationSec && srcDuration > 0
      ? Math.round(inspection.container.sizeBytes * (clipDurationSec / srcDuration))
      : inspection.container.sizeBytes;
  const savingsVsFullPercent = Number(
    ((1 - outInspection.container.sizeBytes / inspection.container.sizeBytes) * 100).toFixed(1)
  );
  const savingsVsWindowPercent = Number(
    ((1 - outInspection.container.sizeBytes / Math.max(1, proportionalSourceBytes)) * 100).toFixed(1)
  );

  let qualityMetrics = null;
  if (compare) {
    qualityMetrics = runQualityComparison({
      sourcePath: inspection.file,
      encodedPath: outPath,
      startSec: clipStartSec,
      durationSec: effectiveDuration,
      width: outW,
      height: outH,
      threads: hw.recommendedThreads,
    });
  }

  return {
    presetId,
    status: 'ENCODED',
    actionTaken: tonemap ? `TRANSCODE_TONEMAP_${tonemap.toUpperCase()}` : 'TRANSCODE_H264',
    outputPath: outPath,
    width: outInspection.video.width,
    height: outInspection.video.height,
    fps: outInspection.video.fps,
    durationSec: outInspection.video.durationSec,
    orientation: outInspection.video.orientation,
    codec: outInspection.video.codec,
    pixFmt: outInspection.video.pixFmt,
    audioCodec: outInspection.audio.codec,
    crf,
    x264Preset,
    faststart: outInspection.container.faststart,
    safariIosPlayable: outInspection.compatibility.safariIosPlayable,
    sourceSizeBytes: inspection.container.sizeBytes,
    sourceBitrateKbps: inspection.container.overallBitrateKbps,
    sizeBytes: outInspection.container.sizeBytes,
    sizeFormatted: outInspection.container.sizeFormatted,
    bitrateKbps: outInspection.container.overallBitrateKbps,
    savingsVsFullPercent,
    savingsVsWindowPercent,
    qualityMetrics,
    hash8,
    elapsedMs,
  };
}

/**
 * Updates the persistent `media-workspace/media-manifest.json` file with master source and rendition records.
 */
export function updateMediaManifest(manifestPath, entryRecord) {
  let manifest = {
    version: '0.3.1',
    updatedAt: new Date().toISOString(),
    items: {},
  };
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      manifest.items = manifest.items || {};
    } catch {
      // reset if malformed
    }
  }

  const prev = manifest.items[entryRecord.slug] ?? {};
  manifest.items[entryRecord.slug] = {
    ...prev,
    ...entryRecord,
    renditions: {
      ...(prev.renditions ?? {}),
      ...(entryRecord.renditions ?? {}),
    },
    updatedAt: new Date().toISOString(),
  };
  manifest.updatedAt = new Date().toISOString();

  mkdirSync(resolve(manifestPath, '..'), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

function parseCliArgs(argv) {
  const args = {
    input: null,
    slug: null,
    collection: null,
    presets: ['poster', 'hover-preview', 'web-standard'],
    outDir: DEFAULT_OUT_DIR,
    manifestPath: DEFAULT_MANIFEST_PATH,
    crf: null,
    x264Preset: null,
    ss: null,
    duration: null,
    mute: false,
    tonemap: null,
    force: false,
    compare: false,
    copyPosters: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--input' || a === '-i') && argv[i + 1]) args.input = argv[++i];
    else if (a === '--slug' && argv[i + 1]) args.slug = slugify(argv[++i]);
    else if (a === '--collection' && argv[i + 1]) args.collection = slugify(argv[++i]);
    else if (a === '--preset' && argv[i + 1]) {
      const raw = argv[++i].trim();
      args.presets =
        raw === 'all'
          ? ['poster', 'hover-preview', 'hero-ambient', 'web-standard', 'web-high-quality']
          : raw.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--out-dir' && argv[i + 1]) args.outDir = resolve(argv[++i]);
    else if (a === '--manifest' && argv[i + 1]) args.manifestPath = resolve(argv[++i]);
    else if (a === '--crf' && argv[i + 1]) args.crf = Number(argv[++i]);
    else if (a === '--x264-preset' && argv[i + 1]) args.x264Preset = argv[++i];
    else if (a === '--ss' && argv[i + 1]) args.ss = Number(argv[++i]);
    else if (a === '--duration' && argv[i + 1]) args.duration = Number(argv[++i]);
    else if (a === '--tonemap' && argv[i + 1]) args.tonemap = argv[++i];
    else if (a === '--mute') args.mute = true;
    else if (a === '--force') args.force = true;
    else if (a === '--compare') args.compare = true;
    else if (a === '--no-copy-posters') args.copyPosters = false;
    else if (!a.startsWith('-') && !args.input) args.input = a;
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.input) {
    console.log(`Usage:
  pnpm media:encode --input <master-video> [--slug <video-slug>] [--collection <collection-slug>]
                    [--preset poster,hover-preview,web-standard | all]
                    [--crf <number>] [--x264-preset <medium|slow>]
                    [--ss <seconds>] [--duration <3..8>]
                    [--tonemap <hable|mobius|reinhard>] [--compare] [--force]`);
    process.exit(0);
  }

  const presetsConfig = loadMediaPresets();
  const hw = checkHardwareResources(presetsConfig);
  console.log('=== Round 03.1 — Media Optimization Pipeline ===');
  console.log(
    `Hardware : ${hw.cpuModel} (${hw.logicalCores} threads, ${hw.totalRamMb} MB RAM, ${hw.freeRamMb} MB free)`
  );
  console.log(
    `Policy   : Sequential batch (concurrency=${hw.concurrency}, ffmpeg -threads ${hw.recommendedThreads}) — safe for 16 GB Intel Mac`
  );
  if (hw.lowMemoryWarning) {
    console.warn(`⚠ Low free memory (${hw.freeRamMb} MB). Close heavy apps before running large 4K batches.`);
  }

  const absInput = resolve(args.input);
  const videoSlug = args.slug || slugify(basename(absInput, extname(absInput)));
  const masterInspection = inspectMediaFile(absInput, 'web-standard');
  const masterHash8 = computeFileHash8(absInput);

  console.log(`\nMaster Source : ${masterInspection.fileName} (${masterInspection.container.sizeFormatted})`);
  console.log(
    `Format        : ${masterInspection.video.codec.toUpperCase()} ${masterInspection.video.width}×${masterInspection.video.height} (${masterInspection.video.aspectRatio} ${masterInspection.video.orientation}) @ ${masterInspection.video.fps} fps · ${masterInspection.video.pixFmt}`
  );
  console.log(`Target Slug   : ${videoSlug}${args.collection ? ` (collection: ${args.collection})` : ' (standalone)'}`);
  console.log(`Presets       : ${args.presets.join(', ')}\n`);

  const renditions = {};
  for (const presetId of args.presets) {
    console.log(`→ Processing preset [${presetId}]...`);
    const result = encodeWithPreset({
      inputPath: absInput,
      slug: videoSlug,
      collectionSlug: args.collection,
      presetId,
      outDir: args.outDir,
      crfOverride: args.crf,
      x264PresetOverride: args.x264Preset,
      startSecOverride: args.ss,
      durationSecOverride: args.duration,
      muteOverride: args.mute,
      tonemap: args.tonemap,
      force: args.force,
      compare: args.compare,
      copyPostersToPublic: args.copyPosters,
    });

    if (result.status === 'SKIPPED_REVIEW') {
      console.warn(`  ⚠ [${presetId}] ${result.reason}`);
      continue;
    }

    const relOut = relative(ROOT, result.outputPath);
    if (presetId === 'poster') {
      console.log(
        `  ✓ [${presetId}] ${result.width}×${result.height} WebP · ${result.sizeFormatted} (${result.elapsedMs} ms) -> ${result.publicPosterPath || relOut
        }`
      );
    } else {
      const qStr = result.qualityMetrics
        ? ` | Quality: SSIM=${result.qualityMetrics.ssim ?? 'n/a'}${result.qualityMetrics.psnrDb ? ` · PSNR=${result.qualityMetrics.psnrDb} dB` : ''
        }${result.qualityMetrics.vmaf ? ` · VMAF=${result.qualityMetrics.vmaf}` : ''}`
        : '';
      console.log(
        `  ✓ [${presetId}] ${result.status} (${result.actionTaken}) · ${result.width}×${result.height} @ ${result.fps}fps · ${result.sizeFormatted} (${result.savingsVsFullPercent}% smaller vs full master) · faststart=${result.faststart} (${result.elapsedMs} ms)${qStr}`
      );
    }

    renditions[presetId] = {
      preset: presetId,
      status: result.status,
      actionTaken: result.actionTaken,
      localPath: relative(ROOT, result.outputPath),
      publicPath: result.publicPosterPath ?? undefined,
      width: result.width,
      height: result.height,
      fps: result.fps,
      durationSec: result.durationSec,
      sizeBytes: result.sizeBytes,
      sizeFormatted: result.sizeFormatted,
      bitrateKbps: result.bitrateKbps,
      crf: result.crf,
      faststart: result.faststart,
      hash8: result.hash8,
      qualityMetrics: result.qualityMetrics ?? undefined,
    };
  }

  updateMediaManifest(args.manifestPath, {
    slug: videoSlug,
    collection: args.collection ?? null,
    orientation: masterInspection.video.orientation,
    aspectRatio: masterInspection.video.aspectRatio,
    durationSec: masterInspection.video.durationSec,
    masterSource: {
      fileName: masterInspection.fileName,
      localPath: absInput,
      sizeBytes: masterInspection.container.sizeBytes,
      sizeFormatted: masterInspection.container.sizeFormatted,
      codec: masterInspection.video.codec,
      pixFmt: masterInspection.video.pixFmt,
      width: masterInspection.video.width,
      height: masterInspection.video.height,
      fps: masterInspection.video.fps,
      hdr: masterInspection.video.hdr.isHdr ? masterInspection.video.hdr.format : false,
      hash8: masterHash8,
    },
    renditions,
  });

  console.log(`\nUpdated media rendition manifest: ${relative(ROOT, args.manifestPath)}`);
}
