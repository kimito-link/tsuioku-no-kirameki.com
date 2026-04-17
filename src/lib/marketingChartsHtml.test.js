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

describe('buildMarketingDashboardHtml', () => {
  it('完全な HTML ドキュメントを返す', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('lv123');
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
    const start = html.indexOf('mkt-advice-stack--intro');
    expect(start).toBeGreaterThan(-1);
    const end = html.indexOf('<h2>KPI サマリ</h2>', start);
    expect(end).toBeGreaterThan(start);
    const introBlock = html.slice(start, end);
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
});
