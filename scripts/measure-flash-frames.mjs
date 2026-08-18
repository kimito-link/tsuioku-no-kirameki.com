#!/usr/bin/env node
/**
 * measure-flash-frames.mjs — 「一瞬の黒」を【画面に出たピクセル】で測る。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ なぜ要るか(2026-08-18 ユーザー:「でははかれるほうほうさがして」)
 *   ★これまでの計器(CDP/getComputedStyle)は【拡張のDOM】しか読めない。
 *     実測でも「1フレーム目からクリーム色」と出るのに、目視では黒が見える。
 *     ＝黒は拡張のDOMより手前、Chromeが合成して塗る面にある。
 *   ★DOMを読む道具では原理的に捉えられない。
 *     だから【画面そのものを録画してフレームを数える】。
 *
 * ■ 何を測るか
 *   ffmpeg gdigrab で画面の一部を 60fps(実測)・可逆(-qp 0)で録り、
 *   1フレームずつ平均輝度を出して「暗いフレームが何枚続いたか」を数える。
 *   ★1フレーム = 16.7ms。人が見える黒は必ず1枚以上残る。
 *
 * ■ 使い方
 *   1) 録る:  node scripts/measure-flash-frames.mjs record --sec 6 --rect 1200,80,520,900
 *   2) 数える: node scripts/measure-flash-frames.mjs analyze
 *   (record は録画開始してから操作する。開始の合図を標準出力に出す)
 *
 *
 * ■ ★なぜ blackdetect を使わないか(2026-08-18 世界調査→実機で裏取り済)
 *   ffmpeg の blackdetect フィルタは `d`(最小検出長)の既定が【2秒】。
 *   このまま使うと【200ms の黒は1件も報告されず「黒は無かった」と誤結論】になる。
 *   ★ここでは signalstats で【全フレームの輝度を数える】のでこの罠にかからない。
 *
 * ■ ★取り方の選択(実機で両方を比べて確認済)
 *   gdigrab … 実測60fps。全モニタをまたぐ。★本機では内容を正しく取れた
 *              (「GDIはGPU合成面を黒く返すことがある」という一般論はこの環境では再現しなかった)。
 *   ddagrab … Desktop Duplication API。実測約86fps。1画面単位。
 *   ★両方で同じ領域を撮って平均輝度が一致(35.8/35.8)し、
 *     実画像でも両方ともアプリの中身が正しく写っていた。
 *   ★迷ったら --dda を使う(合成後を取るのが仕様上確実なのはこちら)。
 *
 * ■ ★この計器の最大の罠(2026-08-18 実際に2回踏んだ)
 *   座標を固定で渡すので、【別の窓が手前に来るだけで別のものを測る】。
 *   実際に起きたこと:
 *     1回目 = Claude Code の窓を測って darkFrames=101 を出した
 *     2回目 = X(Twitter) の窓を測って darkFrames=255 を出した
 *   ★どちらも【数字は出た】。数字が出ることは正しさの証拠にならない。
 *   [[measure-the-region-you-claim-2026-08-10]]
 *   → 対策: record は必ず【最初の1枚を first.png に残す】。
 *      analyze は first.png を見ていないので、人間(またはAI)が
 *      【目で領域を確かめてから】数字を使うこと。
 * ■ ★判定は構造で返す(文字列に閉じない) [[judgement-trapped-in-a-string-2026-08-15]]
 * @module measure-flash-frames
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('.artifacts/flash');
const CLIP = path.join(OUT_DIR, 'clip.mkv');
const SIGNAL = path.join(OUT_DIR, 'signal.txt');
/** ★録画開始時の1枚。【測る場所が合っているか】を目で確かめるため。 */
const FIRST = path.join(OUT_DIR, 'first.png');

/** 暗いと見なす平均輝度の上限(0-255)。地の色 #fffaf2 は ~250。黒は ~0-40。 */
export const DARK_LUMA_MAX = 60;
/** 「明るい(正常に描けている)」と見なす下限。 */
export const BRIGHT_LUMA_MIN = 150;

/**
 * signalstats の平均輝度(YAVG)の系列から、暗い区間を切り出す。
 * ★純関数。ffmpeg も fs も触らない = テストできる。
 *
 * @param {ReadonlyArray<{n:number, t:number, yavg:number}>} frames
 * @param {{darkMax?:number, brightMin?:number}} [opts]
 * @returns {{
 *   frames:number, darkFrames:number,
 *   runs:Array<{startFrame:number, endFrame:number, startMs:number, ms:number, minYavg:number}>,
 *   longestMs:number, verdict:'no-dark'|'dark'
 * }}
 */
export function findDarkRuns(frames, opts = {}) {
  const darkMax = Number.isFinite(opts.darkMax) ? opts.darkMax : DARK_LUMA_MAX;
  const list = Array.isArray(frames) ? frames : [];
  const runs = [];
  let cur = null;
  for (const f of list) {
    const dark = Number(f?.yavg) <= darkMax;
    if (dark) {
      if (!cur) cur = { startFrame: f.n, endFrame: f.n, startMs: Math.round(f.t * 1000), minYavg: f.yavg };
      else { cur.endFrame = f.n; cur.minYavg = Math.min(cur.minYavg, f.yavg); }
    } else if (cur) {
      cur.ms = Math.round((f.t * 1000) - cur.startMs);
      runs.push(cur); cur = null;
    }
  }
  if (cur) { cur.ms = 0; runs.push(cur); }
  const darkFrames = list.filter((f) => Number(f?.yavg) <= darkMax).length;
  const longestMs = runs.reduce((m, r) => Math.max(m, r.ms || 0), 0);
  return {
    frames: list.length,
    darkFrames,
    runs,
    longestMs,
    verdict: darkFrames > 0 ? 'dark' : 'no-dark'
  };
}

