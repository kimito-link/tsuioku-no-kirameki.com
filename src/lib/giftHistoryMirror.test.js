import { describe, it, expect } from 'vitest';
import {
  buildGiftHistoryMirrorSnapshot,
  restoreGiftHistoryMirror,
  GIFT_HISTORY_MIRROR_ROOMS_CAP,
  GIFT_HISTORY_MIRROR_LEDGER_CAP
} from './giftHistoryMirror.js';

const NOW = 1_000_000_000_000;

/** ①VM を模した ctx(rooms + ledgerRows + スカラー)。 */
function vm(overrides = {}) {
  return {
    rooms: [
      { userKey: '10340018', nickname: '隣の家のねこ', count: 21000, avatarUrl: 'https://x/a.jpg' },
      { userKey: '__anon_ま∼やん', nickname: 'ま∼やん', count: 900, avatarUrl: '' }
    ],
    ledgerRows: [
      { timeLabel: '2:27:40', itemName: 'でますか？', points: 300, thumbnailUrl: 'https://x/i.png', userId: '143231363', senderLabel: 'ポチタ', senderAvatarUrl: 'https://x/p.jpg', source: 'koken-api' },
      { timeLabel: '2:27:20', itemName: '酒うめー！', points: 300, thumbnailUrl: '', userId: '143231363', senderLabel: 'ポチタ', senderAvatarUrl: '', source: 'koken-api' }
    ],
    noteText: 'ギフト貢献',
    unitSuffix: 'pt',
    ariaLabel: '投げ一覧',
    pointsSumAll: 21900,
    pointsSumDisplayed: 21900,
    officialProgramGiftPts: 15820,
    ledgerTotalCount: 14,
    payloadSource: 'gift-sub-app',
    ...overrides
  };
}

describe('buildGiftHistoryMirrorSnapshot', () => {
  it('VM から rooms/ledgerRows/スカラーを JSON-safe に取り出す', () => {
    const snap = buildGiftHistoryMirrorSnapshot(vm(), { liveId: 'LV1', nowMs: NOW });
    expect(snap.liveId).toBe('lv1');
    expect(snap.capturedAt).toBe(NOW);
    expect(snap.rooms).toHaveLength(2);
    expect(snap.rooms[0]).toEqual({ userKey: '10340018', nickname: '隣の家のねこ', count: 21000, avatarUrl: 'https://x/a.jpg' });
    expect(snap.ledgerRows).toHaveLength(2);
    expect(snap.ledgerRows[0].itemName).toBe('でますか？');
    expect(snap.ledgerRows[0].points).toBe(300);
    expect(snap.ledgerTotalCount).toBe(14);
    expect(snap.officialProgramGiftPts).toBe(15820);
    expect(snap.payloadSource).toBe('gift-sub-app');
  });

  it('HTML文字列(throwsTableHtml)は鏡に載せない(R-1)', () => {
    const snap = buildGiftHistoryMirrorSnapshot(vm({ throwsTableHtml: '<section>危険</section>' }), { liveId: 'lv1', nowMs: NOW });
    expect(JSON.stringify(snap)).not.toContain('<section');
    expect(snap).not.toHaveProperty('throwsTableHtml');
  });

  it('pt<=0 の ledger 行は捨てる', () => {
    const snap = buildGiftHistoryMirrorSnapshot(vm({ ledgerRows: [
      { timeLabel: 't', itemName: 'a', points: 0, userId: 'u' },
      { timeLabel: 't2', itemName: 'b', points: 100, userId: 'u2' }
    ] }), { liveId: 'lv1', nowMs: NOW });
    expect(snap.ledgerRows).toHaveLength(1);
    expect(snap.ledgerRows[0].itemName).toBe('b');
  });

  it('rooms は roomsCap・ledger は ledgerCap で頭打ち', () => {
    const manyRooms = Array.from({ length: 30 }, (_, i) => ({ userKey: 'u' + i, nickname: 'n' + i, count: 100 - i, avatarUrl: '' }));
    const manyLedger = Array.from({ length: 40 }, (_, i) => ({ timeLabel: 't' + i, itemName: 'g' + i, points: 100, userId: 'u' + i }));
    const snap = buildGiftHistoryMirrorSnapshot(vm({ rooms: manyRooms, ledgerRows: manyLedger }), { liveId: 'lv1', nowMs: NOW });
    expect(snap.rooms).toHaveLength(GIFT_HISTORY_MIRROR_ROOMS_CAP);
    expect(snap.ledgerRows).toHaveLength(GIFT_HISTORY_MIRROR_LEDGER_CAP);
  });

  it('rooms も ledger も空なら null', () => {
    expect(buildGiftHistoryMirrorSnapshot(vm({ rooms: [], ledgerRows: [] }), { liveId: 'lv1', nowMs: NOW })).toBe(null);
    expect(buildGiftHistoryMirrorSnapshot(null)).toBe(null);
    expect(buildGiftHistoryMirrorSnapshot(undefined)).toBe(null);
  });

  it('関数/非列挙を持ち込まない(構造化クローン可能=storage/JSON安全)', () => {
    const dirty = vm();
    dirty.rooms[0].onClick = () => {}; // 混入した関数
    dirty.evil = () => {};
    const snap = buildGiftHistoryMirrorSnapshot(dirty, { liveId: 'lv1', nowMs: NOW });
    expect(() => structuredClone(snap)).not.toThrow();
    expect(snap.rooms[0]).not.toHaveProperty('onClick');
    expect(snap).not.toHaveProperty('evil');
  });
});

describe('restoreGiftHistoryMirror', () => {
  it('null-safe に復元し、rooms/ledger を保つ', () => {
    const snap = buildGiftHistoryMirrorSnapshot(vm(), { liveId: 'lv1', nowMs: NOW });
    const r = restoreGiftHistoryMirror(snap);
    expect(r.rooms).toHaveLength(2);
    expect(r.ledgerRows).toHaveLength(2);
    expect(r.ledgerRows[0].itemName).toBe('でますか？');
  });

  it('null/空は null', () => {
    expect(restoreGiftHistoryMirror(null)).toBe(null);
    expect(restoreGiftHistoryMirror({})).toBe(null);
    expect(restoreGiftHistoryMirror({ rooms: [], ledgerRows: [] })).toBe(null);
  });

  it('ledger の restore 結果が buildGiftThrowLedgerTableSectionHtml に食える形', async () => {
    // 実 lib に流して例外なくHTMLが返ることで「形が合っている」ことを回帰
    const { buildGiftThrowLedgerTableSectionHtml } = await import('./giftThrowLedgerTableHtml.js');
    const r = restoreGiftHistoryMirror(buildGiftHistoryMirrorSnapshot(vm(), { liveId: 'lv1', nowMs: NOW }));
    const html = buildGiftThrowLedgerTableSectionHtml(r.ledgerRows, { totalCount: r.ledgerTotalCount, shownCount: r.ledgerRows.length, payloadSource: r.payloadSource });
    expect(html).toContain('投げ一覧');
    expect(html).toContain('でますか？');
  });
});
