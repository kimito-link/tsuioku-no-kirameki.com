/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { buildVenueStatStripModel, createVenueStatStrip, VENUE_STAT_STRIP_STALE_MS } from './venueStatStrip.js';
import { buildStatCardsMirrorSnapshot } from './statCardsMirror.js';

const NOW = 1_800_000_000_000;

/** パネルが実際に書く形(本物の buildStatCardsMirrorSnapshot で作る=形を似せて自作しない) */
function mirror(over = {}) {
  const snap = buildStatCardsMirrorSnapshot(
    {
      liveId: 'lv123',
      recordsText: '81',
      concurrent: { estText: '108', estIsPlaceholder: false, subText: '直接値' },
      visitor: { text: '350', isPlaceholder: false }
    },
    { nowMs: NOW - 5_000 }
  );
  snap.official = {
    summaryText: '',
    viewers: { text: '1,234', isPlaceholder: false },
    comments: { text: '567', isPlaceholder: false },
    streamAge: { text: '2時間36分', isPlaceholder: false },
    adPts: { text: '300', isPlaceholder: false },
    giftPts: { text: '1,200', isPlaceholder: false },
    eventGiftPts: { text: '', isPlaceholder: true },
    eventRank: { text: '', isPlaceholder: true },
    eventTitle: { text: '', isPlaceholder: true }
  };
  return { ...snap, ...over };
}
const byKey = (m) => Object.fromEntries(m.items.map((i) => [i.key, i]));

describe('buildVenueStatStripModel', () => {
  it('新しい鏡ならパネルと同じ文字をそのまま出す(8つ・順番も横の欄と同じ)', () => {
    const m = buildVenueStatStripModel(mirror(), { liveId: 'LV123', nowMs: NOW, recordedCount: 999 });
    expect(m.source).toBe('mirror');
    expect(m.stale).toBe(false);
    expect(m.items.map((i) => i.label)).toEqual(['記録', '推定同時接続', '来場者数', '来場', '本家コメ', '経過', '広告pt', 'ギフトpt']);
    const k = byKey(m);
    expect(k.records.text).toBe('81'); // 鏡が新しいうちは鏡(=パネルの表示)が正
    expect(k.concurrent.text).toBe('108');
    expect(k.concurrent.unit).toBe('直接値');
    expect(k.visitor.text).toBe('350');
    expect(k.viewers.text).toBe('1,234');
    expect(k.comments.text).toBe('567');
    expect(k.streamAge.text).toBe('2時間36分');
    expect(k.giftPts.text).toBe('1,200');
  });

  it('別の配信の鏡は使わない(記録だけは正本の件数で出す)', () => {
    const m = buildVenueStatStripModel(mirror({ liveId: 'lv999' }), { liveId: 'lv123', nowMs: NOW, recordedCount: 1500 });
    const k = byKey(m);
    expect(m.source).toBe('fallback');
    expect(k.records.text).toBe('1,500');
    expect(k.concurrent.text).toBe('—');
    expect(k.concurrent.isPlaceholder).toBe(true);
    expect(k.streamAge.text).toBe('—');
  });

  it('パネルが閉じて鏡が古い: 記録は正本で動き続け・経過は「—」・ほかは最後の値で stale', () => {
    const m = buildVenueStatStripModel(mirror({ capturedAt: NOW - VENUE_STAT_STRIP_STALE_MS - 1 }), { liveId: 'lv123', nowMs: NOW, recordedCount: 90 });
    const k = byKey(m);
    expect(m.stale).toBe(true);
    expect(m.source).toBe('fallback');
    expect(k.records.text).toBe('90');
    expect(k.streamAge.text).toBe('—');
    expect(k.concurrent.text).toBe('108');
  });

  it('鏡も件数も無い: 全部「—」(空白や undefined を出さない)', () => {
    const m = buildVenueStatStripModel(null, { liveId: 'lv123', nowMs: NOW });
    expect(m.source).toBe('none');
    for (const it of m.items) {
      expect(it.text).toBe('—');
      expect(it.isPlaceholder).toBe(true);
      expect(it.unit).toBe('');
    }
  });

  it('壊れた鏡(フィールドが無い・型違い)でも落ちない', () => {
    const m = buildVenueStatStripModel({ liveId: 'lv123', capturedAt: NOW, concurrent: 'x', official: 5 }, { liveId: 'lv123', nowMs: NOW });
    expect(m.items).toHaveLength(8);
    expect(byKey(m).concurrent.text).toBe('—');
  });
});

describe('createVenueStatStrip', () => {
  it('描いた値が DOM に入り、同じ値なら描き直さない(ちらつかない)', () => {
    const strip = createVenueStatStrip(document, { faces: { link: 'a.png' } });
    const model = buildVenueStatStripModel(mirror(), { liveId: 'lv123', nowMs: NOW });
    expect(strip.paint(model)).toBe(true);
    expect(strip.el.querySelector('[data-stat="records"] .nlsb-stat__val').textContent).toBe('81');
    expect(strip.el.querySelector('[data-stat="streamAge"] .nlsb-stat__val').textContent).toBe('2時間36分');
    expect(strip.el.dataset.source).toBe('mirror');
    expect(strip.el.querySelectorAll('.nlsb-stat')).toHaveLength(8);
    expect(strip.paint(buildVenueStatStripModel(mirror(), { liveId: 'lv123', nowMs: NOW + 1000 }))).toBe(false);
  });

  it('古くなったら is-stale と説明の title が付き、戻れば外れる', () => {
    const strip = createVenueStatStrip(document);
    strip.paint(buildVenueStatStripModel(mirror(), { liveId: 'lv123', nowMs: NOW + VENUE_STAT_STRIP_STALE_MS * 2 }));
    expect(strip.el.classList.contains('is-stale')).toBe(true);
    expect(strip.el.title).toContain('パネル');
    strip.paint(buildVenueStatStripModel(mirror(), { liveId: 'lv123', nowMs: NOW }));
    expect(strip.el.classList.contains('is-stale')).toBe(false);
    expect(strip.el.hasAttribute('title')).toBe(false);
  });
});
