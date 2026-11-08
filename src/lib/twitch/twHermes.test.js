import { describe, it, expect } from 'vitest';
import {
  twHermesUrl,
  twRewardTopic,
  twHypeTopic,
  twPredictionTopic,
  twHermesSubscribeMsg,
  parseTwHermesFrame,
  parseTwRedemption,
  parseTwHypeTrain,
  parseTwPrediction,
} from './twHermes.js';

// 形は 2026-11-08 の PC 実測(本物の Hermes・ログインなし)と、twitch.tv の reward-redeemed の形から写した
describe('Twitch の通知の口(Hermes)', () => {
  it('つなぎ先と購読の1通', () => {
    expect(twHermesUrl('abc')).toBe('wss://hermes.twitch.tv/v1?clientId=abc');
    expect(twRewardTopic('99')).toBe('community-points-channel-v1.99');
    expect(twRewardTopic('x')).toBe('');
    expect(twHermesSubscribeMsg('polls.99', 's1', 'm1', '2026-11-08T00:00:00Z')).toEqual({
      type: 'subscribe', id: 'm1', subscribe: { id: 's1', type: 'pubsub', pubsub: { topic: 'polls.99' } }, timestamp: '2026-11-08T00:00:00Z',
    });
  });

  it('届く1通を読み分ける', () => {
    expect(parseTwHermesFrame(JSON.stringify({ type: 'welcome', welcome: { keepaliveSec: 10, recoveryUrl: 'x', sessionId: 's' } }))).toEqual({ type: 'welcome', keepaliveSec: 10 });
    expect(parseTwHermesFrame(JSON.stringify({ type: 'keepalive' }))).toEqual({ type: 'keepalive' });
    expect(parseTwHermesFrame(JSON.stringify({ type: 'subscribeResponse', subscribeResponse: { result: 'ok', subscription: { id: 's1' } } }))).toEqual({ type: 'subscribed', subId: 's1', ok: true, error: '' });
    expect(parseTwHermesFrame(JSON.stringify({ type: 'subscribeResponse', subscribeResponse: { result: 'error', errorCode: 'SUB007' } }))).toMatchObject({ ok: false, error: 'SUB007' });
    const n = parseTwHermesFrame(JSON.stringify({ type: 'notification', notification: { subscription: { id: 's1' }, type: 'pubsub', pubsub: JSON.stringify({ type: 'reward-redeemed', data: {} }) } }));
    expect(n).toEqual({ type: 'notification', subId: 's1', data: { type: 'reward-redeemed', data: {} } });
    expect(parseTwHermesFrame(JSON.stringify({ type: 'reconnect', reconnect: { url: 'wss://evil.example/x' } }))).toEqual({ type: 'reconnect', url: '' });
    expect(parseTwHermesFrame('not json')).toBeNull();
    expect(parseTwHermesFrame(JSON.stringify({ hello: 1 }))).toBeNull();
    expect(parseTwHermesFrame(/** @type {any} */ (5))).toBeNull();
  });

  it('リワードの交換を記録の1行に(名前つき・本文があれば添える)', () => {
    const data = {
      type: 'reward-redeemed',
      data: {
        timestamp: '2026-11-08T11:00:00Z',
        redemption: {
          id: 'r-1', user: { id: '1001', login: 'Fan_A', display_name: 'ファンA' }, channel_id: '99',
          redeemed_at: '2026-11-08T11:00:01Z', reward: { id: 'rw', title: '水を飲んで', cost: 500 }, status: 'UNFULFILLED',
        },
      },
    };
    expect(parseTwRedemption(data, 'Test_Chan')).toMatchObject({
      id: 'tw-redeem-r-1', channelId: 'tw:1001', name: 'ファンA', login: 'fan_a', channel: 'test_chan', kind: 'tw_reward',
      text: '「水を飲んで」を交換しました', rewardCost: 500, postedAtMs: Date.parse('2026-11-08T11:00:01Z'),
    });
    const withInput = { ...data, data: { ...data.data, redemption: { ...data.data.redemption, user_input: '  がんばって ' } } };
    expect(parseTwRedemption(withInput, 'test_chan')?.text).toBe('「水を飲んで」を交換しました: がんばって');
    expect(parseTwRedemption({ type: 'custom-reward-updated', data: {} }, 'x')).toBeNull();
    expect(parseTwRedemption({ type: 'reward-redeemed', data: { redemption: { id: 'r', user: { login: 'a' }, reward: {} } } }, 'x')).toBeNull();
    expect(parseTwRedemption(null, 'x')).toBeNull();
  });
});

