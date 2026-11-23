import { describe, it, expect } from 'vitest';
import {
  normalizeAuditionEventsFromResponses,
  normalizeAuditionFullRankingPages,
  attachAuditionEventFirstSeen,
  AUDITION_EVENT_RANKING_FETCH_MESSAGE_TYPE,
  AUDITION_KEY_RE,
  EVENT_VOTING_RANKING_STORAGE_PREFIX,
  buildAuditionEntryItemsUrl,
  buildAuditionRankingsUrl,
  buildAuditionVotingUserRankingUrl,
  eventVotingRankingStorageKey,
  pickAuditionContextFromEntryItems,
  normalizeAuditionRankingsResponse,
  normalizeAuditionVotingUserRankingResponse
} from './auditionEventRankingApi.js';

// 実機 lv350658954（2026-06-01・202606-nicoadevent-sweets）の応答を模した一次資料相当サンプル。
const ENTRY_ITEMS = {
  meta: { status: 200 },
  data: {
    entry_items: [
      {
        id: 169058,
        audition_id: 476,
        status: 'enable',
        total_score: 1017300,
        rank: 21,
        item: { type: 'user', id: '125407984', nickname: 'うゆ♡' },
        audition: {
          key: '202606-nicoadevent-sweets',
          title: '極上デザートもらえる！ニコニ広告スイーツユートピア',
          entry_count: 339
        }
      }
    ]
  }
};

