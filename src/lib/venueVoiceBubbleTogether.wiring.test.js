import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// 2026-11-25: 見えている会場が読み手になる配線(声と吹き出しを同じ文書で合わせるため)。
//   Background(SW)はモジュールを読まないので、表の規則は lib(voiceReaderLease.js)と同じものを手で持つ。
const read = (p) => fs.readFileSync(path.resolve(p), 'utf8');

describe('読み手の優先度の配線', () => {
  it('会場: 開いていて畳んでおらず見えている時だけ優先度1、譲ったら待ちの声を捨てる', () => {
    const src = read('src/extension/venueBar.js');
    const start = src.indexOf('const venueReaderLease = startVoiceReaderLease(');
    const body = src.slice(start, src.indexOf('});', start));
    expect(start).toBeGreaterThan(0);
    expect(body).toContain("priority: () => (open === true && tucked !== true && !isPageHidden() ? VOICE_READER_PRIO_VISIBLE : VOICE_READER_PRIO_HEADLESS)");
    expect(body).toContain('onLost: () => { try { voicePlayer.flushPendingQueue(); }');
  });
  it('会場: コメントが速い間(熱量)を吹き出しと声の同期に渡す(声を待たせる上限6秒)', () => {
    const src = read('src/extension/venueBar.js');
    const start = src.indexOf('const shownNow = startVenueSpeechBubbleVoice(_bubbleVoiceSync, speech, {');
    expect(start).toBeGreaterThan(0);
    expect(src.slice(start, start + 600)).toContain('busyChat: isVenueBusyForCalm(crowdHeatLevel),');
  });
  it('コメビュは見えている読み手', () => {
    const src = read('src/extension/comeview-entry.js');
    const start = src.indexOf('const _voiceReaderLease = startVoiceReaderLease(');
    expect(src.slice(start, src.indexOf('});', start))).toContain('priority: () => VOICE_READER_PRIO_VISIBLE');
  });
  for (const file of ['extension/background.js', 'extension-youtube/src/background-nico-relay.js']) {
    it(`${file}: 表は優先度の高い名乗りに引き継ぐ(lib と同じ規則)`, () => {
      const src = read(file);
      expect(src).toContain('const prio = Number(msg.prio) > 0 ? 1 : 0;');
      expect(src).toContain('prio > (Number(cur.prio) || 0)) voiceReaderByLive.set(lv, { holder, at: now, prio });');
    });
  }
});
