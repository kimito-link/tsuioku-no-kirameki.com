import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMarketingDashboardHtml } from './marketingChartsHtml.js';
import { aggregateMarketingReport } from './marketingAggregate.js';

/**
 * ★v0.1.1709: マーケレポートに章「応援者とギフト」(誰がどんなコメントをして・どんなギフトを出したか)を足した配線。
 * 既存の約60章は消さず・並べ替えず、追加するだけ(redesign-SPEC の方針)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mch = readFileSync(path.join(repoRoot, 'src/lib/marketingChartsHtml.js'), 'utf8').replace(/\r\n/g, '\n');

/** 本物の集計(aggregateMarketingReport)でレポート入力を作る。 */
function reportFor(comments) {
  return aggregateMarketingReport(
    comments.map((c) => ({ ...c, liveId: 'lv1' })),
    'lv1',
    {}
  );
}

describe('★マーケレポートの章「応援者とギフト」の配線', () => {
  it('章の builder を import し、目次にも載せる', () => {
    expect(mch).toMatch(/import \{[^}]*buildSupportersGiftsRows[^}]*\} from '\.\/supportersGiftsSection\.js';/);
    expect(mch).toContain("{ id: 'mkt-supporters-gifts', label: '応援者とギフト' }");
  });

  it('章の CSS をマーケの CSS へ連結している', () => {
    expect(mch).toContain('SUPPORTERS_GIFTS_CSS');
  });

  it('ギフトは【全件】の台帳から取る(表示用の200行の台帳を再利用しない)', () => {
    expect(mch).toMatch(/buildMarketingGiftThrowLedger\(\s*\{[\s\S]{0,260}\},\s*\{ maxRows: [^}]*\}\s*\)\.rows/);
  });

  it('実際に生成した HTML に章が出る(コメント・ギフトあり)。本文は escape・共有モードでは本文を出さない', () => {
    const comments = [
      { userId: '111', nickname: '太郎', text: 'こんにちは<script>', capturedAt: 1_700_000_000_000 },
      { userId: '111', nickname: '太郎', text: 'ありがとう', capturedAt: 1_700_000_005_000 },
      { userId: 'a:zz', nickname: '', text: 'ふつうのコメント', capturedAt: 1_700_000_006_000 }
    ];
    const giftSubAppHistory = {
      source: 'koken-api',
      history: [{ senderName: '太郎', userId: '111', itemName: '星', points: 500, time: '0:10', sortKey: 10, kokenHistoryId: 'k1' }]
    };
    const open = buildMarketingDashboardHtml(reportFor(comments), { commentsForAnalytics: comments, giftSubAppHistory, maskShareLabels: false });
    expect(open).toContain('id="mkt-supporters-gifts"');
    expect(open).toContain('こんにちは&lt;script&gt;');
    expect(open).not.toContain('こんにちは<script>');
    expect(open).toContain('星');
    const masked = buildMarketingDashboardHtml(reportFor(comments), { commentsForAnalytics: comments, giftSubAppHistory, maskShareLabels: true });
    expect(masked).toContain('id="mkt-supporters-gifts"');
    expect(masked).not.toContain('ふつうのコメント');
    expect(masked).not.toContain('こんにちは&lt;script');
  });
});
