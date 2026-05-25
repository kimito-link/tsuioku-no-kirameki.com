import { describe, it, expect } from 'vitest';
import {
  EVENT_PARTICIPATION_FETCH_MESSAGE_TYPE,
  EVENT_PARTICIPATION_STORAGE_PREFIX,
  EVENT_PARTICIPATION_DEFAULT_MAX,
  buildEventParticipationUrl,
  isLikelyEventParticipationShape,
  eventParticipationStorageKey,
  normalizeEventParticipationResponse
} from './eventParticipationProgramsApi.js';

// 実機 lv350605771 / planningEventId=472（出前館×ニコニコ 5月の宅飯配信祭り）で
// 独立 WebFetch により確証したレスポンス概形を模した一次資料相当のサンプル。
// ⚠️ この API は rank/score/points を一切持たない（名簿のみ）。
const REAL_SHAPED = {
  meta: { status: 200, errorCode: 'OK', totalCount: 3 },
  data: [
    {
      programId: 'lv350605449',
      program: {
        title: 'まったり配信',
        provider: 'community',
        schedule: { openTime: '...', beginTime: '...', endTime: '...', status: 'ON_AIR' }
      },
      statistics: { viewers: 1, comments: 0 },
      thumbnail: {
        screenshot: { large: 'https://asset2.dlive.nicovideo.jp/a/screenshot.jpg', small: 'https://asset2.dlive.nicovideo.jp/b/screenshot.jpg' },
        listing: { large: 'https://asset2.dlive.nicovideo.jp/c/screenshot.jpg', middle: '', flip: null }
      },
      programProvider: {
        name: 'ちん・ぽこ',
        programProviderId: '11582178',
        icons: {
          uri150x150: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/1158/11582178.jpg?1746820801',
          uri50x50: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/1158/11582178.s.jpg'
        }
      }
    },
    {
      programId: 'lv350605888',
      program: { title: '心花の配信', provider: 'user', schedule: { status: 'ON_AIR' } },
      statistics: { viewers: 27, comments: 28 },
      thumbnail: { listing: { large: 'https://asset2.dlive.nicovideo.jp/d/screenshot.jpg' } },
      programProvider: {
        name: '心花',
        programProviderId: '88888888',
        icons: { uri150x150: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/8888/88888888.jpg' }
      }
    },
    {
      programId: 'lv350605777',
      program: { title: 'ゆかいな仲間たち', provider: 'community', schedule: { status: 'ON_AIR' } },
      statistics: { viewers: 7, comments: 0 },
      thumbnail: { listing: { large: 'https://asset2.dlive.nicovideo.jp/e/screenshot.jpg' } },
      programProvider: {
        name: '馬場龍之介とゆかいな仲間たち',
        programProviderId: '22222222',
        icons: { uri150x150: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/2222/22222222.jpg' }
      }
    }
  ]
};

describe('EVENT_PARTICIPATION_FETCH_MESSAGE_TYPE', () => {
  it('background.js と文字列同期している契約値', () => {
    // background.js は本定数を import できない手書き成果物のため、値が変わると
    // SW 連携が静かに壊れる。契約として固定する。
    expect(EVENT_PARTICIPATION_FETCH_MESSAGE_TYPE).toBe('NLS_EVENT_PARTICIPATION_FETCH');
  });
});

describe('eventParticipationStorageKey / PREFIX', () => {
  it('liveId 単位のキーを prefix + 小文字 lv で作る', () => {
    expect(eventParticipationStorageKey('lv350605771')).toBe('nls_event_participation_lv350605771');
    expect(eventParticipationStorageKey('  LV350605771 ')).toBe('nls_event_participation_lv350605771');
  });
  it('PREFIX は key の先頭と一致する（prune 用）', () => {
    expect(eventParticipationStorageKey('lv1').startsWith(EVENT_PARTICIPATION_STORAGE_PREFIX)).toBe(true);
  });
  it('null/undefined でも prefix のみで落ちない', () => {
    expect(eventParticipationStorageKey(null)).toBe('nls_event_participation_');
  });
});

describe('buildEventParticipationUrl', () => {
  it('正の整数 id で正しい URL を作る', () => {
    expect(buildEventParticipationUrl(472)).toBe(
      'https://api.live2.nicovideo.jp/api/v1/planning-event/participation-programs?planningEventId=472'
    );
    expect(buildEventParticipationUrl('472')).toBe(
      'https://api.live2.nicovideo.jp/api/v1/planning-event/participation-programs?planningEventId=472'
    );
  });
  it('不正 id（SSRF 面）は null', () => {
    expect(buildEventParticipationUrl('')).toBeNull();
    expect(buildEventParticipationUrl('0')).toBeNull(); // 先頭ゼロ/ゼロは無効
    expect(buildEventParticipationUrl('07')).toBeNull(); // 先頭ゼロ
    expect(buildEventParticipationUrl('-1')).toBeNull();
    expect(buildEventParticipationUrl('1.5')).toBeNull();
    expect(buildEventParticipationUrl('abc')).toBeNull();
    expect(buildEventParticipationUrl('472; rm -rf')).toBeNull();
    expect(buildEventParticipationUrl(null)).toBeNull();
  });
});

describe('isLikelyEventParticipationShape', () => {
  it('data 配列を持てば true（meta.status は省略可）', () => {
    expect(isLikelyEventParticipationShape({ data: [] })).toBe(true);
    expect(isLikelyEventParticipationShape(REAL_SHAPED)).toBe(true);
  });
  it('meta.status が 200 以外なら false', () => {
    expect(isLikelyEventParticipationShape({ meta: { status: 404 }, data: [] })).toBe(false);
  });
  it('data 非配列・非オブジェクトは false', () => {
    expect(isLikelyEventParticipationShape({ data: {} })).toBe(false);
    expect(isLikelyEventParticipationShape(null)).toBe(false);
    expect(isLikelyEventParticipationShape('x')).toBe(false);
  });
});

describe('normalizeEventParticipationResponse', () => {
  it('視聴者数の降順に並べ、rank に並べ替え後の 1-index を入れる', () => {
    const rows = normalizeEventParticipationResponse(REAL_SHAPED);
    expect(rows).not.toBeNull();
    expect(rows.map((r) => r.name)).toEqual(['心花', '馬場龍之介とゆかいな仲間たち', 'ちん・ぽこ']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.contribution)).toEqual([27, 7, 1]); // viewers
  });

  it('記名（正の整数 provider）行に user ページ URL を付ける', () => {
    const rows = normalizeEventParticipationResponse(REAL_SHAPED);
    const shinka = rows.find((r) => r.name === '心花');
    expect(shinka.userPageUrl).toBe('https://www.nicovideo.jp/user/88888888');
    expect(shinka.isAnonymous).toBe(false);
    expect(shinka.programId).toBe('lv350605888');
  });

  it('配信者アイコン（icons.uri150x150）を thumbnailUrl に採用', () => {
    const rows = normalizeEventParticipationResponse(REAL_SHAPED);
    const chinpoko = rows.find((r) => r.name === 'ちん・ぽこ');
    expect(chinpoko.thumbnailUrl).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/1158/11582178.jpg?1746820801'
    );
  });

  it('metric=comments でコメント数の降順に並べる', () => {
    const rows = normalizeEventParticipationResponse(REAL_SHAPED, { metric: 'comments' });
    expect(rows.map((r) => r.name)).toEqual(['心花', 'ちん・ぽこ', '馬場龍之介とゆかいな仲間たち']);
    expect(rows.map((r) => r.contribution)).toEqual([28, 0, 0]);
  });

  it('selfProgramId は「他の配信者」一覧から除外する', () => {
    const rows = normalizeEventParticipationResponse(REAL_SHAPED, { selfProgramId: 'lv350605888' });
    expect(rows.map((r) => r.name)).toEqual(['馬場龍之介とゆかいな仲間たち', 'ちん・ぽこ']);
    expect(rows.find((r) => r.name === '心花')).toBeUndefined();
  });

  it('max で件数を打ち切る', () => {
    const rows = normalizeEventParticipationResponse(REAL_SHAPED, { max: 2 });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.name)).toEqual(['心花', '馬場龍之介とゆかいな仲間たち']);
  });

  it('onAirOnly=true は放送終了済みを除外する', () => {
    const withEnded = {
      meta: { status: 200 },
      data: [
        {
          programId: 'lv1',
          program: { schedule: { status: 'ENDED' } },
          statistics: { viewers: 999 },
          programProvider: { name: '終了配信', programProviderId: '111' }
        },
        {
          programId: 'lv2',
          program: { schedule: { status: 'ON_AIR' } },
          statistics: { viewers: 5 },
          programProvider: { name: '放送中', programProviderId: '222' }
        }
      ]
    };
    const rows = normalizeEventParticipationResponse(withEnded, { onAirOnly: true });
    expect(rows.map((r) => r.name)).toEqual(['放送中']);
  });

  it('非数値 provider（channel/community id）はリンクを付けない（誤リンク回避）', () => {
    const chRow = {
      meta: { status: 200 },
      data: [
        {
          programId: 'lv9',
          program: { schedule: { status: 'ON_AIR' } },
          statistics: { viewers: 3 },
          programProvider: { name: 'チャンネル番組', programProviderId: 'ch12345' }
        }
      ]
    };
    const rows = normalizeEventParticipationResponse(chRow);
    expect(rows[0].userPageUrl).toBeUndefined();
    expect(rows[0].name).toBe('チャンネル番組');
  });

  it('名前が空の壊れ行は捨てる', () => {
    const broken = {
      meta: { status: 200 },
      data: [
        { programId: 'lv1', statistics: { viewers: 5 }, programProvider: { name: '', programProviderId: '1' } },
        { programId: 'lv2', statistics: { viewers: 3 }, programProvider: { name: '有効', programProviderId: '2' } }
      ]
    };
    const rows = normalizeEventParticipationResponse(broken);
    expect(rows.map((r) => r.name)).toEqual(['有効']);
  });

  it('meta.status!==200 / data 非配列 / 0件 は null（fail-soft）', () => {
    expect(normalizeEventParticipationResponse({ meta: { status: 500 }, data: [] })).toBeNull();
    expect(normalizeEventParticipationResponse({ data: {} })).toBeNull();
    expect(normalizeEventParticipationResponse({ data: [] })).toBeNull();
    expect(normalizeEventParticipationResponse(null)).toBeNull();
  });

  it('同値の視聴者数は元の配列順で安定', () => {
    const tie = {
      meta: { status: 200 },
      data: [
        { programId: 'lvA', statistics: { viewers: 5 }, programProvider: { name: 'A', programProviderId: '1' } },
        { programId: 'lvB', statistics: { viewers: 5 }, programProvider: { name: 'B', programProviderId: '2' } },
        { programId: 'lvC', statistics: { viewers: 5 }, programProvider: { name: 'C', programProviderId: '3' } }
      ]
    };
    const rows = normalizeEventParticipationResponse(tie);
    expect(rows.map((r) => r.name)).toEqual(['A', 'B', 'C']);
  });

  it('EVENT_PARTICIPATION_DEFAULT_MAX は 10', () => {
    expect(EVENT_PARTICIPATION_DEFAULT_MAX).toBe(10);
  });

  it('同一配信者（同 uid）が複数番組で参加していても 1 件に集約し、代表は最大視聴者数の番組', () => {
    // 実機 2026-05-25 lv350606186 で「この」が 4 枚（1186/1077/509/469）並んだ症状の再現。
    const dup = {
      meta: { status: 200 },
      data: [
        { programId: 'lv1', statistics: { viewers: 509 }, programProvider: { name: 'この', programProviderId: '100' } },
        { programId: 'lv2', statistics: { viewers: 1186 }, programProvider: { name: 'この', programProviderId: '100' } },
        { programId: 'lv3', statistics: { viewers: 469 }, programProvider: { name: 'この', programProviderId: '100' } },
        { programId: 'lv4', statistics: { viewers: 1077 }, programProvider: { name: 'この', programProviderId: '100' } },
        { programId: 'lv9', statistics: { viewers: 300 }, programProvider: { name: '別人', programProviderId: '200' } }
      ]
    };
    const rows = normalizeEventParticipationResponse(dup);
    // 「この」は 1 件のみ・代表は最大の 1186・代表 programId は lv2
    const kono = rows.filter((r) => r.name === 'この');
    expect(kono).toHaveLength(1);
    expect(kono[0].contribution).toBe(1186);
    expect(kono[0].programId).toBe('lv2');
    // 全体は 2 件（この / 別人）で、視聴者数降順
    expect(rows.map((r) => r.name)).toEqual(['この', '別人']);
  });

  it('uid が違えば同名でも別配信者として残す', () => {
    const sameName = {
      meta: { status: 200 },
      data: [
        { programId: 'lvA', statistics: { viewers: 10 }, programProvider: { name: 'みなみ', programProviderId: '111' } },
        { programId: 'lvB', statistics: { viewers: 8 }, programProvider: { name: 'みなみ', programProviderId: '222' } }
      ]
    };
    const rows = normalizeEventParticipationResponse(sameName);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.userPageUrl)).toEqual([
      'https://www.nicovideo.jp/user/111',
      'https://www.nicovideo.jp/user/222'
    ]);
  });

  it('非記名（uid 無し・channel/community）は表示名で集約する', () => {
    const ch = {
      meta: { status: 200 },
      data: [
        { programId: 'lv1', statistics: { viewers: 4 }, programProvider: { name: '公式ch', programProviderId: 'ch555' } },
        { programId: 'lv2', statistics: { viewers: 7 }, programProvider: { name: '公式ch', programProviderId: 'ch555' } }
      ]
    };
    const rows = normalizeEventParticipationResponse(ch);
    expect(rows).toHaveLength(1);
    expect(rows[0].contribution).toBe(7); // 代表は最大視聴者数
    expect(rows[0].userPageUrl).toBeUndefined(); // 非記名はリンク無し
  });
});
