import { describe, expect, it } from 'vitest';
import { resolveUserEntryAvatarSignals } from './userEntryAvatarResolve.js';
import { niconicoDefaultUserIconUrl } from './supportGrowthTileSrc.js';

describe('resolveUserEntryAvatarSignals', () => {
  it('DOM の素 URL が来たら observed=true、displayAvatarUrl はその URL', () => {
    const out = resolveUserEntryAvatarSignals({
      userId: '88210441',
      rowAv: 'https://cdn.example/personal.jpg',
      interceptEntryAv: '',
      interceptMapAv: ''
    });
    expect(out.avatarObserved).toBe(true);
    expect(out.displayAvatarUrl).toBe('https://cdn.example/personal.jpg');
  });

  it('intercept entry 経由の URL でも observed=true', () => {
    const out = resolveUserEntryAvatarSignals({
      userId: '88210441',
      rowAv: '',
      interceptEntryAv: 'https://cdn.example/face.png',
      interceptMapAv: ''
    });
    expect(out.avatarObserved).toBe(true);
    expect(out.displayAvatarUrl).toBe('https://cdn.example/face.png');
  });

  it('intercept map 経由の URL でも observed=true', () => {
    const out = resolveUserEntryAvatarSignals({
      userId: '88210441',
      rowAv: '',
      interceptEntryAv: '',
      interceptMapAv: 'https://cdn.example/face.png'
    });
    expect(out.avatarObserved).toBe(true);
    expect(out.displayAvatarUrl).toBe('https://cdn.example/face.png');
  });

  it('全ソース空で数値 userId なら displayAvatarUrl は canonical、observed は false', () => {
    // これが一番はまりやすいケース:
    // 「UI にはアバターが表示されるが tier 3 には上げられない」状態。
    // canonical URL は合成なので「URL があったら観測扱い」は誤り。
    const uid = '88210441';
    const out = resolveUserEntryAvatarSignals({
      userId: uid,
      rowAv: '',
      interceptEntryAv: '',
      interceptMapAv: ''
    });
    expect(out.avatarObserved).toBe(false);
    expect(out.displayAvatarUrl).toBe(niconicoDefaultUserIconUrl(uid));
    expect(out.displayAvatarUrl).toMatch(
      /^https:\/\/secure-dcdn\.cdn\.nimg\.jp\/nicoaccount\/usericon\/s\//
    );
  });

  it('合成 canonical URL が rowAv に入っていても observed=true として扱う（DOM で一応見えたのは事実）', () => {
    // これは意図的なふるまい:
    // canonical URL を DOM から拾ったということは、少なくとも <img> タグが
    // その URL を指して描画されているので、他のフォールバックよりは強い手掛かり。
    // tier 3 への昇格は呼び出し側の userLaneProfileCompletenessTier が
    // さらに avatarObserved と ex.hasPersonalThumb の両方を見て決めるので、
    // ここでは「観測源はあった」とだけ報告する。
    const uid = '88210441';
    const canonical = niconicoDefaultUserIconUrl(uid);
    const out = resolveUserEntryAvatarSignals({
      userId: uid,
      rowAv: canonical,
      interceptEntryAv: '',
      interceptMapAv: ''
    });
    expect(out.avatarObserved).toBe(true);
    expect(out.displayAvatarUrl).toBe(canonical);
  });

  it('複数ソースで食い違う URL が来たら pickStrongestAvatarUrlForUser の結果を返す', () => {
    const uid = '88210441';
    const personal = 'https://cdn.example/personal.jpg';
    const canonical = niconicoDefaultUserIconUrl(uid);
    const out = resolveUserEntryAvatarSignals({
      userId: uid,
      rowAv: canonical, // 弱め
      interceptEntryAv: personal, // 強め
      interceptMapAv: ''
    });
    expect(out.avatarObserved).toBe(true);
    // pickStrongestAvatarUrlForUser は合成より個人を強いと評価する
    expect(out.displayAvatarUrl).toBe(personal);
  });

  it('非数値 userId（a:xxxx）は canonical フォールバックが生成されず、全ソース空なら displayAvatarUrl は空', () => {
    const out = resolveUserEntryAvatarSignals({
      userId: 'a:AbCdEfGhIjKlMnOp',
      rowAv: '',
      interceptEntryAv: '',
      interceptMapAv: ''
    });
    expect(out.avatarObserved).toBe(false);
    expect(out.displayAvatarUrl).toBe('');
  });

  it('userId 空かつ全ソース空 → observed=false, displayAvatarUrl 空', () => {
    const out = resolveUserEntryAvatarSignals({
      userId: '',
      rowAv: '',
      interceptEntryAv: '',
      interceptMapAv: ''
    });
    expect(out.avatarObserved).toBe(false);
    expect(out.displayAvatarUrl).toBe('');
  });

  it('入力が部分 undefined / null でも落ちずにデフォルトに倒す', () => {
    // @ts-expect-error - 呼び出し側のぬるい入力を許容するかの検証
    const out = resolveUserEntryAvatarSignals({ userId: '88210441' });
    expect(out.avatarObserved).toBe(false);
    expect(out.displayAvatarUrl).toBe(niconicoDefaultUserIconUrl('88210441'));
  });

  describe('0.1.77: ギフト演出 DOM 取り違えガード', () => {
    const broadcasterUid = '99999';
    const broadcasterIconUrl =
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/9/99999.jpg';
    const viewerUid = '4046119';

    it('rowAv が broadcaster icon の場合、viewer の displayAvatarUrl は canonical fallback に', () => {
      const out = resolveUserEntryAvatarSignals({
        userId: viewerUid,
        rowAv: broadcasterIconUrl,
        interceptEntryAv: '',
        interceptMapAv: '',
        broadcasterUid,
        broadcasterIconUrl
      });
      // observed は false（broadcaster icon なので無効化）
      expect(out.avatarObserved).toBe(false);
      // displayAvatarUrl は viewer 自身の canonical
      expect(out.displayAvatarUrl).toBe(niconicoDefaultUserIconUrl(viewerUid));
    });

    it('interceptEntryAv が broadcaster icon の場合も同様に viewer 用 canonical に倒す', () => {
      const out = resolveUserEntryAvatarSignals({
        userId: viewerUid,
        rowAv: '',
        interceptEntryAv: broadcasterIconUrl,
        interceptMapAv: '',
        broadcasterUid,
        broadcasterIconUrl
      });
      expect(out.avatarObserved).toBe(false);
      expect(out.displayAvatarUrl).toBe(niconicoDefaultUserIconUrl(viewerUid));
    });

    it('interceptMapAv が broadcaster icon の場合も同様', () => {
      const out = resolveUserEntryAvatarSignals({
        userId: viewerUid,
        rowAv: '',
        interceptEntryAv: '',
        interceptMapAv: broadcasterIconUrl,
        broadcasterUid,
        broadcasterIconUrl
      });
      expect(out.avatarObserved).toBe(false);
      expect(out.displayAvatarUrl).toBe(niconicoDefaultUserIconUrl(viewerUid));
    });

    it('全ソースが broadcaster icon でも、broadcaster 本人 uid なら通す', () => {
      const out = resolveUserEntryAvatarSignals({
        userId: broadcasterUid,
        rowAv: broadcasterIconUrl,
        interceptEntryAv: broadcasterIconUrl,
        interceptMapAv: broadcasterIconUrl,
        broadcasterUid,
        broadcasterIconUrl
      });
      expect(out.avatarObserved).toBe(true);
      expect(out.displayAvatarUrl).toBe(broadcasterIconUrl);
    });

    it('viewer 自身の正しい個人サムネは通す', () => {
      const personal = 'https://cdn.example/viewer-personal.jpg';
      const out = resolveUserEntryAvatarSignals({
        userId: viewerUid,
        rowAv: personal,
        interceptEntryAv: '',
        interceptMapAv: '',
        broadcasterUid,
        broadcasterIconUrl
      });
      expect(out.avatarObserved).toBe(true);
      expect(out.displayAvatarUrl).toBe(personal);
    });

    it('broadcaster 情報未指定なら従来通り（ガード掛けず）', () => {
      const out = resolveUserEntryAvatarSignals({
        userId: viewerUid,
        rowAv: broadcasterIconUrl,
        interceptEntryAv: '',
        interceptMapAv: ''
      });
      expect(out.avatarObserved).toBe(true);
      expect(out.displayAvatarUrl).toBe(broadcasterIconUrl);
    });

    it('broadcaster icon と異なる URL は普通に通す', () => {
      const out = resolveUserEntryAvatarSignals({
        userId: viewerUid,
        rowAv: 'https://cdn.example/totally-different.jpg',
        interceptEntryAv: '',
        interceptMapAv: '',
        broadcasterUid,
        broadcasterIconUrl
      });
      expect(out.avatarObserved).toBe(true);
      expect(out.displayAvatarUrl).toBe('https://cdn.example/totally-different.jpg');
    });
  });
});
