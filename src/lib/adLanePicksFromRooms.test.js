import { describe, it, expect } from 'vitest';
import { adLanePicksFromRooms } from './adLanePicksFromRooms.js';

const io = { yukkuriFaceFor: (k) => `yukkuri:${k}` };

describe('adLanePicksFromRooms', () => {
  it('記名広告(数値uid)は entry.userId を採用しサムネを使う', () => {
    const out = adLanePicksFromRooms(
      [{ userKey: '144514252', nickname: 'ゲスト', count: 97633, avatarUrl: 'https://x/a.jpg', rankHint: 1 }],
      io
    );
    expect(out).toHaveLength(1);
    expect(out[0].entry.userId).toBe('144514252');
    expect(out[0].displaySrc).toBe('https://x/a.jpg');
    expect(out[0].meta.nameLine).toBe('ゲスト');
    expect(out[0].meta.idLine).toBe('広告');
  });

  it('ID無し広告(合成キー)も advertiserName で載せる(会議確定: 広告は全員表示)', () => {
    const out = adLanePicksFromRooms(
      [{ userKey: '__anon_ad_1', nickname: '伊藤福島', count: 30326, rankHint: 2 }],
      io
    );
    expect(out).toHaveLength(1);
    expect(out[0].entry.userId).toBe(''); // 合成キーは uid ではない
    expect(out[0].meta.nameLine).toBe('伊藤福島');
    expect(out[0].meta.idLine).toBe('#2'); // ID 無しは順位を出す
    expect(out[0].displaySrc).toBe('yukkuri:__anon_ad_1'); // サムネ無し→ゆっくり顔
  });

  // 2026-06-22(council/lane-show-all-active): 広告API が thumbnailUrl を返さなくても、数値ID付き
  //   広告主は個人サムネ(usericon URL)を導出する。サムネ持ち(ぱき等)がゆっくり顔に化けるのを防ぐ。
  it('サムネが無くても数値ID付き広告は個人サムネURLを導出する(ゆっくり顔に化けない)', () => {
    const out = adLanePicksFromRooms(
      [{ userKey: '115734569', nickname: 'しいたけ', count: 24634 }],
      io
    );
    expect(out[0].displaySrc).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/11573/115734569.jpg'
    );
    expect(out[0].displaySrc).not.toContain('yukkuri'); // ゆっくり顔に落ちていない
  });

  it('公式API のサムネ(avatarUrl)があればそれを最優先(導出より公式が上)', () => {
    const out = adLanePicksFromRooms(
      [{ userKey: '115734569', nickname: 'しいたけ', count: 1, avatarUrl: 'https://cdn.test/real.png' }],
      io
    );
    expect(out[0].displaySrc).toBe('https://cdn.test/real.png');
  });

  /*
   * ★v0.1.1307(2026-08-10 実機 lv351140568): 公式が「アイコン未設定」と言っている行では
   *   ③の CDN 導出をしない。導出すると必ず404になり、壊れ画像=白丸が並ぶ(10件中7件が該当)。
   *   実測: uid=138442683(未設定)の導出URL=404 / uid=38947059(設定済)=200。
   */
  it('hasNoIcon の行は CDN 導出をせずゆっくり顔に落とす(404の白丸を作らない)', () => {
    const out = adLanePicksFromRooms(
      [{ userKey: '138442683', nickname: 'アンワル・ビン・イブラヒム', count: 67039, rankHint: 1, hasNoIcon: true }],
      io
    );
    expect(out[0].displaySrc).toBe('yukkuri:138442683');
    expect(out[0].displaySrc).not.toContain('usericon'); // 404 になる導出URLを出していない
    expect(out[0].entry.userId).toBe('138442683'); // リンクは維持(本人ページへは飛べる)
  });

  it('hasNoIcon でも観測済みの実サムネ(②)があればそちらを使う', () => {
    const out = adLanePicksFromRooms(
      [{ userKey: '138442683', nickname: 'アンワル', count: 1, hasNoIcon: true }],
      { ...io, resolveAvatarForUid: () => 'https://cdn.test/observed.png' }
    );
    expect(out[0].displaySrc).toBe('https://cdn.test/observed.png');
  });

  it('hasNoIcon が無い行は従来どおり CDN 導出する(退化防止)', () => {
    const out = adLanePicksFromRooms(
      [{ userKey: '38947059', nickname: '足利尊氏', count: 24431 }],
      io
    );
    expect(out[0].displaySrc).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/3894/38947059.jpg'
    );
  });

  it('名前も uid も無い行は飛ばす', () => {
    const out = adLanePicksFromRooms([{ userKey: '__anon_ad_3', nickname: '' }], io);
    expect(out).toHaveLength(0);
  });

  it('limit で表示数を絞れる', () => {
    const rooms = [
      { userKey: '1000001', nickname: 'a', count: 5 },
      { userKey: '1000002', nickname: 'b', count: 4 },
      { userKey: '1000003', nickname: 'c', count: 3 }
    ];
    expect(adLanePicksFromRooms(rooms, { ...io, limit: 2 })).toHaveLength(2);
  });

  it('順序は room の順(公式 rank 順=貢pt降順)を保つ', () => {
    const rooms = [
      { userKey: '1000001', nickname: '1位', count: 100, rankHint: 1 },
      { userKey: '__anon_ad_2', nickname: '2位', count: 50, rankHint: 2 }
    ];
    const out = adLanePicksFromRooms(rooms, io);
    expect(out.map((p) => p.meta.nameLine)).toEqual(['1位', '2位']);
  });

  it('空入力・非配列で落ちない', () => {
    expect(adLanePicksFromRooms([], io)).toEqual([]);
    expect(adLanePicksFromRooms(null, io)).toEqual([]);
    expect(adLanePicksFromRooms(undefined, io)).toEqual([]);
  });
});
