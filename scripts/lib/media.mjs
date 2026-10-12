// Shared media pipeline (PLAN.md 4.6 and 4.7). Used by scripts/ig-sync.mjs and scripts/import-reels.mjs.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

export function probe(file) {
  const j = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file]));
  return { w: j.streams[0].width, h: j.streams[0].height, d: +j.format.duration };
}

export const tempDir = (tag) => {
  const d = join(tmpdir(), `${tag}-${process.pid}-${Date.now()}`);
  mkdirSync(d, { recursive: true });
  return d;
};

// Silent grid preview: max 640 px wide (never upscaled), H.264 CRF 29 preset slow, no audio, faststart.
// Grid cards render at most ~430 CSS px wide, so 640 px covers 1.5x screens; rule 14 caps each at 2 MB.
export function transcodeReel(src, outMp4, { maxSeconds = 0, width = 640, crf = 29 } = {}) {
  const trim = maxSeconds > 0 ? ['-t', String(maxSeconds)] : [];
  run('ffmpeg', ['-v', 'error', '-y', '-i', src, ...trim, '-vf', `scale='min(${width},iw)':-2`, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-an', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outMp4]);
  return probe(outMp4);
}

// Full rendition for the watch-with-sound overlay (rule 7): 720 px max, CRF 26, AAC 96 kbps, faststart.
export function transcodeFull(src, outMp4) {
  run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', "scale='min(720,iw)':-2", '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-movflags', '+faststart', outMp4]);
  return probe(outMp4);
}

// Poster (WebP q72) + 24 px LQIP data URI, from a video frame or from an image file.
// Average brightness 0–255 of an image or video frame (1×1 downscale).
export function brightness(file) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  return buf[0] ?? 0;
}

export function posterFrom(input, outWebp, { isImage = false, at = '0.3', width = 540, pick = false } = {}) {
  const tmp = tempDir('poster');
  try {
    const png = join(tmp, 'p.png');
    // pick: let ffmpeg choose the most representative frame of the first 8 s instead of a fixed time.
    if (pick) run('ffmpeg', ['-v', 'error', '-y', '-t', '8', '-i', input, '-vf', 'thumbnail=120', '-frames:v', '1', png]);
    else run('ffmpeg', ['-v', 'error', '-y', ...(isImage ? [] : ['-ss', at]), '-i', input, '-frames:v', '1', png]);
    run('cwebp', ['-quiet', '-q', '70', '-resize', String(width), '0', png, '-o', outWebp]);
    run('cwebp', ['-quiet', '-resize', '24', '0', '-q', '40', png, '-o', join(tmp, 'lq.webp')]);
    return `data:image/webp;base64,${readFileSync(join(tmp, 'lq.webp')).toString('base64')}`;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Hero loops: 16:9 built 3-up from the newest reels (3 segments, 0.4 s crossfades),
// plus a 9:16 one-at-a-time loop for portrait screens. Posters for both.
export function buildHeroLoops(videos, outDir) {
  const tmp = tempDir('hero');
  const pick = (k) => videos[k % videos.length];
  try {
    const seg = (a, b, c, name) =>
      run('ffmpeg', ['-v', 'error', '-y', '-i', pick(a), '-i', pick(b), '-i', pick(c), '-filter_complex',
        '[0]scale=428:-2,crop=428:720[a];[1]scale=428:-2,crop=428:720[b];[2]scale=428:-2,crop=428:720[c];[a][b][c]hstack=3,crop=1280:720,format=yuv420p',
        '-t', '3.4', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-an', '-r', '30', join(tmp, `${name}.mp4`)]);
    seg(0, 1, 2, 'a'); seg(3, 4, 5, 'b'); seg(6, 7, 8, 'c');
    run('ffmpeg', ['-v', 'error', '-y', '-i', join(tmp, 'a.mp4'), '-i', join(tmp, 'b.mp4'), '-i', join(tmp, 'c.mp4'), '-filter_complex',
      '[0][1]xfade=transition=fade:duration=0.4:offset=3[ab];[ab][2]xfade=transition=fade:duration=0.4:offset=6',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(outDir, 'hero-loop.mp4')]);
    const portrait = (i) => `[${i}]scale=720:-2,crop=720:1280,trim=0:2.5,setpts=PTS-STARTPTS,fps=30[p${i}]`;
    run('ffmpeg', ['-v', 'error', '-y', '-i', pick(0), '-i', pick(1), '-i', pick(2), '-filter_complex',
      `${portrait(0)};${portrait(1)};${portrait(2)};[p0][p1]xfade=transition=fade:duration=0.4:offset=2.1[ab];[ab][p2]xfade=transition=fade:duration=0.4:offset=4.2,scale=480:854,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-movflags', '+faststart', '-an', join(outDir, 'hero-loop-portrait.mp4')]);
    for (const h of ['hero-loop', 'hero-loop-portrait']) posterFrom(join(outDir, `${h}.mp4`), join(outDir, `${h}.webp`), { at: '0.5' });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return {
    landscape: { video_url: `${outDir}/hero-loop.mp4`, poster_url: `${outDir}/hero-loop.webp`, width: 1280, height: 720 },
    portrait: { video_url: `${outDir}/hero-loop-portrait.mp4`, poster_url: `${outDir}/hero-loop-portrait.webp`, width: 480, height: 854 },
    showreel: null,
  };
}

// Lane from caption hashtags; data/overrides.json can force a lane per media id.
export function laneFor(caption = '', id = '', overrides = {}) {
  if (overrides[id]) return overrides[id];
  const c = caption.toLowerCase();
  if (/#(ad|ads|advert\w*|commercial|פרסומת|פרסומות)\b/.test(c)) return 'ads';
  if (/#(comedy|funny|skit|קומדיה|מצחיק)\b/.test(c)) return 'comedy';
  if (/#(sport|sports|football|soccer|basketball|ספורט|כדורגל|כדורסל)\b/.test(c)) return 'sport';
  return 'reels';
}
