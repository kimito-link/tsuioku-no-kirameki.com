import { describe, it, expect } from 'vitest';
import { buildMarketingDashboardHtml } from './marketingChartsHtml.js';
import { aggregateMarketingReport } from './marketingAggregate.js';

/** @returns {import('./marketingAggregate.js').MarketingReport} */
function minimal() {
  const base = Date.now() - 3_600_000;
  /** @type {import('./commentRecord.js').StoredComment[]} */
  const comments = [];
  for (let i = 0; i < 50; i++) {
    const minute = i % 30;
    const offsetInMin = minute * 60_000 + (i % 17) * 900;
    comments.push({
      id: `c${i}`,
      liveId: 'lv123',
      commentNo: String(2000 + i),
      text:
        i === 3
          ? 'see https://example.com/x 😀'
          : i % 11 === 0
            ? `link https://nico.jp/${i}`
            : `hello ${i}`,
      userId: i === 0 ? 'u1' : `u${(i % 10) + 1}`,
      nickname: i < 20 ? 'Alice' : '',
      avatarUrl: i === 1 ? 'https://example.com/av.jpg' : '',
      capturedAt: base + offsetInMin,
      vpos: i * 400,
      is184: i % 6 === 0,
      selfPosted: i === 0
    });
  }
  return aggregateMarketingReport(comments, 'lv123');
}

/** @param {Partial<import('./eventRankingReportModel.js').EventRankingReportModel>} [overrides] */
function eventRankingFixture(overrides = {}) {
  return {
    eventName: '5月病なんか銀河系まで飛んでいけ！',
    self: {
      rank: 2,
      score: 12345,
      diffToNext: 100,
      broadcasterName: '公開配信者Link'
    },
    rows: [
      {
        rank: 1,
        score: 23456,
        name: 'こん太Channel',
        isAnonymous: false,
        thumbnailUrl: 'https://example.test/konta.jpg',
        userId: '111'
      },
      {
        rank: 2,
        score: 12345,
        name: '公開配信者Link',
        isAnonymous: false,
        thumbnailUrl: 'data:image/png;base64,evil',
        userId: '222'
      }
    ],
    capturedAt: Date.now() - 30_000,
    ageMs: 30_000,
    isStale: false,
    ...overrides
  };
}

