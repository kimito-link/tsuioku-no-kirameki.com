import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 発言パネルにギフト・広告の応援を出す配線(v0.1.1658)。
 *   ユーザー(2026-10-18):「これはコメントですが、広告とかギフトも対応させたい」。
 *   ギフトだけ・広告だけの人をクリックしても「まだ発言がありません」だけが出ていた。
 *   値はタイル3行目(data-stats)をそのまま使う=新しい取得・別の集計を作らない。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/venueBar.js'), 'utf8').replace(/\r\n/g, '\n');
const iClick = src.indexOf('const wireSpeechPanelDelegation = (host) => {');
const click = src.slice(iClick, src.indexOf('wireSpeechPanelDelegation(seatsHost);', iClick));
const iOpen = src.indexOf('const openSpeechPanelFor = async (who) => {');
const open = src.slice(iOpen, src.indexOf('const toggleRosterPanel', iOpen));

describe('発言パネルの応援(ギフト・広告)', () => {
  it('★クリックしたタイルの data-stats を読んで渡す(新しい取得なし)', () => {
    expect(iClick).toBeGreaterThan(0);
    expect(click).toContain("querySelector('[data-stats]')");
    expect(click).toContain('statsText');
  });

  it('★パネルは応援の一行を出し、0件の文言も応援の有無で変える', () => {
    expect(iOpen).toBeGreaterThan(0);
    expect(open).toContain('speechSupportLine(statsText)');
    expect(open).toContain('speechEmptyMessage(statsText)');
    expect(open).toContain('nlsb-speech-support');
  });

  it('★固定の「まだ発言がありません」を直書きに戻さない(応援している人に出さない)', () => {
    expect(open).not.toContain('<div class="nlsb-roster-empty">この配信の記録にはまだ発言がありません</div>');
  });

  it('★1回ごとの明細や追加の storage 読みを足さない(この版は表示だけ)', () => {
    expect(open).not.toContain('nls_gift_history_throws');
    expect(open).not.toContain('giftHistory');
  });
});
