// Captures story/story.html frame by frame (1080x1920, 30 fps), mixes the audio and encodes the Story.
//   node story/render.mjs --stills 1.0,3.2,8.4     review stills -> story/out/still-<t>.jpg
//   node story/render.mjs                           all frames -> story/work/frames, then story/out/*.mp4
//   node story/render.mjs --encode-only             re-encode and re-mix from the frames already captured
// Needs story/work/{site,hook,pop,site.json,logo.svg,music.wav}: node story/record-site.mjs, plus the frame folders.
import { chromium } from 'playwright';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { serve } from '../scripts/serve.mjs';

const FPS = 30, DURATION = 12.0, FRAMES = Math.round(FPS * DURATION);
const PAYOFF = { src: 'media/ig/17901612813374816.full.mp4', from: 27.0, at: 7.0, len: 2.5 };   // the Reel's own audio
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const stills = arg('--stills')?.split(',').map(Number);
const ENCODE_ONLY = process.argv.includes('--encode-only');
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

if (!ENCODE_ONLY) {
const server = await serve(4199, process.cwd());
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto('http://localhost:4199/story/story.html', { waitUntil: 'networkidle' });
const data = await page.evaluate(() => window.ready);
if (!data) throw new Error('Narkiss did not load (Adobe kit)');
console.log(`data: ${data.reels} Reels, ${data.total} views, hook running totals ${data.cum.join(' / ')}`);

const shoot = async (t, path) => {
  await page.evaluate((t) => window.render(t), t);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path, type: 'jpeg', quality: 96 });
};

mkdirSync('story/out', { recursive: true });
if (stills) {
  for (const t of stills) { await shoot(t, `story/out/still-${t.toFixed(1)}.jpg`); console.log(`story/out/still-${t.toFixed(1)}.jpg`); }
  await browser.close(); server.close(); process.exit(0);
}
rmSync('story/work/frames', { recursive: true, force: true }); mkdirSync('story/work/frames', { recursive: true });
for (let i = 0; i < FRAMES; i++) {
  await shoot(i / FPS, `story/work/frames/${String(i).padStart(4, '0')}.jpg`);
  if (i % 60 === 0) console.log(`frame ${i}/${FRAMES}`);
}
await browser.close(); server.close();
}

// Picture: H.264 High, CRF 16, yuv420p, bt709, faststart.
const VIDEO = ['-vf', 'scale=out_range=tv:out_color_matrix=bt709,format=yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p',
  '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709:range=tv', '-movflags', '+faststart'];
ff(['-framerate', String(FPS), '-i', 'story/work/frames/%04d.jpg', ...VIDEO, '-an', 'story/out/bfain-launch-story.mp4']);
console.log('story/out/bfain-launch-story.mp4');

// Sound: music.wav is 120 BPM with its main drop at 7.94 s. Build 4.44-7.44 under 0-3.0 (hits on the cuts), a real
// silence 3.0-3.5 (the freeze), 7.94-13.94 from the drop at 3.5 (ducked 18 dB under the payoff's own audio 7.0-9.5),
// then the track's last bar and its decay (69.94-72.44) under the end card 9.5-12.0. Two-pass loudnorm to
// -15 LUFS / -1.5 dBTP.
if (existsSync('story/work/music.wav')) {
  const p = PAYOFF;
  const graph =
    '[0:a]atrim=4.44:7.44,asetpts=PTS-STARTPTS,afade=t=out:st=2.985:d=0.015[a];' +
    "[0:a]atrim=7.94:13.94,asetpts=PTS-STARTPTS,volume='if(lt(t,3.4),1,if(lt(t,3.5),1-(t-3.4)*8.7,0.13))':eval=frame,adelay=3500|3500[b];" +
    '[0:a]atrim=69.94:72.44,asetpts=PTS-STARTPTS,afade=t=in:d=0.02,adelay=9500|9500[d];' +
    `[1:a]atrim=${p.from}:${p.from + p.len},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:d=0.03,afade=t=out:st=${p.len - 0.08}:d=0.08,adelay=${p.at * 1000}|${p.at * 1000}[r];` +
    `[a][b][d][r]amix=inputs=4:normalize=0:duration=longest,atrim=0:${DURATION},afade=t=out:st=${DURATION - 0.25}:d=0.25,aformat=sample_rates=48000:channel_layouts=stereo[m]`;
  ff(['-i', 'story/work/music.wav', '-i', p.src, '-filter_complex', graph, '-map', '[m]', '-t', String(DURATION), '-c:a', 'pcm_s16le', 'story/work/mix.wav']);
  const out = spawnSync('ffmpeg', ['-hide_banner', '-i', 'story/work/mix.wav', '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const i0 = out.lastIndexOf('{'), j = JSON.parse(out.slice(i0, out.indexOf('}', i0) + 1));
  const ln = `loudnorm=I=-15:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  ff(['-i', 'story/out/bfain-launch-story.mp4', '-i', 'story/work/mix.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
    '-af', `${ln},aresample=48000`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest', 'story/out/bfain-launch-story-music.mp4']);
  // AAC and the linear loudnorm mode can land a little off target: measure the encoded file and correct the gain
  // once (never above -1.5 dBTP).
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', 'story/out/bfain-launch-story-music.mp4', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const I = +r.match(/I:\s+(-?[\d.]+) LUFS(?![\s\S]*I:)/)[1], TP = +r.match(/True peak:\s+Peak:\s+(-?[\d.]+)/)[1];
  const gain = Math.min(-15 - I, -1.5 - TP);
  if (Math.abs(gain) > 0.15) {
    ff(['-i', 'story/out/bfain-launch-story.mp4', '-i', 'story/work/mix.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
      '-af', `${ln},volume=${gain.toFixed(2)}dB,aresample=48000`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest', 'story/out/bfain-launch-story-music.mp4']);
  }
  console.log(`story/out/bfain-launch-story-music.mp4 (measured ${I} LUFS, ${TP} dBTP; gain ${gain.toFixed(2)} dB)`);
}
