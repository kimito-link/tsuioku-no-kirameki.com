import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { backoffDelayMs, decideFetch } from './policy.js';
import { emptyState } from './model.js';
import { parseRankingHtml, RankingParseError } from './parse.js';
import { rankEntries } from './calc.js';
import { formatDelta, formatGap } from './format.js';
import { buildShareLinks, pagePath } from './share.js';
import { runScheduledFetch } from './job.js';
import { createMemoryStore } from './model.js';
import { formatJstDateTime, jstDateString, jstMinutesOfDay, parseOfficialUpdateAt } from './time.js';
import { buildUserAgent, FEATURES, OFFICIAL_RANKING_URL } from './constants.js';
import { loadDaytimeEstimates } from './board.js';
import { boardOgCard, buildKouhakuOgHtml, profileOgCard } from './ogHtml.js';
import { presentBoard } from './board.js';

const primary = new Date('2026-11-21T07:30:00.000Z');
const fetchedAt = new Date('2026-11-21T13:59:10.000Z');
const fixturePath = path.join(process.cwd(), 'src/fixtures/kouhaku/niconews-15106.html');
const html = readFileSync(fixturePath, 'utf8');

/**
 * @param {Partial<import('./model.js').FetchState>} partial
 */
function state(partial) {
  return { ...emptyState(), jstDate: '2026-11-21', ...partial };
}

/**
 * @param {'紅組'|'白組'} _team
 * @param {number} rank
 * @param {string} userId
 * @param {string} name
 * @param {string} score
 */
function row(_team, rank, userId, name, score) {
  return `<tr><td>${rank}</td><td><a href="https://www.nicovideo.jp/user/${userId}"><img src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/x.jpg"></a></td><td><a href="https://www.nicovideo.jp/user/${userId}">${name}</a></td><td>${score}</td></tr>`;
}

describe('取得してよいか', () => {
  it('失敗1回の待ちは2時間', () => {
    expect(backoffDelayMs(1)).toBe(2 * 60 * 60 * 1000);
  });

  it('16:30 JST ちょうどは取得し、その1分前は取得しない', () => {
    expect(decideFetch(emptyState(), primary)).toEqual({ action: 'fetch' });
    expect(decideFetch(emptyState(), new Date('2026-11-21T07:29:00.000Z'))).toEqual({
      action: 'skip',
      reason: 'too-early'
    });
  });

  it('成功した日は再取得しない', () => {
    const done = state({
      attempts: 1,
      lastAttemptAt: primary.toISOString(),
      lastSuccessAt: primary.toISOString(),
      lastHttpStatus: 200
    });
    expect(decideFetch(done, new Date('2026-11-21T10:30:00.000Z'))).toEqual({
      action: 'skip',
      reason: 'already-succeeded'
    });
  });

  it('失敗の直後は待たせ、2時間後の再試行枠では取得する', () => {
    const failed = state({
      attempts: 1,
      lastAttemptAt: primary.toISOString(),
      lastError: 'HTTP 500'
    });
    expect(decideFetch(failed, new Date('2026-11-21T08:30:00.000Z'))).toEqual({
      action: 'skip',
      reason: 'backoff'
    });
    expect(decideFetch(failed, new Date('2026-11-21T10:30:00.000Z'))).toEqual({ action: 'fetch' });
  });

  it('2回失敗した日はそれ以上取得しない', () => {
    const twice = state({
      attempts: 2,
      lastAttemptAt: '2026-11-21T10:30:00.000Z',
      lastError: 'HTTP 500'
    });
    expect(decideFetch(twice, new Date('2026-11-21T12:30:00.000Z'))).toEqual({
      action: 'skip',
      reason: 'daily-cap'
    });
  });

  it('日付が変わると回数は戻り、ETag用の成功時刻は昨日のまま取得できる', () => {
    const yesterday = state({
      attempts: 2,
      lastSuccessAt: primary.toISOString(),
      lastSnapshotId: primary.toISOString(),
      etag: '"abc"'
    });
    expect(decideFetch(yesterday, new Date('2026-11-22T07:30:00.000Z'))).toEqual({ action: 'fetch' });
  });

  it('イベントの外では取得しない', () => {
    expect(decideFetch(emptyState(), new Date('2026-11-15T07:30:00.000Z')).action).toBe('skip');
    expect(decideFetch(emptyState(), new Date('2026-12-03T07:30:00.000Z'))).toEqual({
      action: 'skip',
      reason: 'event-closed'
    });
  });
});

