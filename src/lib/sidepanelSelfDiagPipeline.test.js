import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTRAS_BATCH_KEYS, pickExtrasBatchValues } from './statusExtrasBatch.js';
import { KEY_SIDEPANEL_SELF_DIAG } from './sidepanelSelfDiagKey.js';
import { buildAiShareFullText } from './aiShareFullText.js';

/**
 * ★サイドパネル自己診断が【storage から状態速報の1行まで実際に届くか】の通し検査。
 *
 * ■ なぜこれが要るか(2026-08-08 の失敗)
 *   v0.1.1295 で自己診断を入れ「これで原因が分かります」と出荷したが、
 *   実機の状態速報に【その行が1つも出なかった】。
 *   真因: status-entry.js の renderAll が引数リストに sidepanelSelfDiag を
 *   持っておらず、呼び出し側が渡しても受け取り側で undefined に落ちていた。
 *   個々の部品(判定関数・整形関数)は緑だったのに、繋がっていなかった。
 *
 *   = [[wiring-test-must-assert-counts]] / v1286-1287 と同型の穴。
 *   「部品が動く」ことと「端から端まで届く」ことは別。だから通しで検査する。
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const statusSrc = fs.readFileSync(
  path.resolve(__dirname, '../extension/status-entry.js'),
  'utf8'
);

const LINE = 'サイドパネル自己診断: 🔴黒くなりうる / v0.1.1295 / 680x1100 / 外✅ iframe🔴 中✅ / 原因=iframeが潰れている(0x0)';

describe('サイドパネル自己診断: storage → 状態速報 の通し', () => {
  it('① extras の読み込みキーに含まれている', () => {
    expect(EXTRAS_BATCH_KEYS).toContain(KEY_SIDEPANEL_SELF_DIAG);
  });

  it('② storage の値が pick で取り出せる', () => {
    const picked = pickExtrasBatchValues({ [KEY_SIDEPANEL_SELF_DIAG]: { line: LINE } }, Date.now());
    expect(picked.sidepanelSelfDiag).toEqual({ line: LINE });
  });

  it('★③ renderAll が引数として受け取っている(ここが抜けて実機で出なかった)', () => {
    // 呼び出し側が渡しても、受け取り側の分割代入に無ければ undefined に落ちる。
    // ★シグネチャの `{ ... }` だけを厳密に切り出して見る。
    //   `+1400文字` のような緩い切り出しだと、後続の【呼び出し側】の同名文字列を
    //   拾ってしまい、受け取りを削る変異を素通しする(実際に素通しさせた)。
    const head = 'function renderAll({';
    const start = statusSrc.indexOf(head);
    expect(start).toBeGreaterThan(0);
    const close = statusSrc.indexOf('})', start);
    expect(close).toBeGreaterThan(start);
    const params = statusSrc.slice(start + head.length, close);
    expect(params).toContain('sidepanelSelfDiag');
  });

  it('★④ renderAll から buildAiShareFullText へ渡している', () => {
    const callIdx = statusSrc.indexOf('buildAiShareFullText({');
    expect(callIdx).toBeGreaterThan(0);
    const call = statusSrc.slice(callIdx, callIdx + 1400);
    expect(call).toContain('sidepanelSelfDiag');
  });

  it('★⑤ 整形結果に実際に1行として現れる(端から端まで)', () => {
    const out = buildAiShareFullText({
      overviewText: 'x',
      livesData: [],
      fastDiag: {},
      popupDiag: {},
      sidepanelSelfDiag: { line: LINE }
    });
    const text = typeof out === 'string' ? out : String(out?.text || '');
    expect(text).toContain('サイドパネル自己診断');
    expect(text).toContain('iframeが潰れている');
  });

  it('自己診断が無い(サイドパネル未使用)なら行を出さない=通常時のノイズにしない', () => {
    const out = buildAiShareFullText({
      overviewText: 'x',
      livesData: [],
      fastDiag: {},
      popupDiag: {},
      sidepanelSelfDiag: null
    });
    const text = typeof out === 'string' ? out : String(out?.text || '');
    expect(text).not.toContain('サイドパネル自己診断');
  });
});
