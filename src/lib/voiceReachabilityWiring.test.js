import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildAiShareFullText } from './aiShareFullText.js';

/*
 * ★配線テスト(v0.1.1330)
 *
 * 会議(4体)が明文化した原則の1つ:
 *   「配線されていない計器は存在しないのと同じ」
 * 実例: judgeValueFreshness() は 2026-08-04 に書かれたのに【どこからも呼ばれず】、
 *   2026-08-11 に同じ誤読(化石値を今の値と誤認)が再発した。
 *
 * ここでは新しい到達可能性計器について
 *   ① 常駐(content)が値を書いているか
 *   ② 状態速報の組み立てが実際に呼んでいるか
 *   ③ 実際に文字列として出力に現れるか(通し検査)
 * の3点を固定する。②だけでは「呼んでいるが出ない」を見逃す。
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, '..', 'extension', 'content-entry.js');
const SHARE = join(HERE, 'aiShareFullText.js');

describe('読み上げ到達可能性の配線', () => {
  const content = readFileSync(CONTENT, 'utf8');
  const share = readFileSync(SHARE, 'utf8');

  it('★常駐(content)が voiceReachRaw を書いている', () => {
    expect(content).toMatch(/voiceReachRaw:\s*\{/);
    expect(content).toMatch(/nlsb-venue-open/);
  });

  it('★publish 経路が2つあるので【両方】に書いている(片方だけは配線漏れ)', () => {
    const hits = content.match(/voiceReachRaw:\s*\{/g) || [];
    expect(hits.length).toBe(2);
  });

  it('★状態速報の組み立てが judgeVoiceReachability を呼んでいる', () => {
    expect(share).toMatch(/import\s*\{\s*judgeVoiceReachability\s*\}/);
    expect(share).toMatch(/judgeVoiceReachability\(\s*\{/);
  });

  it('★fastDiag.content から読んでいる(存在しない変数を参照していない)', () => {
    expect(share).toMatch(/fastDiag\?\.content\?\.voiceReachRaw\?\.venueOpen/);
  });

  /*
   * ★通し検査: 呼んでいても出力に現れなければ意味がない
   *   (memory: verify-output-appears-before-shipping)。
   */
  it('★面が開いていないとき、実際に出力へ行が現れる', () => {
    const out = buildAiShareFullText({
      overviewText: 'x',
      livesData: [],
      fastDiag: { content: { voiceReachRaw: { venueOpen: false } } },
      voiceDiag: { capturedAt: 1, source: 'venue', enabled: true }
    });
    expect(String(out)).toContain('読み上げ到達');
    expect(String(out)).toContain('開いていません');
  });

  it('★会場が開いていて計器が古いとき、不具合として名指しされる', () => {
    const now = Date.now();
    const out = buildAiShareFullText({
      overviewText: 'x',
      livesData: [],
      fastDiag: { content: { voiceReachRaw: { venueOpen: true } } },
      voiceDiag: { capturedAt: now - 30 * 60 * 1000, source: 'venue', enabled: true }
    });
    expect(String(out)).toContain('会場は開いているのに');
  });
});
