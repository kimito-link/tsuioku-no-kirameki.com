import { describe, it, expect } from 'vitest';
import {
  NICOAD_CONTRIB_FETCH_MESSAGE_TYPE,
  NICOAD_CONTRIB_DEFAULT_LIMIT,
  NICOAD_CONTRIB_STORAGE_PREFIX,
  nicoadContribStorageKey,
  buildNicoadContributionRankingUrl,
  isLikelyNicoadRankingShape,
  normalizeNicoadRankingResponse
} from './nicoadContributionRankingApi.js';

describe('nicoadContributionRankingApi', () => {
  describe('契約定数（background.js と文字列同期）', () => {
    it('メッセージ type と storage prefix は固定値', () => {
      // background.js（手書き成果物）が同じリテラルを使うので、ここで凍結する。
      expect(NICOAD_CONTRIB_FETCH_MESSAGE_TYPE).toBe('NLS_NICOAD_CONTRIB_FETCH');
      expect(NICOAD_CONTRIB_STORAGE_PREFIX).toBe('nls_nicoad_api_ranking_');
      expect(NICOAD_CONTRIB_DEFAULT_LIMIT).toBe(10);
    });

    it('storage キーは scrape 由来 nls_nicoad_ranking_ とは別（clobber 防止）', () => {
      expect(nicoadContribStorageKey('lv123')).toBe('nls_nicoad_api_ranking_lv123');
      // 既存 scrape キーと衝突しない
      expect(nicoadContribStorageKey('lv123')).not.toBe('nls_nicoad_ranking_lv123');
      expect(nicoadContribStorageKey('LV9')).toBe('nls_nicoad_api_ranking_lv9');
    });
  });

  describe('buildNicoadContributionRankingUrl', () => {
    it('正しい liveId で URL を組む（live パス・ranking/contribution）', () => {
      expect(buildNicoadContributionRankingUrl('lv345479988')).toBe(
        'https://api.nicoad.nicovideo.jp/v1/contents/live/lv345479988/ranking/contribution?limit=10'
      );
    });

    it('limit を 1..100 に clamp', () => {
      expect(buildNicoadContributionRankingUrl('lv1', { limit: 3 })).toContain('limit=3');
      expect(buildNicoadContributionRankingUrl('lv1', { limit: 0 })).toContain('limit=1');
      expect(buildNicoadContributionRankingUrl('lv1', { limit: 999 })).toContain('limit=100');
      expect(buildNicoadContributionRankingUrl('lv1', { limit: 7.9 })).toContain('limit=7');
    });

    it('不正 liveId は null（SSRF面遮断）', () => {
      expect(buildNicoadContributionRankingUrl('')).toBeNull();
      expect(buildNicoadContributionRankingUrl('lv')).toBeNull();
      expect(buildNicoadContributionRankingUrl('sm9')).toBeNull();
      expect(buildNicoadContributionRankingUrl('lv1; rm -rf')).toBeNull();
      expect(buildNicoadContributionRankingUrl('https://evil.test')).toBeNull();
      expect(buildNicoadContributionRankingUrl(null)).toBeNull();
    });
  });

  /*
   * ★v0.1.1307(2026-08-10 実機 lv351140568 で確定した白丸の真因):
   *   公式 API はアイコン未設定の広告主にも thumbnailUrl を返すが、中身は
   *   `usericon/defaults/blank.jpg`(のっぺらぼう)である。実データ10件中7件がこれだった。
   *
   *   normalize がこの情報を【捨てて】いたため、下流(adLanePicksFromRooms)は
   *   「サムネ情報なし」と解釈して uid から CDN URL を導出する。しかしアイコン未設定の
   *   ユーザーはその URL が存在せず 404 → ブラウザの壊れ画像 = 画面に白丸が並ぶ。
   *   実測: uid=138442683(未設定)の導出URL=404 / uid=38947059(設定済)=200。
   *
   *   公式が「未設定」と教えてくれているのだから、それを hasNoIcon として下流へ伝えれば
   *   404 を出す前にゆっくり顔へ落とせる(推測ゼロ・公式提供値の検疫のみ)。
   */
  describe('アイコン未設定(defaults/blank.jpg)の伝達', () => {
    const blank = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg';
    const real = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/3894/38947059.jpg?1600603307';

    it('thumbnailUrl が defaults/ なら hasNoIcon:true を立てる(uid はあるが顔が無い人)', () => {
      const rows = normalizeNicoadRankingResponse({
        meta: { status: 200 },
        data: {
          ranking: [
            { userId: 138442683, advertiserName: 'アンワル・ビン・イブラヒム', totalContribution: 67039, rank: 1, thumbnailUrl: blank }
          ]
        }
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].isAnonymous).toBe(false); // 記名であることは変えない
      expect(rows[0].userPageUrl).toBe('https://www.nicovideo.jp/user/138442683');
      expect(rows[0].hasNoIcon).toBe(true);
    });

    it('本物の個人サムネなら hasNoIcon を立てない(退化防止)', () => {
      const rows = normalizeNicoadRankingResponse({
        meta: { status: 200 },
        data: {
          ranking: [
            { userId: 38947059, advertiserName: '足利尊氏', totalContribution: 24431, rank: 4, thumbnailUrl: real }
          ]
        }
      });
      expect(rows[0].hasNoIcon).toBeUndefined();
    });

    it('thumbnailUrl が無い行は hasNoIcon を立てない(未知と未設定は別物)', () => {
      const rows = normalizeNicoadRankingResponse({
        meta: { status: 200 },
        data: {
          ranking: [{ userId: 115734569, advertiserName: 'しいたけ', totalContribution: 100, rank: 1 }]
        }
      });
      expect(rows[0].hasNoIcon).toBeUndefined();
    });
  });

  describe('isLikelyNicoadRankingShape', () => {
    it('data.ranking 配列を持てば true（koken の rankers ではない点に注意）', () => {
      expect(isLikelyNicoadRankingShape({ data: { ranking: [] } })).toBe(true);
      expect(isLikelyNicoadRankingShape({ meta: { status: 200 }, data: { ranking: [] } })).toBe(
        true
      );
    });

    it('koken 形（rankers）は nicoad としては受理しない', () => {
      expect(isLikelyNicoadRankingShape({ data: { rankers: [] } })).toBe(false);
    });

    it('meta.status!=200 / 非オブジェクト / ranking 非配列は false', () => {
      expect(isLikelyNicoadRankingShape({ meta: { status: 500 }, data: { ranking: [] } })).toBe(
        false
      );
      expect(isLikelyNicoadRankingShape(null)).toBe(false);
      expect(isLikelyNicoadRankingShape({ data: { ranking: 'x' } })).toBe(false);
      expect(isLikelyNicoadRankingShape({ data: {} })).toBe(false);
    });
  });

  describe('normalizeNicoadRankingResponse', () => {
    // sm9 実レスポンスを模した記名行
    const namedResponse = {
      meta: { status: 200 },
      data: {
        contentId: 'lv345479988',
        contentType: 'live',
        contentTotalContribution: 31182160,
        count: 2,
        ranking: [
          {
            userId: 5428353,
            advertiserName: '笹銀酪鞄ｸ',
            totalContribution: 6191461,
            rank: 1,
            userPageUrl: 'https://www.nicovideo.jp/user/5428353'
          },
          {
            userId: 36715409,
            advertiserName: '豹ア豬',
            totalContribution: 5087734,
            rank: 2,
            userPageUrl: 'https://www.nicovideo.jp/user/36715409'
          }
        ]
      }
    };

    it('記名行を adContributionRanking 行に正規化し userPageUrl を付与', () => {
      const rows = normalizeNicoadRankingResponse(namedResponse);
      expect(rows).not.toBeNull();
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        rank: 1,
        name: '笹銀酪鞄ｸ',
        contribution: 6191461,
        isAnonymous: false,
        userPageUrl: 'https://www.nicovideo.jp/user/5428353'
      });
      expect(rows[1].userPageUrl).toBe('https://www.nicovideo.jp/user/36715409');
    });

    it('userPageUrl が無くても userId から組み立てる（記名）', () => {
      const rows = normalizeNicoadRankingResponse({
        data: { ranking: [{ userId: 777, advertiserName: 'テスト', totalContribution: 100, rank: 1 }] }
      });
      expect(rows[0].userPageUrl).toBe('https://www.nicovideo.jp/user/777');
    });

    it('匿名行（userId 欠落）は isAnonymous:true・userPageUrl を付けない（誤リンク不能）', () => {
      const rows = normalizeNicoadRankingResponse({
        data: {
          ranking: [{ advertiserName: '名無し', totalContribution: 500, rank: 1 }]
        }
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].isAnonymous).toBe(true);
      expect(rows[0].name).toBe('名無し');
      expect(rows[0]).not.toHaveProperty('userPageUrl');
    });

    it('advertiserName が "名無し" なら userId があっても匿名扱い（自名を名無しにした人を誤リンクしない）', () => {
      const rows = normalizeNicoadRankingResponse({
        data: {
          ranking: [{ userId: 999, advertiserName: '名無し', totalContribution: 500, rank: 1 }]
        }
      });
      expect(rows[0].isAnonymous).toBe(true);
      expect(rows[0]).not.toHaveProperty('userPageUrl');
    });

    it('不正 userPageUrl（別ホスト/javascript:）は userId から再構築 or 落とす', () => {
      const rows = normalizeNicoadRankingResponse({
        data: {
          ranking: [
            { userId: 5, advertiserName: 'A', totalContribution: 10, rank: 1, userPageUrl: 'javascript:alert(1)' },
            { userId: 0, advertiserName: 'B', totalContribution: 10, rank: 2, userPageUrl: 'https://evil.test/user/5' }
          ]
        }
      });
      // userId=5 は url 不正でも userId から再構築
      expect(rows[0].userPageUrl).toBe('https://www.nicovideo.jp/user/5');
      // userId=0（無効扱い）かつ別ホスト url → 匿名・userPageUrl 無し
      expect(rows[1].isAnonymous).toBe(true);
      expect(rows[1]).not.toHaveProperty('userPageUrl');
    });

    it('rank 欠落は配列順で補完、負の contribution は 0 に', () => {
      const rows = normalizeNicoadRankingResponse({
        data: {
          ranking: [
            { userId: 1, advertiserName: 'X', totalContribution: -5 },
            { userId: 2, advertiserName: 'Y', totalContribution: 50 }
          ]
        }
      });
      expect(rows[0].rank).toBe(1);
      expect(rows[0].contribution).toBe(0);
      expect(rows[1].rank).toBe(2);
    });

    it('fail-soft: meta.status!=200 / ranking 空 / 壊れた行のみ は null（既存値を保全）', () => {
      expect(normalizeNicoadRankingResponse({ meta: { status: 500 }, data: { ranking: [] } })).toBeNull();
      expect(normalizeNicoadRankingResponse({ data: { ranking: [] } })).toBeNull();
      expect(normalizeNicoadRankingResponse({ data: { ranking: [null, 'x', 42] } })).toBeNull();
      expect(normalizeNicoadRankingResponse(null)).toBeNull();
    });

    it('サーバ提供順を再ソートしない（同点同 rank を保持）', () => {
      const rows = normalizeNicoadRankingResponse({
        data: {
          ranking: [
            { userId: 1, advertiserName: 'A', totalContribution: 100, rank: 1 },
            { userId: 2, advertiserName: 'B', totalContribution: 100, rank: 1 },
            { userId: 3, advertiserName: 'C', totalContribution: 50, rank: 3 }
          ]
        }
      });
      expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
      expect(rows.map((r) => r.name)).toEqual(['A', 'B', 'C']);
    });
  });
});