describe('公式15106のパーサ', () => {
  const parsed = parseRankingHtml(html, { fetchedAt });

  it('紅組と白組を25人ずつ読む', () => {
    expect(parsed.entries.filter((entry) => entry.team === 'aka')).toHaveLength(25);
    expect(parsed.entries.filter((entry) => entry.team === 'shiro')).toHaveLength(25);
  });

  it('更新表記と先頭・末尾の行が公式HTMLと一致する', () => {
    expect(parsed.officialUpdateLabel).toBe('11月21日（土）15時55分頃更新分');
    expect(parsed.officialUpdateAt).toBe('2026-11-21T15:55:00+09:00');
    expect(parsed.entries.find((entry) => entry.team === 'aka' && entry.rank === 1)).toMatchObject({
      userId: '41979749',
      displayName: 'ゴリアテ',
      score: 199305
    });
    expect(parsed.entries.find((entry) => entry.team === 'aka' && entry.rank === 25)).toMatchObject({
      userId: '2473229',
      displayName: '山田',
      score: 24915
    });
    expect(parsed.entries.find((entry) => entry.team === 'shiro' && entry.rank === 1)).toMatchObject({
      userId: '119753713',
      displayName: 'ひとえちゃん',
      score: 472065
    });
    expect(parsed.entries.find((entry) => entry.team === 'shiro' && entry.rank === 25)).toMatchObject({
      userId: '63355594',
      displayName: '牛脂ちゃん［20］',
      score: 42990
    });
  });

  it('公式ページの配信者アイコンURLだけを残す', () => {
    expect(parsed.entries.find((entry) => entry.userId === '41979749')?.iconUrl).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/4197/41979749.jpg'
    );
    expect(parsed.entries.find((entry) => entry.userId === '144158487')?.iconUrl).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/14415/144158487.jpg'
    );
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain('niconicoinfo_logo');
    expect(serialized).not.toContain('wp-content');
  });

  it('保存済みシードは、このフィクスチャの再パースと一致する', async () => {
    const seed = (await import('../../server/kouhakuSeed.js')).default;
    const headers = readFileSync(path.join(process.cwd(), 'src/fixtures/kouhaku/niconews-15106.headers.txt'), 'utf8');
    expect(seed.officialUpdateLabel).toBe(parsed.officialUpdateLabel);
    expect(seed.officialUpdateAt).toBe(parsed.officialUpdateAt);
    expect(seed.entries).toEqual(parsed.entries);
    expect(seed.etag).toBe(headers.match(/^etag:\s*(.+)$/im)?.[1]?.trim());
    expect(JSON.stringify(seed)).not.toContain('niconicoinfo_logo');
  });

  it('改行・文字参照・カンマ区切りスコアを読む', () => {
    const synthetic = `
      <p>※11月21日（土）9時5分頃更新分</p>
      <h3 class="is-pink"><span>紅組</span></h3>
      <table>
        ${row('紅組', 1, '10', 'A&amp;B', '1,000')}
      </table>
      <h3 class="is-yellow"><span>白組</span></h3>
      <table>
        ${row('白組', 1, '20', '白', '5')}
      </table>
    `;
    const result = parseRankingHtml(synthetic, { fetchedAt });
    expect(result.entries.find((entry) => entry.userId === '10')).toMatchObject({
      displayName: 'A&B',
      score: 1000,
      team: 'aka',
      iconUrl: null
    });
    expect(result.officialUpdateAt).toBe('2026-11-21T09:05:00+09:00');
    expect(JSON.stringify(result)).not.toContain('nimg.jp');
  });

  it('更新表記が無いHTMLは保存しない', () => {
    expect(() => parseRankingHtml('<h3><span>紅組</span></h3>', { fetchedAt })).toThrow(RankingParseError);
  });
});