describe('ハイプトレイン・予想(2026-11-08 PC 実測の形)', () => {
  const ctx = { channel: 'testchan', channelId: '99', broadcasterName: 'テストちゃん', nowMs: 1_000 };
  it('話題名', () => {
    expect(twHypeTopic('99')).toBe('hype-train-events-v2.99');
    expect(twPredictionTopic('99')).toBe('predictions-channel-v1.99');
    expect(twHypeTopic('abc')).toBe('');
  });
  it('レベルアップは配信者の名前で1行(同じレベルは同じ id)', () => {
    const r = parseTwHypeTrain({ type: 'hype-train-level-up', data: { progress: { level: { value: 3 } }, hype_train: { id: 'T1' } } }, ctx);
    expect(r?.level).toBe(3);
    expect(r?.row).toMatchObject({ id: 'tw-hype-T1-lv3', channelId: 'tw:99', name: 'テストちゃん', text: 'ハイプトレインがレベル3になりました', kind: 'tw_hype' });
  });
  it('終わりは最後のレベルを添える・ended_at は秒でもミリ秒でも', () => {
    const r = parseTwHypeTrain({ type: 'hype-train-end', data: { id: 'T1', ended_at: 1762600000 } }, { ...ctx, lastLevel: 4 });
    expect(r?.row).toMatchObject({ id: 'tw-hype-T1-end', text: 'ハイプトレインが終わりました(レベル4)', postedAtMs: 1762600000000 });
  });
  it('車掌はその人の名前で', () => {
    const r = parseTwHypeTrain(
      { type: 'hype-train-conductor-update', data: { id: 'C1', source: 'SUBS', user: { id: '5', login: 'fan_a', display_name: 'ファンA' } } },
      ctx,
    );
    expect(r?.row).toMatchObject({ channelId: 'tw:5', name: 'ファンA', login: 'fan_a', text: 'ハイプトレインの車掌になりました(サブスク)' });
  });
  it('進み具合・形の違うものは記録しない', () => {
    expect(parseTwHypeTrain({ type: 'hype-train-progression', data: { quantity: 1 } }, ctx)).toBeNull();
    expect(parseTwHypeTrain({ type: 'hype-train-level-up', data: { progress: {} } }, ctx)).toBeNull();
    expect(parseTwHypeTrain(null, ctx)).toBeNull();
  });
  it('予想は決着したときだけ・勝った選択肢と人数', () => {
    const ev = (status) => ({
      type: 'event-updated',
      data: {
        event: {
          id: 'P1',
          status,
          title: '勝てる?',
          winning_outcome_id: 'o1',
          ended_at: '2026-11-08T12:00:00Z',
          outcomes: [
            { id: 'o1', title: 'はい', total_users: 12, total_points: 3400 },
            { id: 'o2', title: 'いいえ', total_users: 3, total_points: 100 },
          ],
        },
      },
    });
    expect(parseTwPrediction(ev('ACTIVE'), ctx)).toBeNull();
    expect(parseTwPrediction(ev('RESOLVED'), ctx)).toMatchObject({
      id: 'tw-pred-P1',
      name: 'テストちゃん',
      text: '予想「勝てる?」の結果: 「はい」(12人・3,400ポイント)',
      kind: 'tw_prediction',
      postedAtMs: Date.parse('2026-11-08T12:00:00Z'),
    });
  });
});
