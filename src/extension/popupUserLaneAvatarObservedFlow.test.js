import { describe, expect, it } from 'vitest';
import { mergeStoredCommentDedupeVariants } from '../lib/storedCommentDedupeMerge.js';
import { buildStoryUserLaneCandidateRow } from '../lib/storyUserLaneRowModel.js';
import { niconicoDefaultUserIconUrl } from '../lib/supportGrowthTileSrc.js';
import { userLaneCandidatesFromStorage } from '../lib/userLaneCandidatesFromStorage.js';

const lanePickCtx = {
  yukkuriSrc: 'images/yukkuri.png',
  tvSrc: 'images/tv.svg',
  anonymousIdenticonEnabled: true,
  anonymousIdenticonDataUrl:
    'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E'
};

describe('popup ストレージ重複マージ → ユーザーレーン tier（avatarObserved 保持）', () => {
  it('同一 commentNo の先頭行に avatarObserved が無く、後続行に true があるときマージ後は tier 3', () => {
    const uid = '141965615';
    const nick = 'りん';
    const http = niconicoDefaultUserIconUrl(uid);
    expect(http).toMatch(/nicoaccount\/usericon\/s\//);

    const earlier = {
      liveId: 'lv123',
      commentNo: '42',
      text: '応援してます',
      userId: uid,
      nickname: nick,
      avatarUrl: http
    };
    const laterObserved = {
      ...earlier,
      avatarObserved: true
    };

    const merged = mergeStoredCommentDedupeVariants(
      /** @type {Record<string, unknown>} */ (earlier),
      /** @type {Record<string, unknown>} */ (laterObserved)
    );
    expect(merged.avatarObserved).toBe(true);

    const row = buildStoryUserLaneCandidateRow(
      merged,
      0,
      http,
      lanePickCtx
    );
    expect(row).not.toBeNull();
    expect(row?.profileTier).toBe(3);
  });

  it('マージで avatarObserved が落ちた場合は合成 canonical のみでは tier 2（退行の再発防止）', () => {
    const uid = '141965615';
    const http = niconicoDefaultUserIconUrl(uid);
    const entryMissingObserved = {
      liveId: 'lv123',
      commentNo: '99',
      text: 'test',
      userId: uid,
      nickname: 'りん',
      avatarUrl: http
    };
    const row = buildStoryUserLaneCandidateRow(
      entryMissingObserved,
      0,
      http,
      lanePickCtx
    );
    expect(row?.profileTier).toBe(2);
  });
});

describe('userLaneCandidatesFromStorage → buildStoryUserLaneCandidateRow（storage 集約）', () => {
  const eightNumericUids = [
    '125628526',
    '130123037',
    '134010736',
    '13714254',
    '30678345',
    '4348420',
    '91428901',
    '97561760'
  ];

  it('8 名の数値IDで avatarObserved が行のどれかに分散していても集約後は全員 tier 3', () => {
    const lv = 'lv_eight_lane';
    /** @type {Record<string, unknown>[]} */
    const stored = [];
    let t = 1;
    for (const uid of eightNumericUids) {
      const http = niconicoDefaultUserIconUrl(uid);
      stored.push({
        liveId: lv,
        commentNo: String(t++),
        text: 'x',
        userId: uid,
        nickname: 'ゲスト',
        avatarUrl: http,
        capturedAt: 1000 + t
      });
      stored.push({
        liveId: lv,
        commentNo: String(t++),
        text: 'y',
        userId: uid,
        nickname: 'ゲスト',
        avatarUrl: '',
        avatarObserved: true,
        capturedAt: 2000 + t
      });
    }

    const agg = userLaneCandidatesFromStorage(stored, lv);
    expect(agg.length).toBe(8);
    for (const a of agg) {
      expect(a.avatarObserved).toBe(true);
      const http = niconicoDefaultUserIconUrl(a.userId);
      const row = buildStoryUserLaneCandidateRow(
        {
          liveId: lv,
          userId: a.userId,
          nickname: a.nickname,
          avatarUrl: a.avatarUrl,
          ...(a.avatarObserved ? { avatarObserved: true } : {})
        },
        0,
        http,
        lanePickCtx
      );
      expect(row?.profileTier).toBe(3);
    }
  });

  it('別 liveId の行は集約に混ざらない', () => {
    const targetLv = 'lv_only';
    const rows = [
      {
        liveId: targetLv,
        userId: '100001',
        nickname: 'A',
        text: 'a',
        capturedAt: 1
      },
      {
        liveId: 'lv_intruder',
        userId: '999999',
        nickname: 'Intruder',
        text: 'b',
        capturedAt: 2
      }
    ];
    const agg = userLaneCandidatesFromStorage(rows, targetLv);
    expect(agg.map((x) => x.userId).sort()).toEqual(['100001']);
  });
});
