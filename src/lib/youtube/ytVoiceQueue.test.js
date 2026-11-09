import { describe, it, expect } from 'vitest';
import {
  YT_VOICE_MODES,
  YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD,
  buildYtVoiceUserKey,
  resolveYtVoiceForChannel,
  shouldReadYtComment,
  enqueueYtVoiceItem,
} from './ytVoiceQueue.js';

describe('buildYtVoiceUserKey / resolveYtVoiceForChannel', () => {
  it('userKey に yt:<channelId> プレフィックスを付け、同じ人には毎回同じ声を割り当てる', () => {
    expect(buildYtVoiceUserKey('UCAbc1234567890123456789')).toBe('yt:UCAbc1234567890123456789');

    const styles = [3, 2, 8, 10, 14];
    const first = resolveYtVoiceForChannel('UCAbc1234567890123456789', {
      availableStyleIds: styles,
      assignments: {},
    });
    const second = resolveYtVoiceForChannel('UCAbc1234567890123456789', {
      availableStyleIds: styles,
      assignments: first.assignments,
    });
    expect(first.userKey).toBe('yt:UCAbc1234567890123456789');
    expect(first.styleId).toBe(second.styleId);

    // 別のチャンネルIDには別の声が割り当たる
    const other = resolveYtVoiceForChannel('UCDef9876543210987654322', {
      availableStyleIds: styles,
      assignments: second.assignments,
    });
    expect(other.userKey).toBe('yt:UCDef9876543210987654322');
    expect(other.styleId).not.toBe(first.styleId);
  });
});

describe('shouldReadYtComment', () => {
  it('「全部読む（all）」モードでは通常コメントも含めて読み上げ対象にする', () => {
    expect(
      shouldReadYtComment(
        { kind: 'text', badges: [], text: 'こんにちは！' },
        { mode: YT_VOICE_MODES.ALL },
      ),
    ).toBe(true);
  });

  it('「選んで読む（select）」モードではスパチャ・ステッカー・メンバー・配信者名入りだけを読む', () => {
    const opts = { mode: YT_VOICE_MODES.SELECT, broadcasterName: 'りんく' };

    // 一般コメント（配信者名なし）は読まない
    expect(
      shouldReadYtComment({ kind: 'text', badges: [], text: '初見です' }, opts),
    ).toBe(false);

    // スパチャは読む
    expect(
      shouldReadYtComment(
        { kind: 'superchat', badges: [], amount: 500, currency: 'JPY', text: 'ナイス！' },
        opts,
      ),
    ).toBe(true);

    // ステッカーは読む
    expect(
      shouldReadYtComment(
        { kind: 'sticker', badges: [], amount: 200, currency: 'JPY', text: 'キラッ' },
        opts,
      ),
    ).toBe(true);

    // メンバー加入 / ギフトは読む
    expect(
      shouldReadYtComment(
        { kind: 'membership', badges: ['member'], text: 'メンバー加入' },
        opts,
      ),
    ).toBe(true);
    expect(
      shouldReadYtComment(
        { kind: 'membership_gift', badges: ['member'], text: 'ギフトを贈りました' },
        opts,
      ),
    ).toBe(true);

    // メンバーバッジ付きコメントは読む
    expect(
      shouldReadYtComment(
        { kind: 'text', badges: ['member'], text: 'メンシプより応援' },
        opts,
      ),
    ).toBe(true);

    // 配信者名を含む一般コメントは読む
    expect(
      shouldReadYtComment(
        { kind: 'text', badges: [], text: 'りんくちゃん頑張れ！' },
        opts,
      ),
    ).toBe(true);
  });
});

describe('enqueueYtVoiceItem（自動モード切替）', () => {
  it('キュー長がしきい値以上のとき自動で「選んで読む」に切り替わり、一般コメントをスキップする', () => {
    expect(YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD).toBeGreaterThan(0);

    const backlog = Array.from({ length: YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD }, (_, i) => ({
      id: `q-${i}`,
      text: `コメント${i}`,
      styleId: 3,
    }));

    // 一般コメントを投入 → 自動で select モードになりキューに追加されない
    const resNormal = enqueueYtVoiceItem(
      backlog,
      {
        id: 'new-normal',
        channelId: 'UCViewer12345678901234567',
        name: '@Viewer',
        kind: 'text',
        badges: [],
        text: '普通のコメント',
      },
      {
        mode: YT_VOICE_MODES.ALL,
        broadcasterName: 'りんく',
        availableStyleIds: [3, 2, 8],
        assignments: {},
      },
    );

    expect(resNormal.effectiveMode).toBe(YT_VOICE_MODES.SELECT);
    expect(resNormal.autoSwitched).toBe(true);
    expect(resNormal.enqueued).toBe(false);
    expect(resNormal.queue).toHaveLength(YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD);

    // スパチャを投入 → 自動で select モードになってもスパチャはキューに入る
    const resSc = enqueueYtVoiceItem(
      backlog,
      {
        id: 'new-sc',
        channelId: 'UCSupporter12345678901234',
        name: '@Supporter',
        kind: 'superchat',
        badges: [],
        amount: 1000,
        currency: 'JPY',
        text: 'スパチャ応援！',
      },
      {
        mode: YT_VOICE_MODES.ALL,
        broadcasterName: 'りんく',
        availableStyleIds: [3, 2, 8],
        assignments: {},
      },
    );

    expect(resSc.effectiveMode).toBe(YT_VOICE_MODES.SELECT);
    expect(resSc.autoSwitched).toBe(true);
    expect(resSc.enqueued).toBe(true);
    expect(resSc.queue).toHaveLength(YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD + 1);
  });
});
