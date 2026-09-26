import { describe, it, expect } from 'vitest';
import { readDetailQuery, withDetail, withoutDetail, findLive, detailBanner } from './liveDetailView.js';

describe('liveDetailView', () => {
  describe('readDetailQuery', () => {
    it('lv と detail=1 が揃っていれば detail:true', () => {
      expect(readDetailQuery('?lv=lv100001&detail=1')).toEqual({ lv: 'lv100001', detail: true });
    });
    it('lv が無ければ detail=1 があっても detail:false', () => {
      expect(readDetailQuery('?detail=1')).toEqual({ lv: '', detail: false });
    });
    it('lv は小文字化・trim される', () => {
      expect(readDetailQuery('?lv=LV100001%20&detail=1')).toEqual({ lv: 'lv100001', detail: true });
    });
    it('lv の形が不正なら lv は空になる(危険な値も無害化)', () => {
      expect(readDetailQuery('?lv=javascript:&detail=1')).toEqual({ lv: '', detail: false });
    });
    it('detail が 1 以外の値なら false', () => {
      expect(readDetailQuery('?lv=lv100001&detail=true')).toEqual({ lv: 'lv100001', detail: false });
    });
    it('空文字列・null・不正な入力でも安全に既定値を返す', () => {
      expect(readDetailQuery('')).toEqual({ lv: '', detail: false });
      expect(readDetailQuery(/** @type {any} */ (null))).toEqual({ lv: '', detail: false });
      expect(readDetailQuery(/** @type {any} */ (undefined))).toEqual({ lv: '', detail: false });
    });
  });

  describe('withDetail', () => {
    it('lv と detail=1 を付加する', () => {
      expect(withDetail('', 'lv100001')).toBe('?lv=lv100001&detail=1');
    });
    it('他のパラメータを保ったまま lv を上書きする', () => {
      const s = withDetail('?foo=bar&lv=lv999999', 'lv100001');
      const params = new URLSearchParams(s);
      expect(params.get('foo')).toBe('bar');
      expect(params.get('lv')).toBe('lv100001');
      expect(params.get('detail')).toBe('1');
    });
    it('lv が不正な形式なら search をそのまま返す(呼び出し側が pushState しない判断材料)', () => {
      expect(withDetail('?a=1', 'javascript:alert(1)')).toBe('?a=1');
      expect(withDetail('?a=1', '')).toBe('?a=1');
    });
  });

  describe('withoutDetail', () => {
    it('detail だけ除去し lv は残す', () => {
      const s = withoutDetail('?lv=lv100001&detail=1');
      const params = new URLSearchParams(s);
      expect(params.get('lv')).toBe('lv100001');
      expect(params.has('detail')).toBe(false);
    });
    it('残るパラメータが無ければ空文字列', () => {
      expect(withoutDetail('?detail=1')).toBe('');
      expect(withoutDetail('')).toBe('');
    });
  });

  describe('findLive', () => {
    const data = { lives: [{ liveId: 'lv100001', title: 'A' }, { liveId: 'lv200002', title: 'B' }] };
    it('lv が一致する配信を返す(大小文字・空白を正規化)', () => {
      expect(findLive(data, 'lv100001')).toEqual({ liveId: 'lv100001', title: 'A' });
      expect(findLive(data, 'LV100001 ')).toEqual({ liveId: 'lv100001', title: 'A' });
    });
    it('見つからなければ null', () => {
      expect(findLive(data, 'lv999999')).toBeNull();
    });
    it('data が null・配列でない・lives が非配列でも例外を投げず null', () => {
      expect(findLive(null, 'lv100001')).toBeNull();
      expect(findLive(/** @type {any} */ ('x'), 'lv100001')).toBeNull();
      expect(findLive({ lives: 'not-array' }, 'lv100001')).toBeNull();
      expect(findLive({}, 'lv100001')).toBeNull();
    });
    it('lv が空文字列なら null', () => {
      expect(findLive(data, '')).toBeNull();
    });
  });

  describe('detailBanner', () => {
    const now = 1_000_000_000_000;
    it('found:true なら kind:ok・text 空(fetchError があっても無視する)', () => {
      expect(detailBanner({ found: true, snapshotAt: 0, fetchError: 'boom' }, now)).toEqual({ kind: 'ok', text: '' });
    });
    it('found:false かつ snapshotAt が無ければ missing-empty', () => {
      const r = detailBanner({ found: false, snapshotAt: 0, fetchError: '' }, now);
      expect(r.kind).toBe('missing-empty');
      expect(r.text).toContain('取れていない');
    });
    it('found:false かつ snapshotAt があれば missing(最後の情報だと明示)', () => {
      const r = detailBanner({ found: false, snapshotAt: now - 5 * 60_000, fetchError: '' }, now);
      expect(r.kind).toBe('missing');
      expect(r.text).toContain('見当たらない');
      expect(r.text).toContain('5分前');
    });
    it('fetchError かつ snapshotAt があれば error(取得失敗を明示)', () => {
      const r = detailBanner({ found: false, snapshotAt: now - 2 * 60_000, fetchError: '読み込みに失敗しました (500)' }, now);
      expect(r.kind).toBe('error');
      expect(r.text).toContain('失敗');
      expect(r.text).toContain('2分前');
    });
    it('snapshotAt が未来値(時計ずれ)でも例外を投げず安全な文言に倒れる', () => {
      const r = detailBanner({ found: false, snapshotAt: now + 60_000, fetchError: '' }, now);
      expect(r.kind).toBe('missing');
      expect(typeof r.text).toBe('string');
    });
  });
});
