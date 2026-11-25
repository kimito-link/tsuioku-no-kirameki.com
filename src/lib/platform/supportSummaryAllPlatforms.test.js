// v0.1.2207: 各サービスのパーサが出した行を、そのまま tallySupportItems → panelExtraChips に通す。
//   「推定 → そのサービスの単位の合計 → 件数 → 反応」の順と、0 件のときの「推定 —」を固定する。
import { describe, expect, it } from 'vitest';
import { panelExtraChips, tallySupportItems } from './platformMetrics.js';
import { parseTcEvent } from '../twitcasting/tcParse.js';
import { parseMxItems, parseMxMessage } from '../mixch/mxParse.js';
import { ttGiftRow } from '../tiktok/ttParse.js';
import { parseTwChatLine } from '../twitch/twIrcParse.js';
import { parseKickEvent, parsePusherFrame } from '../kick/kickChatParse.js';
import { parseSrGift, parseSrGiftList } from '../showroom/srParse.js';
import { parseWwComment } from '../whowatch/wwParse.js';

const EST = '推定（視聴者の購入額）';
/** @param {string} id @param {unknown[]} rows */
const chipsOf = (id, rows) => panelExtraChips(id, { support: tallySupportItems(rows) });
/** @param {ReturnType<typeof chipsOf>} chips @param {string} key */
const textOf = (chips, key) => chips.find((c) => c.key === key)?.text;

