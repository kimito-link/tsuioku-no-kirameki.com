// supportEventParity.test.js — 会場の投げの演出(ギフトの1件)と、横の欄・会場の帯のチップ・振り返りが同じ応援を数えるか(v0.1.2227)。
//   2026-11-25 りんくさん: YouTube(メキシコの配信)で投げと効果音は出るのにスパチャの数字が動かない。
//   原因: ① ジュエルのギフト(yt_gift)はどのチップにも入らない ② スパチャのチップはいちばん多い通貨の合計だけで、ほかの通貨では動かない
//         ③ ツイキャスのお茶・SHOWROOM の一覧に無いギフトも演出だけ出て件数が動かない/ミクチャ・TikTok の値段の分からないギフトは件数だけ動いて演出が出ない
//   決まり: 演出が出る行(isSupportEventRow)は、推定と数え始め以外のチップを必ず1つ動かす。演出が出ない行はチップを動かさない。
import { describe, it, expect } from 'vitest';
import { tallySupportItems, panelExtraChips } from './platformMetrics.js';
import { isSupportEventRow } from '../estimatedViewerSpend.js';
import { isMarketingSupportRow } from '../marketingAggregate.js';
import { aggregateMarketingReport } from '../marketingAggregate.js';
import { buildMarketingDashboardHtml } from '../marketingChartsHtml.js';
import { buildYtGiftBags } from '../../../extension-youtube/src/ytGiftToNico.js';

const PLATFORM_OF_PREFIX = { 'tw:': 'twitch', 'kk:': 'kick', 'sr:': 'showroom', 'mx:': 'mixch', 'tt:': 'tiktok', 'ww:': 'whowatch', 'tc:': 'twitcasting' };
/** ytNicoShim の行の形(ytKind / ytPlatform / ytGiftName / ytAmount / ytCurrency)に直す */
const toEntry = (/** @type {any} */ r) => {
  const pre = Object.keys(PLATFORM_OF_PREFIX).find((p) => String(r.channelId).startsWith(p));
  return {
    id: r.id, userId: String(r.channelId), nickname: r.name, text: r.text || '', capturedAt: r.recordedAt,
    ytKind: r.kind || 'text', ...(pre ? { ytPlatform: PLATFORM_OF_PREFIX[/** @type {keyof typeof PLATFORM_OF_PREFIX} */ (pre)] } : {}),
    ...(r.giftName ? { ytGiftName: r.giftName } : {}), ...(r.giftCount ? { ytGiftCount: r.giftCount } : {}),
    ytAmount: Number(r.amount || 0), ytCurrency: String(r.currency || ''),
  };
};
const visible = (/** @type {string} */ id, /** @type {any[]} */ rows) =>
  panelExtraChips(id, { support: tallySupportItems(rows) })
    .filter((c) => !/^estimat/.test(c.key) && c.key !== 'countSince')
    .map((c) => `${c.key}=${c.text}${c.unit}`).join('|');

