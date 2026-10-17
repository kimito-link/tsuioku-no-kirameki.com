import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 2026-10-17: 応援コメント100件のお祝いの配線の固定。
 *   (1) 会場が購読済みの記録件数(panelSummarySnap の更新)ごとに noteCheerCount を呼ぶ=3か所(開いた直後の catch-up・ポーリング・onChanged)
 *   (2) noteCheerCount は resolveCommentCheer の結果で charaLive.cheer を呼ぶ(結果が使われている)
 *   (3) 配信切替で基準を取り直す (4) 会場が開いている間は既存シャワーの中継を止める(3人だけ)
 *   ここが崩れると、画面は同じに見えたまま「100件でも3人が反応しない」/「シャワーと3人が二重」が静かに起きる。
 */
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').split('\r\n').join('\n');
const venue = read('../extension/venueBar.js');
const content = read('../extension/content-entry.js');

describe('venueBar: 節目でゆっくり3人がお祝いする配線', () => {
  it('★panelSummarySnap を更新する3か所すべてで、更新の直後に noteCheerCount() を呼ぶ', () => {
    const sites = [...venue.matchAll(/panelSummarySnap = \/\*\* @type \{Record<string, unknown>\} \*\/ \((?:panelSnap|panelChange\.newValue)\);\n(\s*)_panelSummaryLastSeenAt = Date\.now\(\);\n\s*noteCheerCount\(\);/g)];
    expect(sites).toHaveLength(3);
  });
  it('★noteCheerCount は resolveCommentCheer の結果で charaLive.cheer を呼ぶ(結果が使われる・失敗は握る)', () => {
    const at = venue.indexOf('const noteCheerCount = () => {');
    expect(at).toBeGreaterThan(0);
    const body = venue.slice(at, at + 700);
    expect(body).toContain('resolveCommentCheer(cheerPrevCount, selectDisplayRecordedCount(panelSummarySnap))');
    expect(body).toContain('cheerPrevCount = r.baseline;');
    expect(body).toContain('if (r.cheer) charaLive.cheer({ milestone: r.cheer.milestone });');
    expect(body).toContain('catch');
    // 配信が変わったら基準を取り直す
    expect(body).toContain("if (lid !== cheerLiveId) { cheerLiveId = lid; cheerPrevCount = null; }");
  });
  it('★配信切替(resetSpeechTracking)でも基準を取り直す・手動確認フックがある', () => {
    expect(venue).toContain('cheerPrevCount = null; // お祝いの基準も取り直す');
    expect(venue).toContain('__nls_chara_cheer_probe__ = (n = 100) => ({ started: charaLive.cheer({ milestone: Number(n) }) });');
  });
});

describe('content-entry: 会場を開いている間は100件以上のシャワーを止める(3人だけ)', () => {
  it('★中継(playWatchCelebrationRelay)の【前】に shouldSkipShowerForCheer で止める・会場が閉じていれば止めない(第2引数は開閉の実状態)', () => {
    const skip = content.indexOf("if (shouldSkipShowerForCheer(msg.payload, document.documentElement.classList.contains('nlsb-venue-open'))) {");
    const relay = content.indexOf('playWatchCelebrationRelay(\n        document,\n        msg.payload,');
    expect(skip).toBeGreaterThan(0);
    expect(relay).toBeGreaterThan(skip);
    expect(content.slice(skip, relay)).toContain("skipped: 'venue_cheer'");
  });
});