describe('buildMarketingDashboardHtml', () => {
  it('完全な HTML ドキュメントを返す', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('lv123');
  });

  it('eventRanking opt が無いときはイベント順位セクションを出さない', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).not.toContain('id="mkt-event-ranking"');
    expect(html).not.toContain('<h2>🏆 イベント順位</h2>');
  });

  it('eventRanking opt があるとイベント名・本人順位・参加配信者TOPを出す', () => {
    const html = buildMarketingDashboardHtml(minimal(), {
      eventRanking: eventRankingFixture({ isStale: true })
    });
    expect(html).toContain('id="mkt-event-ranking"');
    expect(html).toContain('5月病なんか銀河系まで飛んでいけ！');
    expect(html).toContain('公開配信者Link');
    expect(html).toContain('2位');
    expect(html).toContain('12,345');
    expect(html).toContain('あと💎100 で 1位');
    expect(html).toContain('参加配信者TOP');
    expect(html).toContain('こん太Channel');
    expect(html).toContain('💎23,456');
    expect(html).toContain('少し前に取得した値');
  });

  it('eventRanking の data: サムネは落とし https サムネだけ残す', () => {
    const html = buildMarketingDashboardHtml(minimal(), {
      eventRanking: eventRankingFixture({
        eventName: '悪い<script>alert(1)</script>',
        rows: [
          {
            rank: 1,
            score: 50,
            name: '安全サムネ',
            isAnonymous: false,
            thumbnailUrl: 'https://example.test/safe.jpg'
          },
          {
            rank: 2,
            score: 40,
            name: '<b>危険サムネ</b>',
            isAnonymous: false,
            thumbnailUrl: 'data:image/png;base64,evil'
          }
        ]
      })
    });
    expect(html).toContain('https://example.test/safe.jpg');
    expect(html).not.toContain('data:image/png;base64,evil');
    expect(html).toContain('onerror="this.onerror=null;this.hidden=true"');
    expect(html).toContain('悪い&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;危険サムネ&lt;/b&gt;');
    expect(html).not.toContain('悪い<script>alert(1)</script>');
  });

  it('maskShareLabels=true でも公開イベントランキングの配信者名は伏せない', () => {
    const html = buildMarketingDashboardHtml(minimal(), {
      maskShareLabels: true,
      eventRanking: eventRankingFixture()
    });
    expect(html).toContain('共有向けに表示名を伏せた出力');
    expect(html).toContain('イベント順位は公開ランキング由来');
    expect(html).toContain('公開配信者Link');
    expect(html).toContain('こん太Channel');
    expect(html).toContain('https://example.test/konta.jpg');
  });

  it('KPI セクションが含まれる', () => {
    const r = minimal();
    const html = buildMarketingDashboardHtml(r);
    expect(html).toContain('KPI サマリ');
    expect(html).toContain(String(r.totalComments));
  });

  it('タイムラインの SVG が含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('コメントタイムライン');
    expect(html).toContain('<svg');
    expect(html).toContain('<polyline');
  });

  it('セグメント円グラフが含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('ユーザーセグメント');
    expect(html).toContain('ヘビー');
  });

  it('トップコメンターが含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('トップコメンター');
    expect(html).toContain('Alice');
  });

  it('giftUsers を渡すとギフトの流れセクション（mkt-gift-flow）が含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal(), {
      giftUsers: [
        {
          userId: '88210441',
          nickname: 'ギフター',
          throwCount: 3,
          capturedAt: Date.now() - 60_000
        }
      ]
    });
    expect(html).toContain('id="mkt-gift-flow"');
    expect(html).toContain('ギフター');
    expect(html).toContain('ギフト前後');
  });

  it('トップコメンターの数値 ID は niconico ユーザーページへのリンクで包まれる（手元用）', () => {
    // minimal() の user u1..u10 は数値でないため、リンク化されない。
    // 数値 ID を持つレポートを作って挙動を確認する。
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      {
        id: 'x1',
        liveId: 'lv123',
        commentNo: '1',
        text: 'hello',
        userId: '88210441',
        nickname: 'のら',
        avatarUrl: '',
        capturedAt: Date.now(),
        vpos: 0,
        is184: false,
        selfPosted: false
      }
    ];
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'));
    expect(html).toContain('href="https://www.nicovideo.jp/user/88210441"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    // displayUserLabel により「のら（88210441）」形式で表示されリンクで包まれる。
    expect(html).toContain('>のら（88210441）</a>');
  });

  it('複数の匿名 (a:xxxx) ユーザーを TOP に載せると、shortId 付きラベルで識別できる', () => {
    // 旧実装は `nickname || userId` だけだったため、nickname='匿名' が複数人並ぶと
    // ランキング上で見分けが付かなかった。displayUserLabel を通して
    // 「匿名（<shortId>）」形になり、ユーザごとに区別できる。
    // shortUserKeyDisplay は 18 文字までは丸ごと出す（a:XXX…YYY に切るのは 19 文字以上）。
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      {
        id: 'a1',
        liveId: 'lv123',
        commentNo: '1',
        text: 'hi',
        userId: 'a:AbCdEfGhIjKlMnOp',
        nickname: '匿名',
        avatarUrl: '',
        capturedAt: Date.now(),
        vpos: 0,
        is184: true,
        selfPosted: false
      },
      {
        id: 'a2',
        liveId: 'lv123',
        commentNo: '2',
        text: 'hi',
        userId: 'a:ZyWvUtSrQpOnMlKj',
        nickname: '匿名',
        avatarUrl: '',
        capturedAt: Date.now(),
        vpos: 0,
        is184: true,
        selfPosted: false
      }
    ];
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'));
    // 2 人とも nickname は「匿名」だが、ラベルに shortId が付くので識別できる。
    // a:AbCdEfGhIjKlMnOp はちょうど 18 文字なのでそのまま表示される。
    expect(html).toContain('匿名（a:AbCdEfGhIjKlMnOp）');
    expect(html).toContain('匿名（a:ZyWvUtSrQpOnMlKj）');
    // リンクにはなっていない（匿名はプロフィールページが無い）
    expect(html).not.toContain('href="https://www.nicovideo.jp/user/a:');
  });

  it('maskShareLabels のときはトップコメンター名をリンクにしない（共有配慮）', () => {
    // 伏せ字名をリンクで包むと、リンク先（/user/<uid>）から本人を特定できて台無しになる。
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      {
        id: 'x1',
        liveId: 'lv123',
        commentNo: '1',
        text: 'hello',
        userId: '88210441',
        nickname: 'のら',
        avatarUrl: '',
        capturedAt: Date.now(),
        vpos: 0,
        is184: false,
        selfPosted: false
      }
    ];
    const html = buildMarketingDashboardHtml(
      aggregateMarketingReport(comments, 'lv123'),
      { maskShareLabels: true }
    );
    expect(html).not.toContain('href="https://www.nicovideo.jp/user/88210441"');
  });

  it('時間帯ヒートマップが含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('時間帯ヒートマップ');
    expect(html).toContain('mkt-hour');
  });

  it('XSS: liveId にタグが入ってもエスケープされる', () => {
    const r = minimal();
    r.liveId = '<script>alert(1)</script>';
    const html = buildMarketingDashboardHtml(r);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('りんく・こん太・たぬ姉の案内ブロックが含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('りんく・こん太・たぬ姉から');
    expect(html).toContain('mkt-advice--tanu');
    expect(html).toContain('mkt-advice--link');
    expect(html).toContain('mkt-advice--konta');
    expect(html).toContain('mkt-advice-row');
    expect(html).toContain('mkt-advice__bubble');
    expect(html).toContain('mkt-advice__avatar');
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('追憶のきらめき');
  });

  it('冒頭案内にりんく・こん太・たぬ姉の吹き出しが各1つずつ', () => {
    const html = buildMarketingDashboardHtml(minimal());
    const sectionMatch = html.match(
      /<section class="mkt-section mkt-section--advice"[\s\S]*?<\/section>/
    );
    expect(sectionMatch).toBeTruthy();
    const introBlock = String(sectionMatch?.[0] || '');
    expect((introBlock.match(/mkt-advice-row mkt-advice--link/g) || []).length).toBe(1);
    expect((introBlock.match(/mkt-advice-row mkt-advice--konta/g) || []).length).toBe(1);
    expect((introBlock.match(/mkt-advice-row mkt-advice--tanu/g) || []).length).toBe(1);
  });

  it('機能一覧とスタイル否定しない文言・分析メモの案内が含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('このページでできること');
    expect(html).toContain('mkt-section--features');
    expect(html).toContain('分析メモ');
    expect(html).toContain('どんな配信も否定しません');
    expect(html).toContain('縛られる必要もありません');
  });

  it('maskShareLabels でトップコメンター名が伏せ字になり example.com のサムネURLが出ない', () => {
    const html = buildMarketingDashboardHtml(minimal(), { maskShareLabels: true });
    expect(html).toContain('共有向けに表示名を伏せた出力');
    expect(html).not.toContain('Alice');
    expect(html).toContain('A•••');
    expect(html).not.toContain('example.com');
  });

  it('本文・属性・累積・vpos のセクションが含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('コメント本文・属性の傾向');
    expect(html).toContain('累積コメント数と5分窓');
    expect(html).toContain('再生位置（vpos）の三分割');
    expect(html).toContain('自分投稿（selfPosted）');
    expect(html).toContain('184（既知のみ）');
  });

  it('commentsForAnalytics があると配信内容の流れを時間帯別に出す', () => {
    const base = Date.now() - 1_000_000;
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      { id: 'n1', liveId: 'lv123', commentNo: '1', text: 'わこつ 初見です', userId: 'u1', nickname: '', capturedAt: base, vpos: 0, is184: false, selfPosted: false },
      { id: 'n2', liveId: 'lv123', commentNo: '2', text: '今日も楽しい', userId: 'u2', nickname: '', capturedAt: base + 60_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'n3', liveId: 'lv123', commentNo: '3', text: 'ゲーム展開がすごい', userId: 'u3', nickname: '', capturedAt: base + 360_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'n4', liveId: 'lv123', commentNo: '4', text: 'ナイス ナイス', userId: 'u4', nickname: '', capturedAt: base + 420_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'n5', liveId: 'lv123', commentNo: '5', text: '8888 おめでとう', userId: 'u5', nickname: '', capturedAt: base + 780_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'n6', liveId: 'lv123', commentNo: '6', text: 'ありがとう 最高', userId: 'u6', nickname: '', capturedAt: base + 840_000, vpos: 0, is184: false, selfPosted: false }
    ];
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'), {
      commentsForAnalytics: comments
    });
    expect(html).toContain('id="mkt-narrative"');
    expect(html).toContain('配信内容の流れ');
    expect(html).toContain('冒頭');
    expect(html).toContain('中盤');
    expect(html).toContain('終盤');
    expect(html).toContain('初見');
    expect(html).toContain('8888 おめでとう');
  });

  it('maskShareLabels の配信内容の流れでは代表コメント本文を省略する', () => {
    const base = Date.now() - 1_000_000;
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      { id: 'm1', liveId: 'lv123', commentNo: '1', text: '秘密の代表コメント 初見', userId: 'u1', nickname: '', capturedAt: base, vpos: 0, is184: false, selfPosted: false },
      { id: 'm2', liveId: 'lv123', commentNo: '2', text: '最高', userId: 'u2', nickname: '', capturedAt: base + 60_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'm3', liveId: 'lv123', commentNo: '3', text: 'ナイス', userId: 'u3', nickname: '', capturedAt: base + 120_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'm4', liveId: 'lv123', commentNo: '4', text: '8888', userId: 'u4', nickname: '', capturedAt: base + 180_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'm5', liveId: 'lv123', commentNo: '5', text: 'ありがとう', userId: 'u5', nickname: '', capturedAt: base + 240_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'm6', liveId: 'lv123', commentNo: '6', text: 'おつ', userId: 'u6', nickname: '', capturedAt: base + 300_000, vpos: 0, is184: false, selfPosted: false }
    ];
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'), {
      commentsForAnalytics: comments,
      maskShareLabels: true
    });
    expect(html).toContain('共有向け出力では話題語と代表コメント本文を省略');
    const section = html.match(/<section id="mkt-narrative"[\s\S]*?<\/section>/)?.[0] || '';
    expect(section).not.toContain('秘密の代表コメント');
  });

  it('末尾に nl-marketing-export-v1 の JSON が埋め込まれパースできる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('id="nl-marketing-export-v1"');
    const m = html.match(/id="nl-marketing-export-v1">([\s\S]*?)<\/script>/);
    expect(m, 'script 内 JSON').toBeTruthy();
    const p = JSON.parse(/** @type {string} */ (m?.[1]));
    expect(p.schemaVersion).toBe(1);
    expect(p.report.totalComments).toBeGreaterThan(0);
    expect(p.report.quarterEngagement).toBeDefined();
  });

  it('maskShareLabels 時は埋め込み JSON のトップユーザー名が伏せ字になる', () => {
    const html = buildMarketingDashboardHtml(minimal(), { maskShareLabels: true });
    const m = html.match(/id="nl-marketing-export-v1">([\s\S]*?)<\/script>/);
    expect(m).toBeTruthy();
    const p = JSON.parse(/** @type {string} */ (m?.[1]));
    const nick = String(p.report.topUsers[0]?.nickname || '');
    expect(nick).not.toContain('Alice');
    expect(nick.length).toBeGreaterThan(0);
  });

  /*
   * 0.1.12 (F1/F3) — 「最低サムネ」と「サムネ付きユーザー一覧」の追加。
   * - sectionTopUsers: avatarUrl 無しの数値 ID にニコ既定 CDN URL を当てる、
   *   匿名 a:... には identiconResolver を呼ぶ。
   * - sectionUsersWithThumbnails: 解決できたユーザーをグリッド表示。共有伏せ字は出さない。
   */
  it('数値 ID に avatarUrl 無しなら、ニコ既定 user icon CDN URL を最低サムネとして当てる', () => {
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      {
        id: 'x1',
        liveId: 'lv123',
        commentNo: '1',
        text: 'hello',
        userId: '4046119',
        nickname: '配信者応援ちゃんねる',
        avatarUrl: '',
        capturedAt: Date.now(),
        vpos: 0,
        is184: false,
        selfPosted: false
      }
    ];
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'));
    expect(html).toContain(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/404/4046119.jpg'
    );
    // ランキング表とサムネ付き一覧の両方に出る
    expect(html).toContain('class="mkt-rank-av"');
    expect(html).toContain('mkt-section--thumb-grid');
    expect(html).toContain('class="mkt-thumb-grid__avatar"');
    expect(html).toContain(
      'onerror="this.onerror=null;this.src=\'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg\'"'
    );
  });

  it('匿名 a: には identiconResolver の戻りを最低サムネとして当てる', () => {
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      {
        id: 'a1',
        liveId: 'lv123',
        commentNo: '1',
        text: 'hi',
        userId: 'a:qkmBBq0GJKpVURQb',
        nickname: '匿名',
        avatarUrl: '',
        capturedAt: Date.now(),
        vpos: 0,
        is184: true,
        selfPosted: false
      }
    ];
    const html = buildMarketingDashboardHtml(
      aggregateMarketingReport(comments, 'lv123'),
      {
        anonymousIdenticonResolver: (uid) =>
          `data:image/svg+xml;utf8,<svg data-uid="${uid}"/>`
      }
    );
    expect(html).toContain('data-uid=&quot;a:qkmBBq0GJKpVURQb&quot;');
    expect(html).toContain('mkt-section--thumb-grid');
  });

  it('avatarUrl が http/https ならそれを優先（identiconResolver より優先）', () => {
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      {
        id: 'a1',
        liveId: 'lv123',
        commentNo: '1',
        text: 'hi',
        userId: 'a:abcdefghij',
        nickname: '匿名',
        avatarUrl: 'https://example.test/real-avatar.jpg',
        capturedAt: Date.now(),
        vpos: 0,
        is184: true,
        selfPosted: false
      }
    ];
    const html = buildMarketingDashboardHtml(
      aggregateMarketingReport(comments, 'lv123'),
      {
        anonymousIdenticonResolver: () => 'data:image/svg+xml,<svg/>'
      }
    );
    expect(html).toContain('https://example.test/real-avatar.jpg');
    expect(html).not.toContain('data:image/svg+xml,<svg/>');
  });

  it('maskShareLabels=true のときは「サムネ付きユーザー一覧」セクションを出さない', () => {
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      {
        id: 'x1',
        liveId: 'lv123',
        commentNo: '1',
        text: 'hello',
        userId: '4046119',
        nickname: 'のら',
        avatarUrl: '',
        capturedAt: Date.now(),
        vpos: 0,
        is184: false,
        selfPosted: false
      }
    ];
    const html = buildMarketingDashboardHtml(
      aggregateMarketingReport(comments, 'lv123'),
      { maskShareLabels: true }
    );
    // CSS の class 名は <style> ブロックに常時含まれるので、section 要素そのものが
    // レンダリングされていないかをチェックする（aria-label 文言は section 内にしか出ない）。
    expect(html).not.toContain('aria-label="サムネ付きユーザー一覧"');
    expect(html).not.toContain('<h2>サムネ付きユーザー一覧</h2>');
    expect(html).not.toContain('class="mkt-thumb-grid__cell"');
  });

  it('maskShareLabels=true は sectionTopUsers でも avatar 画像を出さない（識別補助しない）', () => {
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      {
        id: 'x1',
        liveId: 'lv123',
        commentNo: '1',
        text: 'hello',
        userId: '4046119',
        nickname: 'のら',
        avatarUrl: 'https://example.test/real-avatar.jpg',
        capturedAt: Date.now(),
        vpos: 0,
        is184: false,
        selfPosted: false
      }
    ];
    const html = buildMarketingDashboardHtml(
      aggregateMarketingReport(comments, 'lv123'),
      { maskShareLabels: true }
    );
    expect(html).toContain('mkt-rank-av--empty');
    expect(html).not.toContain('https://example.test/real-avatar.jpg');
    expect(html).not.toContain('https://secure-dcdn.cdn.nimg.jp/nicoaccount/');
  });
});