/** @type {Record<string, any[]>} 各サービスの記録の形(それぞれの parse のテストと同じ形) */
const STREAMS = {
  youtube: [
    { kind: 'superchat', amount: 100, currency: 'MXN', channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa' },
    { kind: 'superchat', amount: 5, currency: 'USD', channelId: 'UCbbbbbbbbbbbbbbbbbbbbbb' },
    { kind: 'sticker', amount: 2, currency: 'USD', channelId: 'UCbbbbbbbbbbbbbbbbbbbbbb' },
    { kind: 'yt_gift', giftName: 'ハイ', channelId: 'UCcccccccccccccccccccccc' },
    { kind: 'membership_gift', giftCount: 5, channelId: 'UCdddddddddddddddddddddd' },
    { kind: 'membership', channelId: 'UCeeeeeeeeeeeeeeeeeeeeee' },
    { kind: 'text', text: 'VIP', channelId: 'UCffffffffffffffffffffff' },
  ],
  twitch: [
    { kind: 'superchat', amount: 100, currency: 'BITS', channelId: 'tw:1' },
    { kind: 'membership', channelId: 'tw:2', subTier: 'Tier 1' },
    { kind: 'membership_gift', giftCount: 3, channelId: 'tw:3' },
    { kind: 'tw_raid', amount: 42, channelId: 'tw:4' },
  ],
  kick: [
    { kind: 'superchat', amount: 500, currency: 'KICKS', channelId: 'kk:9' },
    { kind: 'membership', channelId: 'kk:1' },
    { kind: 'membership_gift', giftCount: 3, channelId: 'kk:@rich' },
    { kind: 'kk_host', amount: 42, channelId: 'kk:5' },
  ],
  showroom: [
    { kind: 'superchat', amount: 100, currency: 'SRPT', giftName: 'ハート', channelId: 'sr:1' },
    { kind: 'text', amount: 0, currency: '', giftName: 'ギフト9999', channelId: 'sr:2' },
  ],
  mixch: [
    { kind: 'superchat', amount: 300, currency: 'MXCOIN', giftName: 'ギフト', giftCount: 3, channelId: 'mx:11' },
    { kind: 'text', amount: 0, currency: '', giftName: 'ギフト', channelId: 'mx:13' },
    { kind: 'mx_fan', channelId: 'mx:14' },
  ],
  tiktok: [
    { kind: 'superchat', amount: 3, currency: 'TTCOIN', giftName: 'バラ', giftCount: 3, channelId: 'tt:7000000000000000002' },
    { kind: 'text', amount: 0, currency: '', giftName: 'なにか', channelId: 'tt:7000000000000000003' },
    { kind: 'follow', channelId: 'tt:7000000000000000004' },
  ],
  whowatch: [
    { kind: 'superchat', amount: 3, currency: 'WWITEM', giftName: 'ハート', giftCount: 3, channelId: 'ww:1' },
    { kind: 'superchat', amount: 1, currency: 'WWITEM', giftName: '花火', channelId: 'ww:2' },
  ],
  twitcasting: [
    { kind: 'superchat', amount: 0, currency: 'TCSCORE', giftName: 'お茶爆50', badges: ['paid'], isPaidGift: true, channelId: 'tc:a' },
    { kind: 'superchat', amount: 90, currency: 'TCSCORE', giftName: 'お茶', channelId: 'tc:b' },
    { kind: 'superchat', amount: 0, currency: 'TCSCORE', giftName: 'ふしぎな何か', channelId: 'tc:c' },
  ],
};

describe('演出と数字が同じ応援を数える(全サービス)', () => {
  for (const [id, raw] of Object.entries(STREAMS)) {
    it(`${id}: 演出が出た応援は必ずチップを動かし、出ない行は動かさない`, () => {
      const rows = raw.map((r, i) => ({ text: '', name: `n${i}`, ...r, id: `${id}-${i}`, pk: `${id}-${i}`, recordedAt: 1000 + i }));
      for (let i = 0; i < rows.length; i += 1) {
        const before = rows.slice(0, i);
        const after = rows.slice(0, i + 1);
        const fired = buildYtGiftBags(after.map(toEntry), 'lv1').giftEvents.length > buildYtGiftBags(before.map(toEntry), 'lv1').giftEvents.length;
        const label = `${id} #${i} ${rows[i].kind} ${rows[i].currency || ''} ${rows[i].giftName || ''}`;
        expect(fired, label).toBe(isSupportEventRow(rows[i]));
        if (fired) {
          expect(visible(id, after), `${label}: 演出は出たのに数字が動かない`).not.toBe(visible(id, before));
          // 振り返り(マーケ)も同じ行を応援として数える
          expect(isMarketingSupportRow(toEntry(rows[i])), `${label}: 振り返りに入らない`).toBe(true);
        } else if (id !== 'twitch' && id !== 'kick' && rows[i].kind !== 'mx_fan' && rows[i].kind !== 'follow') {
          expect(visible(id, after), `${label}: 演出が出ないのに数字だけ動く`).toBe(visible(id, before));
        }
      }
    });
  }

  it('YouTube: 主の通貨以外のスパチャでもスパチャのチップが動く(件数を添える)', () => {
    const mxn = { kind: 'superchat', amount: 16388, currency: 'MXN', id: 'a', recordedAt: 1 };
    const usd = { kind: 'superchat', amount: 5, currency: 'USD', id: 'b', recordedAt: 2 };
    const chip = (/** @type {any[]} */ rows) => panelExtraChips('youtube', { support: tallySupportItems(rows) }).find((c) => c.key === 'superchat');
    expect(chip([mxn])?.text).toBe('MXN 16,388 · 1件');
    expect(chip([mxn, usd])?.text).toBe('MXN 16,388 · 2件');
    expect(chip([mxn, usd])?.title).toContain('USD 5');
  });

  it('YouTube: ジュエルのギフトは件数だけ(値段を作らない・推定は動かない)', () => {
    const g = { kind: 'yt_gift', giftName: 'ハイ', id: 'g', recordedAt: 1 };
    const chips = panelExtraChips('youtube', { support: tallySupportItems([g]) });
    expect(chips.find((c) => c.key === 'ytGifts')?.text).toBe('1件');
    expect(tallySupportItems([g]).amounts).toEqual({});
  });

  it('YouTube: 振り返りのスパチャ件数・ギフト件数が横の欄と同じ', () => {
    const rows = STREAMS.youtube.map((r, i) => ({ text: '', name: `n${i}`, ...r, id: `y-${i}`, recordedAt: 1000 + i }));
    const chips = panelExtraChips('youtube', { support: tallySupportItems(rows) });
    const scCount = String(chips.find((c) => c.key === 'superchat')?.text).split(' · ')[1];
    const giftCount = chips.find((c) => c.key === 'ytGifts')?.text;
    const comments = rows.map((r, i) => ({ ...toEntry(r), liveId: 'lv900000000001', commentNo: String(i + 1), avatarUrl: '', ytChannelId: r.channelId, ytPlatform: 'youtube' }));
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv900000000001'), { platform: 'youtube', commentsForAnalytics: comments });
    const card = (/** @type {string} */ label) => {
      const m = html.match(new RegExp(`mkt-kpi__val">([^<]+)</span><span class="mkt-kpi__label">${label}<`));
      return m ? m[1] : null;
    };
    expect(scCount).toBe('3件');
    expect(card('スーパーチャット・ステッカーの件数（記録）')).toBe(scCount);
    expect(card('ギフトの件数（記録）')).toBe(giftCount);
  });
});
