import { describe, expect, it } from 'vitest';
import {
  mergeCommentsWithInterceptCache,
  mergeInterceptCacheItems,
  normalizeInterceptCacheItems
} from './interceptCacheMerge.js';

/**
 * characterization test（元の挙動を固定）。
 * popup-entry.js から Track A で切り出した mergeCommentsWithInterceptCache の
 * 入出力を、切り出し前と同じであることを固定する。
 */

/** @param {Partial<import('./interceptCacheMerge.js').PopupCommentEntry>} e */
const row = (e) => ({ commentNo: '', userId: '', nickname: '', avatarUrl: '', ...e });
const item = (no, uid = '', name = '', av = '') => ({ no, uid, name, av });

describe('mergeCommentsWithInterceptCache（切り出し前と同じ）', () => {
  it('entries が空なら patched=0・next は空配列', () => {
    const r = mergeCommentsWithInterceptCache([], [item('1', '123456')]);
    expect(r).toEqual({ next: [], patched: 0, uidReplaced: 0 });
  });

  it('entries が配列でなければ next=[]', () => {
    const r = mergeCommentsWithInterceptCache(/** @type {any} */ (null), [item('1', '1')]);
    expect(r).toEqual({ next: [], patched: 0, uidReplaced: 0 });
  });

  it('items が空なら entries をそのまま返す（参照維持）', () => {
    const entries = [row({ commentNo: '1', userId: '9' })];
    const r = mergeCommentsWithInterceptCache(entries, []);
    expect(r.next).toBe(entries);
    expect(r.patched).toBe(0);
    expect(r.uidReplaced).toBe(0);
  });

  it('nickname が空のとき hit.name で埋める（patched=1）', () => {
    const entries = [row({ commentNo: '10', userId: '123456', nickname: '' })];
    const r = mergeCommentsWithInterceptCache(entries, [item('10', '123456', 'りんく')]);
    expect(r.next[0].nickname).toBe('りんく');
    expect(r.patched).toBe(1);
    expect(r.uidReplaced).toBe(0);
  });

  it('既存 nickname があれば上書きしない', () => {
    const entries = [row({ commentNo: '10', userId: '123456', nickname: '元の名前' })];
    const r = mergeCommentsWithInterceptCache(entries, [item('10', '123456', 'べつ名')]);
    expect(r.next[0].nickname).toBe('元の名前');
    expect(r.patched).toBe(0);
  });

  it('http(s) の hit.av でスコアが上なら avatarUrl を採用', () => {
    // 数字 uid + 空 avatar → hit の CDN URL の方がスコアが高い（既存挙動）。
    const entries = [row({ commentNo: '10', userId: '123456789', avatarUrl: '' })];
    const av = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/12345/123456789.jpg';
    const r = mergeCommentsWithInterceptCache(entries, [item('10', '123456789', '', av)]);
    expect(r.next[0].avatarUrl).toBe(av);
    expect(r.patched).toBe(1);
  });

  it('http でない hit.av は無視する', () => {
    const entries = [row({ commentNo: '10', userId: '123456789', avatarUrl: '' })];
    const r = mergeCommentsWithInterceptCache(entries, [item('10', '123456789', '', 'ftp://x')]);
    expect(r.next[0].avatarUrl).toBe('');
    expect(r.patched).toBe(0);
  });

  it('commentNo が空の行は素通し（変更なし）', () => {
    const entries = [row({ commentNo: '', userId: '1', nickname: '' })];
    const r = mergeCommentsWithInterceptCache(entries, [item('', '9', '名')]);
    expect(r.patched).toBe(0);
    expect(r.next[0]).toBe(entries[0]);
  });

  it('preferInterceptUidSet に curUid があれば uid を hit 側へ置換', () => {
    const entries = [row({ commentNo: '10', userId: 'a:anon-hash' })];
    const r = mergeCommentsWithInterceptCache(entries, [item('10', '123456789')], {
      preferInterceptUidSet: new Set(['a:anon-hash'])
    });
    expect(r.next[0].userId).toBe('123456789');
    expect(r.uidReplaced).toBe(1);
    expect(r.patched).toBe(1);
  });

  it('弱い uid（匿名系）は hit の数字 uid が強いので常に置換する（しきい値と無関係）', () => {
    // ★切り出し前の実挙動: pickStrongerUserId は「より強い(数字)uid」を選ぶため、
    //   shouldReplaceUid のしきい値（total<4 等）に関係なく置換が起きる。
    //   しきい値は「同強度で不一致のとき incoming/existing どちらを優先するか」の
    //   タイブレークにだけ効く。
    const entries = [
      row({ commentNo: '1', userId: 'a:x' }),
      row({ commentNo: '2', userId: 'a:x' })
    ];
    const items = [item('1', '111111111'), item('2', '222222222')];
    const r = mergeCommentsWithInterceptCache(entries, items);
    expect(r.uidReplaced).toBe(2);
    expect(r.next[0].userId).toBe('111111111');
    expect(r.next[1].userId).toBe('222222222');
  });

  it('同強度（両方 数字）で curUid が空でなければ既定は existing 維持', () => {
    // total<4 でしきい値未満 → tie は 'existing' → 現状維持（置換しない）。
    const entries = [row({ commentNo: '1', userId: '111111111' })];
    const items = [item('1', '999999999')];
    const r = mergeCommentsWithInterceptCache(entries, items);
    expect(r.next[0].userId).toBe('111111111');
    expect(r.uidReplaced).toBe(0);
  });

  it('items で同一 no が重複したら空でない値が勝つ（後勝ち補完）', () => {
    const entries = [row({ commentNo: '10', userId: '123456', nickname: '' })];
    const items = [item('10', '123456', ''), item('10', '', 'あとの名')];
    const r = mergeCommentsWithInterceptCache(entries, items);
    expect(r.next[0].nickname).toBe('あとの名');
  });
});