const RANKINGS = {
  meta: { status: 200 },
  data: {
    total_count: 119,
    entry_items: [
      { id: 168253, item_type: 'user', item_id: '3882670', total_score: 2016200, name: 'スタイルズ・クラッシュ', thumbnail_url: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/388/3882670.jpg', rank: 1 },
      { id: 168423, item_type: 'user', item_id: '71528496', total_score: 1746500, name: '小幡友美', thumbnail_url: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/7152/71528496.jpg', rank: 2 },
      { id: 168478, item_type: 'user', item_id: '96679594', total_score: 1599500, name: '砂ちゃん', thumbnail_url: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/9667/96679594.jpg', rank: 3 }
    ]
  }
};

describe('AUDITION_KEY_RE', () => {
  it('実例 key を受理し、不正を弾く', () => {
    expect(AUDITION_KEY_RE.test('202606-nicoadevent-sweets')).toBe(true);
    expect(AUDITION_KEY_RE.test('abc_123')).toBe(true);
    expect(AUDITION_KEY_RE.test('')).toBe(false);
    expect(AUDITION_KEY_RE.test('a')).toBe(false);
    expect(AUDITION_KEY_RE.test('../etc')).toBe(false);
    expect(AUDITION_KEY_RE.test('a b')).toBe(false);
    expect(AUDITION_KEY_RE.test('key/with/slash')).toBe(false);
  });
});

describe('buildAuditionEntryItemsUrl', () => {
  it('組み立てる', () => {
    expect(buildAuditionEntryItemsUrl('lv350658954')).toBe(
      'https://audition.nicovideo.jp/capi/v1/entry_items?item_type=live&item_id=lv350658954&include_owner_items=true&expose_platform=live'
    );
  });
  it('不正 liveId は null', () => {
    expect(buildAuditionEntryItemsUrl('123')).toBeNull();
    expect(buildAuditionEntryItemsUrl('lvx')).toBeNull();
    expect(buildAuditionEntryItemsUrl(null)).toBeNull();
  });
});

describe('buildAuditionRankingsUrl', () => {
  it('組み立てる（既定 limit=25・clamp）', () => {
    expect(buildAuditionRankingsUrl('202606-nicoadevent-sweets')).toBe(
      'https://audition.nicovideo.jp/capi/v1/auditions/202606-nicoadevent-sweets/rankings?limit=25'
    );
    expect(buildAuditionRankingsUrl('abc', { limit: 5 })).toContain('rankings?limit=5');
    expect(buildAuditionRankingsUrl('abc', { limit: 9999 })).toContain('rankings?limit=100');
    expect(buildAuditionRankingsUrl('abc', { limit: 0 })).toContain('rankings?limit=1');
  });
  it('不正 key は null（SSRF 面遮断）', () => {
    expect(buildAuditionRankingsUrl('../secret')).toBeNull();
    expect(buildAuditionRankingsUrl('')).toBeNull();
    expect(buildAuditionRankingsUrl('a b')).toBeNull();
  });
});

describe('pickAuditionContextFromEntryItems', () => {
  it('audition.key / entryId / selfStatus を取り出す', () => {
    const ctx = pickAuditionContextFromEntryItems(ENTRY_ITEMS);
    expect(ctx).not.toBeNull();
    expect(ctx.auditionKey).toBe('202606-nicoadevent-sweets');
    expect(ctx.entryId).toBe(169058);
    expect(ctx.selfStatus.rank).toBe(21);
    expect(ctx.selfStatus.score).toBe(1017300);
    expect(ctx.selfStatus.eventName).toContain('スイーツユートピア');
    expect(ctx.selfStatus.broadcasterName).toBe('うゆ♡');
  });
  it('entry_items 空（非イベント）は null', () => {
    expect(pickAuditionContextFromEntryItems({ meta: { status: 200 }, data: { entry_items: [] } })).toBeNull();
  });
  it('meta.status!==200 / key 不正 / null は null', () => {
    expect(pickAuditionContextFromEntryItems({ meta: { status: 500 }, data: { entry_items: [{}] } })).toBeNull();
    expect(
      pickAuditionContextFromEntryItems({ data: { entry_items: [{ audition: { key: '../x' } }] } })
    ).toBeNull();
    expect(pickAuditionContextFromEntryItems(null)).toBeNull();
  });
});

describe('normalizeAuditionRankingsResponse', () => {
  it('rows{rank,score,name,userId,thumbnailUrl} に正規化（記名 uid 付き）', () => {
    const out = normalizeAuditionRankingsResponse(RANKINGS, { max: 10 });
    expect(out).not.toBeNull();
    expect(out.totalCount).toBe(119);
    expect(out.rows).toHaveLength(3);
    expect(out.rows[0]).toMatchObject({
      rank: 1,
      score: 2016200,
      name: 'スタイルズ・クラッシュ',
      userId: '3882670'
    });
    expect(out.rows[0].thumbnailUrl).toMatch(/^https:\/\//);
  });

  it('max で丸める', () => {
    const out = normalizeAuditionRankingsResponse(RANKINGS, { max: 2 });
    expect(out.rows).toHaveLength(2);
  });

  it('item_type が user 以外なら userId を付けない（誤リンク防止）', () => {
    const json = {
      meta: { status: 200 },
      data: { entry_items: [{ item_type: 'channel', item_id: '999', total_score: 10, name: 'ch', rank: 1 }] }
    };
    const out = normalizeAuditionRankingsResponse(json, {});
    expect(out.rows[0].userId).toBeUndefined();
  });

  it('壊れ行（rank/score/name 欠落）は skip、全滅は null', () => {
    const json = {
      meta: { status: 200 },
      data: { entry_items: [{ name: '', total_score: 1, rank: 1 }, { name: 'x', rank: 0, total_score: 1 }] }
    };
    expect(normalizeAuditionRankingsResponse(json, {})).toBeNull();
  });

  it('meta.status!==200 / 非配列 / null は null', () => {
    expect(normalizeAuditionRankingsResponse({ meta: { status: 404 } }, {})).toBeNull();
    expect(normalizeAuditionRankingsResponse({ data: { entry_items: 'x' } }, {})).toBeNull();
    expect(normalizeAuditionRankingsResponse(null, {})).toBeNull();
  });

  it('SW 側 message type 契約（リテラル同期）', () => {
    expect(AUDITION_EVENT_RANKING_FETCH_MESSAGE_TYPE).toBe('NLS_AUDITION_EVENT_RANKING_FETCH');
  });
});

// 実機 lv350658954 の voting_user_ranking レスポンスを模したサンプル。
const VOTING = {
  meta: { status: 200 },
  data: {
    users: [
      { nickname: 'takana', icon_url: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/56/563676.jpg', account_type: 'premium', id: '563676', rank: 1, score: 723400 },
      { nickname: 'ぴとなちゃん♡', icon_url: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/69/690868.jpg', account_type: 'premium', id: '690868', rank: 2, score: 144800 },
      { nickname: '星守こう', icon_url: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/2665/26654042.jpg', account_type: 'regular', id: '26654042', rank: 5, score: 14100 }
    ]
  }
};

describe('buildAuditionVotingUserRankingUrl', () => {
  it('entryId から組み立てる（既定 limit=20・clamp）', () => {
    expect(buildAuditionVotingUserRankingUrl(169058)).toBe(
      'https://audition.nicovideo.jp/capi/v1/entry_items/169058/voting_user_ranking?limit=20'
    );
    expect(buildAuditionVotingUserRankingUrl('169058', { limit: 5 })).toContain('?limit=5');
    expect(buildAuditionVotingUserRankingUrl('169058', { limit: 9999 })).toContain('?limit=100');
  });
  it('不正 entryId は null', () => {
    expect(buildAuditionVotingUserRankingUrl('')).toBeNull();
    expect(buildAuditionVotingUserRankingUrl('0')).toBeNull();
    expect(buildAuditionVotingUserRankingUrl('abc')).toBeNull();
    expect(buildAuditionVotingUserRankingUrl('1/../x')).toBeNull();
  });
});

describe('eventVotingRankingStorageKey', () => {
  it('liveId 単位・小文字化・prefix 一致', () => {
    expect(eventVotingRankingStorageKey('LV123')).toBe('nls_event_voting_ranking_lv123');
    expect(eventVotingRankingStorageKey('lv123')).toMatch(
      new RegExp('^' + EVENT_VOTING_RANKING_STORAGE_PREFIX)
    );
  });
});

describe('normalizeAuditionVotingUserRankingResponse', () => {
  it('貢献度行形に正規化（記名 uid リンク + premium/regular）', () => {
    const rows = normalizeAuditionVotingUserRankingResponse(VOTING, { max: 10 });
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      rank: 1,
      name: 'takana',
      contribution: 723400,
      isAnonymous: false,
      userPageUrl: 'https://www.nicovideo.jp/user/563676',
      accountType: 'premium'
    });
    expect(rows[2].accountType).toBe('regular');
  });
  it('max で丸める', () => {
    expect(normalizeAuditionVotingUserRankingResponse(VOTING, { max: 2 })).toHaveLength(2);
  });
  it('数値 id が無い行は skip、全滅は null', () => {
    const json = { meta: { status: 200 }, data: { users: [{ nickname: 'x', score: 1, rank: 1 }] } };
    expect(normalizeAuditionVotingUserRankingResponse(json, {})).toBeNull();
  });
  it('meta.status!==200 / 非配列 / null は null', () => {
    expect(normalizeAuditionVotingUserRankingResponse({ meta: { status: 404 } }, {})).toBeNull();
    expect(normalizeAuditionVotingUserRankingResponse({ data: { users: 'x' } }, {})).toBeNull();
    expect(normalizeAuditionVotingUserRankingResponse(null, {})).toBeNull();
  });
});


describe('Phase 2: 複数イベント・全員一覧', () => {
  const entry = {
    meta: { status: 200 },
    data: {
      entry_items: [
        { id: 187425, rank: 19, total_score: 1165204, audition: { key: '202611-kohaku-shiro', title: '白組' }, item: { id: '11525592', nickname: 'fumiya' } },
        { id: 186272, rank: 122, total_score: 222600, audition: { key: '202611-nicoadevent-nabe', title: '鍋' }, item: { id: '11525592', nickname: 'fumiya' } },
        { id: 1, audition: { key: '../bad' } }
      ]
    }
  };
  it('すべての entry_items をイベントごとに（壊れたものは捨てる）', () => {
    const ev = normalizeAuditionEventsFromResponses(entry, [
      {
        key: '202611-kohaku-shiro',
        rankingsJson: { meta: { status: 200 }, data: { total_count: 136, entry_items: [{ item_type: 'user', item_id: '9', name: 'a', rank: 18, total_score: 1251795 }] } }
      },
      { key: '202611-nicoadevent-nabe', entryDetailJson: { data: { id: 186272, score_to_next_rank: 4300 } } }
    ]);
    expect(ev.map((e) => e.key)).toEqual(['202611-kohaku-shiro', '202611-nicoadevent-nabe']);
    expect(ev[0].self).toEqual({ id: '11525592', name: 'fumiya', rank: 19, score: 1165204, scoreToNext: null });
    expect(ev[0].rows).toEqual([{ id: '9', name: 'a', rank: 18, score: 1251795 }]);
    expect(ev[0].totalCount).toBe(136);
    expect(ev[1].self.scoreToNext).toBe(4300);
    expect(ev[1].rows).toEqual([]);
  });
  it('全員一覧: ページをまとめ、重複と壊れた行を捨てる', () => {
    const p = (items, tc = 3) => ({ meta: { status: 200 }, data: { total_count: tc, entry_items: items } });
    const r = normalizeAuditionFullRankingPages([
      p([{ item_id: '1', rank: 1, total_score: 10, name: 'a' }, { item_id: '2', rank: 2, total_score: 5, name: '' }]),
      p([{ item_id: '2', rank: 2, total_score: 5 }, { item_id: 'x', rank: 3, total_score: 1 }]),
      { meta: { status: 500 } }
    ]);
    expect(r).toEqual({ rows: [{ id: '1', name: 'a', rank: 1, score: 10 }, { id: '2', name: '2', rank: 2, score: 5 }], totalCount: 3 });
    expect(normalizeAuditionFullRankingPages([])).toBeNull();
  });
});

describe('attachAuditionEventFirstSeen', () => {
  it('最初に見たスコアを覚え、以後は変えない', () => {
    const m = new Map();
    const ev = (score) => [{ key: 'k-1', self: { score } }];
    const a = attachAuditionEventFirstSeen(ev(100), m, 'lv1', 1000);
    expect(a[0].localFirstSeen).toEqual({ at: 1000, score: 100 });
    const b = attachAuditionEventFirstSeen(ev(150), m, 'lv1', 2000);
    expect(b[0].localFirstSeen).toEqual({ at: 1000, score: 100 });
    expect(b[0].gotAt).toBe(2000);
  });
});