describe('パーサの行 → 横欄・会場のチップ(全サービス)', () => {
  it('ツイキャス: 推定(チケット基準) → お茶爆の消費pt → アイテム。お茶は推定に入れないが、演出が出るので件数には入る(v0.1.2225)', () => {
    const gift = {
      type: 'gift',
      id: 'g1',
      message: 'がんばれ',
      plainMessage: 'がんばれ',
      isPaidGift: true,
      item: { name: 'お茶爆100', image: 'https://twitcasting.tv/img/gift/x.png', showsSenderInfo: true },
      sender: { id: 'c:v2', name: '視聴者2', screenName: 'c:v2', profileImage: '' },
      createdAt: 1731300001000,
    };
    const tea = { ...gift, id: 'g2', isPaidGift: false, item: { name: 'お茶ｘ10', image: '', showsSenderInfo: true } };
    const rows = [parseTcEvent(gift, { user: 'host' }), parseTcEvent(tea, { user: 'host' })];
    const chips = chipsOf('twitcasting', rows);
    expect(chips.map((c) => c.label)).toEqual([EST, 'お茶爆の消費pt（推定）', '推定（配信者の受取）', 'アイテム（記録）']);
    expect(textOf(chips, 'estimatedViewerSpend')).toBe('約¥1,000');
    expect(chips[0].title).toContain('チケット基準');
    expect(textOf(chips, 'estimatedViewerConsumption')).toBe('約1,000pt');
    expect(textOf(chips, 'paidItems')).toBe('2件');
  });

  it('ミクチャ: 推定 → コイン(記録) → ギフト → ファン登録', () => {
    const items = parseMxItems({ items: [{ id: 501, price: 100, resource_id: 376 }] });
    const rows = [
      parseMxMessage({ kind: 42, message_id: 'g-1', user_id: 13, name: 'X', item_id: 501, count: 3 }, { userId: '5', items }),
      parseMxMessage({ kind: 45, message_id: 'g-3', user_id: 13, item_id: 9 }, { userId: '5', items }),
      parseMxMessage({ kind: 62, message_id: 'f-1', user_id: 11, name: 'ファンA', created: 1700000001 }, { userId: '5' }),
    ];
    const chips = chipsOf('mixch', rows);
    expect(chips.map((c) => c.key)).toEqual(['estimatedViewerSpend', 'estimatedStreamerTakeHome', 'nativeTotal', 'paidGifts', 'fanSignups']);
    expect(textOf(chips, 'estimatedViewerSpend')).toBe('約¥360（ほか 1件は金額不明）');
    expect(textOf(chips, 'nativeTotal')).toBe('300コイン');
    expect(textOf(chips, 'paidGifts')).toBe('2件');
    expect(textOf(chips, 'fanSignups')).toBe('1人');
    expect(chips.every((c) => c.label !== '推定（視聴者の消費）')).toBe(true);
  });

  it('TikTok: 推定 → コイン(記録) → ギフト', () => {
    const user = { userId: '7000000000000000002', uniqueId: 'fan', nickname: 'ファン', iconUrl: '' };
    const rows = [
      ttGiftRow(/** @type {any} */ ({ user, giftId: '5655', groupId: '0', count: 30, diamond: 1, name: 'バラ', imageUrl: '', postedAtMs: 1 }), 'host'),
    ];
    const chips = chipsOf('tiktok', rows);
    expect(chips.map((c) => c.key)).toEqual(['estimatedViewerSpend', 'estimatedStreamerTakeHome', 'nativeTotal', 'paidGifts']);
    expect(textOf(chips, 'estimatedViewerSpend')).toBe('約¥56');
    expect(textOf(chips, 'nativeTotal')).toBe('30コイン');
    expect(chips.find((c) => c.key === 'paidGifts')?.title).toContain('30 個');
  });

  it('Twitch: 推定(サブのみ) → Bits → サブスク → ギフトサブ → レイド', () => {
    const rows = [
      parseTwChatLine('@display-name=NewSub;id=aaa;login=newsub;msg-id=resub;msg-param-cumulative-months=6;msg-param-sub-plan=1000;room-id=1;system-msg=NewSub\\ssubscribed.;tmi-sent-ts=1;user-id=99 :tmi.twitch.tv USERNOTICE #c :やった'),
      parseTwChatLine('@bits=100;display-name=B;id=bb;login=b;tmi-sent-ts=1;user-id=8 :b!b@b.tmi.twitch.tv PRIVMSG #c :cheer100'),
    ];
    const chips = chipsOf('twitch', rows);
    expect(chips.map((c) => c.key).slice(0, 6)).toEqual(['estimatedViewerSpend', 'estimatedStreamerTakeHome', 'bits', 'subs', 'gifts', 'raids']);
    expect(textOf(chips, 'estimatedViewerSpend')).toMatch(/^約¥/);
    expect(textOf(chips, 'subs')).toBe('1');
  });

  it('Kick: 推定 → Kicks → サブスク → ギフトサブ → ホスト(回数と人数)', () => {
    const frame = (/** @type {string} */ event, /** @type {object} */ data) => parsePusherFrame(JSON.stringify({ event, channel: 'chatrooms.77.v2', data: JSON.stringify(data) }));
    const rows = [
      parseKickEvent(frame('App\\Events\\StreamHostEvent', { chatroom_id: 77, host_username: 'Other', number_viewers: 42, optional_message: '' }), { chatroomId: '77', nowMs: 1 }),
      parseKickEvent(frame('App\\Events\\SubscriptionEvent', { chatroom_id: 77, username: 'Fan_A', months: 3 }), { chatroomId: '77', nowMs: 1 }),
    ];
    const chips = chipsOf('kick', rows);
    expect(chips.map((c) => c.key)).toEqual(['estimatedViewerSpend', 'estimatedStreamerTakeHome', 'kicks', 'subs', 'gifts', 'hosts']);
    expect(textOf(chips, 'hosts')).toBe('1回');
    expect(chips.find((c) => c.key === 'hosts')?.title).toContain('42');
  });

  it('SHOWROOM: ギフト(記録) pt → ギフト件数。円にしないので推定は出さない', () => {
    const gifts = parseSrGiftList({ normal: [{ gift_id: 1601, gift_name: 'ハート', point: 10, free: false, image: '' }] });
    const rows = [
      parseSrGift({ t: 2, u: 8, ac: 'B', g: 1601, n: 3, av: 1, created_at: 1700000002 }, { roomId: '99', gifts }),
    ];
    const chips = chipsOf('showroom', rows);
    expect(chips.map((c) => c.key)).toEqual(['nativeTotal', 'paidGifts']);
    expect(textOf(chips, 'nativeTotal')).toBe('30pt');
    // 単位は数のすぐ後ろ(横欄で2行に割れない)
    expect(chips[0].unit).toBe('');
    expect(chips[0].title).toContain('円にはしていません');
    expect(chips.some((c) => c.key === 'estimatedStreamerTakeHome')).toBe(false); // SHOWROOM は円の推定を出さない(受取も)(v0.1.2225)
    expect(chips.some((c) => c.key === 'estimatedViewerSpend')).toBe(false);
  });

  it('ふわっち: アイテム(記録)の個数 → 件数。推定は出さない', () => {
    const c = { id: 3, comment_type: 'BY_PLAYITEM', user: { id: 9, name: 'ファンC' }, message: 'ハート', item_count: 3, play_item_pattern: { id: 5, name: 'ハート', image_url: '', quantity: 1 } };
    const chips = chipsOf('whowatch', [parseWwComment(c, { liveId: '1' })]);
    expect(chips.map((c2) => c2.key)).toEqual(['nativeTotal', 'paidGifts']);
    expect(textOf(chips, 'nativeTotal')).toBe('3個');
    expect(textOf(chips, 'paidGifts')).toBe('1件');
  });

  it('0 件のときは「推定 —」(¥0 にしない)。式の無い SHOWROOM・ふわっちは出さない', () => {
    for (const id of ['youtube', 'twitch', 'kick', 'twitcasting', 'mixch', 'tiktok']) {
      const est = chipsOf(id, []).find((c) => c.key === 'estimatedViewerSpend');
      expect(est, id).toMatchObject({ label: EST, text: '—', placeholder: true });
      expect(est?.title).toContain('値段が公式で確認できる応援が来たら表示します');
    }
    for (const id of ['showroom', 'whowatch']) {
      expect(chipsOf(id, []).some((c) => c.key === 'estimatedViewerSpend')).toBe(false);
    }
    expect(panelExtraChips('niconico', { support: tallySupportItems([]) })).toEqual([]);
  });
});