describe('normalizeInterceptCacheItems（切り出し前と同じ）', () => {
  it('配列でなければ []', () => {
    expect(normalizeInterceptCacheItems(null)).toEqual([]);
    expect(normalizeInterceptCacheItems(/** @type {any} */ ('x'))).toEqual([]);
  });

  it('no が空、または uid/name/av がすべて空の要素は捨てる', () => {
    const raw = [
      { no: '', uid: '9' },
      { no: '1' },
      { no: '2', uid: '999' }
    ];
    expect(normalizeInterceptCacheItems(raw)).toEqual([{ no: '2', uid: '999', name: '', av: '' }]);
  });

  it('av は http(s) のみ採用、それ以外は空にする', () => {
    const raw = [
      { no: '1', uid: '1', av: 'https://x/a.jpg' },
      { no: '2', uid: '2', av: 'ftp://x/b.jpg' }
    ];
    const out = normalizeInterceptCacheItems(raw);
    expect(out[0].av).toBe('https://x/a.jpg');
    expect(out[1].av).toBe('');
  });

  it('前後の空白は trim する', () => {
    const out = normalizeInterceptCacheItems([{ no: ' 5 ', uid: ' 7 ', name: ' 名 ' }]);
    expect(out).toEqual([{ no: '5', uid: '7', name: '名', av: '' }]);
  });
});

describe('mergeInterceptCacheItems（切り出し前と同じ）', () => {
  it('空入力は []', () => {
    expect(mergeInterceptCacheItems([])).toEqual([]);
    expect(mergeInterceptCacheItems(/** @type {any} */ (null))).toEqual([]);
  });

  it('no が空の要素は捨てる', () => {
    expect(mergeInterceptCacheItems([item('', '9')])).toEqual([]);
  });

  it('同一 no は空でない値が勝つ後勝ち補完', () => {
    const out = mergeInterceptCacheItems([
      item('10', '111', '', 'https://x/a.jpg'),
      item('10', '', 'あとの名', '')
    ]);
    expect(out).toEqual([{ no: '10', uid: '111', name: 'あとの名', av: 'https://x/a.jpg' }]);
  });

  it('av は http(s) のみ採用', () => {
    const out = mergeInterceptCacheItems([item('1', '1', '', 'ftp://x')]);
    expect(out[0].av).toBe('');
  });
});