/** ffmpeg の signalstats メタデータ出力を解析する。★純関数。 */
export function parseSignalstats(text) {
  const out = [];
  const blocks = String(text ?? '').split('[FRAME]');
  let n = 0;
  for (const b of blocks) {
    const t = /pts_time=([0-9.]+)/.exec(b);
    const y = /lavfi\.signalstats\.YAVG=([0-9.]+)/.exec(b);
    if (!t || !y) continue;
    out.push({ n: n++, t: Number(t[1]), yavg: Number(y[1]) });
  }
  return out;
}

/**
 * Windows のパスを lavfi の movie= に渡せる形にする。
 * ★lavfi はコロンを引数区切りに使うので `C:` をエスケープする必要がある。
 */
export function lavfiPath(p) {
  const bs = String.fromCharCode(92);
  return String(p ?? '').split(bs).join('/').split(':').join(bs + ':');
}

// ── ここから下は CLI(実行部) ─────────────────────────────────────────────
const isMain = process.argv[1] && process.argv[1].endsWith('measure-flash-frames.mjs');
if (!isMain) { /* import されただけ */ }
else {
  const cmd = process.argv[2] || 'help';
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
  };

  if (cmd === 'record') {
    const sec = String(Number(arg('sec', '6')) || 6);
    const rect = String(arg('rect', '')).split(',').map((s) => Number(s.trim()));
    mkdirSync(OUT_DIR, { recursive: true });
    rmSync(CLIP, { force: true });
    const useDda = process.argv.includes('--dda');
    const fps = String(Number(arg('fps', useDda ? '120' : '60')) || 60);
    /** @type {string[]} */ let a;
    if (useDda) {
      const parts = ['ddagrab=framerate=' + fps, 'draw_mouse=0'];
      if (rect.length === 4 && rect.every(Number.isFinite)) {
        parts.push('offset_x=' + rect[0], 'offset_y=' + rect[1], 'video_size=' + rect[2] + 'x' + rect[3]);
      }
      a = ['-hide_banner', '-loglevel', 'error', '-init_hw_device', 'd3d11va',
           '-filter_complex', parts.join(':') + ',hwdownload,format=bgra'];
    } else {
      a = ['-hide_banner', '-loglevel', 'error', '-f', 'gdigrab', '-framerate', fps];
      if (rect.length === 4 && rect.every(Number.isFinite)) {
        a.push('-offset_x', String(rect[0]), '-offset_y', String(rect[1]),
               '-video_size', `${rect[2]}x${rect[3]}`);
      }
      a.push('-i', 'desktop');
    }
    a.push('-t', sec, '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', CLIP);
    // ★測る前に【何を映しているか】を必ず1枚残す(領域違いを目で止める)
    //   ★入力指定部分だけを使い、出力指定(-t 以降)は捨てる。
    try {
      const tAt = a.indexOf('-t');
      const inputOnly = tAt > -1 ? a.slice(0, tAt) : a.slice();
      spawnSync('ffmpeg', inputOnly.concat(['-frames:v', '1', '-y', FIRST]), { encoding: 'utf8' });
    } catch { /* 確認用なので失敗しても録画は続ける */ }
    const p = spawn('ffmpeg', a, { stdio: 'inherit' });
    writeFileSync(SIGNAL, 'recording\n');
    console.log(`RECORDING ${sec}s → ${CLIP}`);
    console.log(`★確認用: ${FIRST} を見て、測りたいものが写っているか必ず確かめる`);
    p.on('exit', (c) => { console.log(`DONE rc=${c}`); process.exit(c ?? 0); });
  } else if (cmd === 'analyze') {
    if (!existsSync(CLIP)) { console.error(`no clip: ${CLIP}`); process.exit(2); }
    const r = spawnSync('ffprobe', [
      '-v', 'error', '-f', 'lavfi',
      'movie=clip.mkv,signalstats',
      '-show_entries', 'frame=pkt_pts_time,pts_time:frame_tags=lavfi.signalstats.YAVG',
      '-of', 'default'
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd: OUT_DIR });
    const frames = parseSignalstats(r.stdout);
    // ★計器が何も読めていないのを「黒無し」と報告しない
    //   [[zero-count-may-mean-unmeasured-2026-08-04]]
    if (frames.length === 0) {
      console.error(JSON.stringify({ error: 'unmeasured', hint: 'ffprobeからフレームを読めなかった', stderr: String(r.stderr || '').slice(0, 400) }, null, 2));
      process.exit(3);
    }
    const res = findDarkRuns(frames);
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log('usage: measure-flash-frames.mjs record [--dda] [--fps N] --sec 6 --rect X,Y,W,H | analyze');
  }
}