describe('順位差と前回比', () => {
  const current = [
    { team: 'aka', rank: 1, userId: '1', displayName: '甲', score: 1000 },
    { team: 'aka', rank: 2, userId: '2', displayName: '乙', score: 800 },
    { team: 'aka', rank: 3, userId: '3', displayName: '丙', score: 800 }
  ];
  const previous = [
    { team: 'aka', rank: 1, userId: '2', displayName: '旧名', score: 500 },
    { team: 'aka', rank: 4, userId: '9', displayName: '圏外になる人', score: 100 }
  ];
  const ranked = rankEntries(current, previous);

  it('1位は差が無く、2位は直上との差', () => {
    const first = ranked[0];
    const second = ranked[1];
    expect(first?.gapToNext).toBeNull();
    expect(formatGap(first)).toBe('首位');
    expect(second).toMatchObject({ gapToNext: 200, nextRank: 1 });
    expect(formatGap(second)).toBe('1位まであと 200 pt');
  });

  it('同点は 0', () => {
    expect(ranked[2]).toMatchObject({ gapToNext: 0, nextRank: 2 });
    expect(formatGap(ranked[2])).toBe('2位と同点');
  });

  it('前回比はユーザーIDで結び、名前が変わっても差を出す', () => {
    expect(ranked.find((entry) => entry.userId === '2')).toMatchObject({
      scoreDelta: 300,
      previousRank: 1,
      previousScore: 500
    });
    expect(formatDelta(300)).toBe('前回 +300');
    expect(ranked.find((entry) => entry.userId === '1')?.scoreDelta).toBeNull();
    expect(formatDelta(null)).toBe('前回 —');
  });
});

describe('共有リンク', () => {
  const entry = {
    team: 'aka',
    rank: 2,
    userId: '144158487',
    displayName: 'りんこ',
    score: 187835,
    gapToNext: 11470,
    nextRank: 1,
    scoreDelta: null,
    previousRank: null,
    previousScore: null
  };

  it('X と LINE は https だけで、LINE の共有URLには外部ブラウザ指定がある', () => {
    const share = buildShareLinks(entry, 'https://example.com', '11月21日（土）15時55分頃更新分');
    expect(pagePath(entry.userId)).toBe('/live/kouhaku/u/144158487/');
    expect(share.pageUrl).toBe('https://example.com/live/kouhaku/u/144158487/?openExternalBrowser=1');
    expect(share.xUrl.startsWith('https://x.com/intent/post?')).toBe(true);
    expect(share.lineUrl.startsWith('https://social-plugins.line.me/lineit/share?')).toBe(true);
    expect(decodeURIComponent(share.lineUrl)).toContain('openExternalBrowser=1');
    expect(share.xUrl).not.toContain('line://');
    expect(share.lineUrl).not.toContain('line://');
    expect(share.text).toContain('りんこ');
    expect(share.text).toContain('1位まであと 11,470 pt');
    expect(share.text).not.toContain('line://');
  });
});

describe('定期取得ジョブ', () => {
  it('200 のときスナップショットを1枚保存し、同じ日の2回目は GET しない', async () => {
    let calls = 0;
    const store = createMemoryStore();
    const saved = await runScheduledFetch({
      now: primary,
      store,
      userAgent: 'KouhakuOuen/test',
      fetchPage: async () => {
        calls += 1;
        return { ok: true, status: 200, etag: '"v1"', html };
      }
    });
    expect(saved.body).toMatchObject({ ok: true, action: 'saved', entryCount: 50 });
    const again = await runScheduledFetch({
      now: new Date('2026-11-21T10:30:00.000Z'),
      store,
      userAgent: 'KouhakuOuen/test',
      fetchPage: async () => {
        calls += 1;
        return { ok: true, status: 200, etag: '"v1"', html };
      }
    });
    expect(again.body).toMatchObject({ action: 'skipped', reason: 'already-succeeded' });
    expect(calls).toBe(1);
    const latest = await store.getLatest();
    expect(latest?.origin).toBe('cron');
    expect(latest?.entries.find((entry) => entry.rank === 1 && entry.team === 'aka')).toMatchObject({
      displayName: 'ゴリアテ',
      iconUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/4197/41979749.jpg'
    });
    expect(JSON.stringify(latest)).not.toContain('niconicoinfo_logo');
  });

  it('304 は成功扱いで新しいスナップショットを作らない', async () => {
    let calls = 0;
    const store = createMemoryStore();
    const fetchPage = async () => {
      calls += 1;
      return { ok: true, status: 304, etag: '"same"' };
    };
    const result = await runScheduledFetch({ now: primary, store, fetchPage, userAgent: 'ua' });
    expect(result.body).toMatchObject({ action: 'not-modified' });
    expect(await store.getLatest()).toBeNull();
    const stored = await store.getState();
    expect(stored.lastHttpStatus).toBe(304);
    expect(stored.etag).toBe('"same"');
    await runScheduledFetch({ now: new Date('2026-11-21T10:30:00.000Z'), store, fetchPage, userAgent: 'ua' });
    expect(calls).toBe(1);
  });

  it('失敗したらその場で再GETせず、バックオフ後に1回だけ再試行する', async () => {
    let calls = 0;
    const store = createMemoryStore();
    const fetchPage = async () => {
      calls += 1;
      return { ok: false, status: 503, etag: null, error: 'HTTP 503' };
    };
    await runScheduledFetch({ now: primary, store, fetchPage, userAgent: 'ua' });
    await runScheduledFetch({ now: new Date('2026-11-21T08:30:00.000Z'), store, fetchPage, userAgent: 'ua' });
    expect(calls).toBe(1);
    await runScheduledFetch({ now: new Date('2026-11-21T10:30:00.000Z'), store, fetchPage, userAgent: 'ua' });
    expect(calls).toBe(2);
    await runScheduledFetch({ now: new Date('2026-11-21T12:30:00.000Z'), store, fetchPage, userAgent: 'ua' });
    expect(calls).toBe(2);
  });

  it('試行回数の保存に失敗したら GET しない', async () => {
    let calls = 0;
    const store = createMemoryStore();
    const result = await runScheduledFetch({
      now: primary,
      store: {
        ...store,
        saveState: async () => {
          throw new Error('disk');
        }
      },
      fetchPage: async () => {
        calls += 1;
        return { ok: true, status: 200, etag: null, html };
      },
      userAgent: 'ua'
    });
    expect(result.body).toMatchObject({ action: 'failed', message: 'state-unavailable' });
    expect(calls).toBe(0);
  });

  it('条件付きGETに、保存してある ETag を渡す', async () => {
    const store = createMemoryStore({
      state: {
        schemaVersion: 1,
        jstDate: '2026-11-20',
        attempts: 1,
        lastAttemptAt: '2026-11-20T07:30:00.000Z',
        lastSuccessAt: '2026-11-20T07:30:00.000Z',
        lastError: null,
        etag: '"previous"',
        lastHttpStatus: 200,
        lastSnapshotId: null
      }
    });
    /** @type {string|null} */
    let seen = 'unset';
    await runScheduledFetch({
      now: primary,
      store,
      userAgent: 'KouhakuOuen/1.0 (+https://tsuioku-no-kirameki.com/)',
      fetchPage: async (input) => {
        seen = input.etag;
        expect(input.userAgent).toBe('KouhakuOuen/1.0 (+https://tsuioku-no-kirameki.com/)');
        expect(input.userAgent).not.toContain('@');
        expect(input.userAgent).not.toContain('/about');
        return { ok: true, status: 304, etag: '"previous"' };
      }
    });
    expect(seen).toBe('"previous"');
  });
});

describe('JST', () => {
  it('16:30 JST は 07:30 UTC', () => {
    const date = new Date('2026-11-21T07:30:00.000Z');
    expect(jstDateString(date)).toBe('2026-11-21');
    expect(jstMinutesOfDay(date)).toBe(16 * 60 + 30);
    expect(formatJstDateTime(date.toISOString())).toBe('2026年11月21日 16:30');
  });

  it('日付は日本時間の 0:00 で切り替わる', () => {
    expect(jstDateString(new Date('2026-11-21T14:59:59.000Z'))).toBe('2026-11-21');
    expect(jstDateString(new Date('2026-11-21T15:00:00.000Z'))).toBe('2026-11-22');
  });

  it('公式更新表記に年が無くても取得日の年を補う', () => {
    expect(parseOfficialUpdateAt('11月21日（土）15時55分頃更新分', fetchedAt)).toBe('2026-11-21T15:55:00+09:00');
  });

  it('存在しない日付は採用しない', () => {
    expect(parseOfficialUpdateAt('11月31日（土）15時55分頃更新分', new Date('2026-11-21T00:00:00.000Z'))).toBeNull();
  });
});

describe('推定（日中）と連絡先', () => {
  it('フラグは off で、画面用の読み込みは null', () => {
    expect(FEATURES.daytimeEstimate).toBe(false);
    expect(loadDaytimeEstimates()).toBeNull();
  });

  it('User-Agent の連絡先はサイトURLだけ', () => {
    expect(buildUserAgent('https://tsuioku-no-kirameki.com')).toBe('KouhakuOuen/1.0 (+https://tsuioku-no-kirameki.com/)');
    expect(OFFICIAL_RANKING_URL).toBe('https://blog.nicovideo.jp/niconews/15106');
  });

  it('共有HTMLに line スキームを入れない', () => {
    const parsed = parseRankingHtml(html, { fetchedAt });
    const snapshot = {
      schemaVersion: 1,
      id: fetchedAt.toISOString(),
      fetchedAt: fetchedAt.toISOString(),
      sourceUrl: OFFICIAL_RANKING_URL,
      officialUpdateLabel: parsed.officialUpdateLabel,
      officialUpdateAt: parsed.officialUpdateAt,
      etag: null,
      previousId: null,
      origin: 'bootstrap',
      entries: parsed.entries
    };
    const board = presentBoard(snapshot, null, null);
    const card = profileOgCard({
      entry: board.aka[1],
      officialUpdateLabel: board.officialUpdateLabel
    });
    const page = buildKouhakuOgHtml(card);
    expect(page).toContain(board.aka[1].displayName);
    expect(page).toContain('公式は1日1回更新');
    expect(page).toContain('property="og:image"');
    expect(page).toContain(`/api/kouhaku-og-image?user=${board.aka[1].userId}`);
    expect(page).not.toContain('line://');
    expect(page).not.toContain('nimg.jp');
    expect(buildKouhakuOgHtml(boardOgCard(board))).toContain('/live/kouhaku/');
  });
});

describe('画面は公式ページを取りに行かない', () => {
  function walk(dir) {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return walk(full);
      return [full];
    });
  }

  it('公開ページは公式15106を取りに行かず、line スキームも無い', () => {
    const files = [
      ...walk('tsuioku-no-kirameki/live/kouhaku'),
      'tsuioku-no-kirameki/live/index.html',
      'tsuioku-no-kirameki/assets/js/kouhaku-board.js',
      'tsuioku-no-kirameki/assets/css/kouhaku-ranking.css'
    ];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toContain('fetchRankingPage');
      expect(text, file).not.toContain('runScheduledFetch');
      expect(text, file).not.toContain('line://');
    }
    const script = readFileSync('tsuioku-no-kirameki/assets/js/kouhaku-board.js', 'utf8');
    expect(script).not.toContain('blog.nicovideo.jp');
    const live = readFileSync('tsuioku-no-kirameki/live/index.html', 'utf8');
    expect(live).toContain('id="list"');
    expect(live).toContain('id="kouhaku"');
    expect(live).toContain('id="kouhaku-root"');
    expect(live).toContain('assets/js/kouhaku-board.js');
    expect(script).toContain('usericon/defaults/blank.jpg');
    expect(script).toContain('loading');
  });
});
