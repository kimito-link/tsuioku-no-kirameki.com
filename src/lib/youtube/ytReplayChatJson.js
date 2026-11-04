// ytReplayChatJson.js — アーカイブのチャットのリプレイ(get_live_chat_replay の返事)を、
// チャット欄の画面から読んだ記録(parseYtChatElement)と同じ形にする純関数。
// 配信が終わったあと、開く前の分(記録の抜け)を埋めるのに使う。画面に出さずに読むので、
// 時刻は timestampUsec(書かれた本当の時刻)をそのまま postedAtMs に入れる。

import { parsePurchaseAmount } from './ytChatParse.js';

/** @param {any} t */
function plainText(t) {
  if (!t) return '';
  if (typeof t.simpleText === 'string') return t.simpleText;
  const runs = Array.isArray(t.runs) ? t.runs : [];
  return runs
    .map((r) => {
      if (typeof r?.text === 'string') return r.text;
      const em = r?.emoji;
      if (em) {
        const sc = Array.isArray(em.shortcuts) && em.shortcuts[0] ? String(em.shortcuts[0]) : '';
        if (sc) return sc.replace(/^:|:$/g, '');
        const label = em.image?.accessibility?.accessibilityData?.label;
        return label ? String(label) : '';
      }
      return '';
    })
    .join('');
}

/** @param {any} thumbs */
function lastThumbUrl(thumbs) {
  const list = Array.isArray(thumbs?.thumbnails) ? thumbs.thumbnails : [];
  const url = String(list.length ? list[list.length - 1]?.url || '' : '');
  const full = url.startsWith('//') ? `https:${url}` : url;
  return /^https:\/\//.test(full) ? full : '';
}

/** @param {any} r */
function badgesOf(r) {
  const list = Array.isArray(r?.authorBadges) ? r.authorBadges : [];
  return list
    .map((b) => String(b?.liveChatAuthorBadgeRenderer?.tooltip || b?.liveChatAuthorBadgeRenderer?.accessibility?.accessibilityData?.label || ''))
    .filter(Boolean);
}

/**
 * 1件の item(addChatItemAction.item)を記録の形にする。扱わない種類は null。
 * @param {any} item
 */
export function ytReplayItemToRecord(item) {
  if (!item || typeof item !== 'object') return null;
  /** @type {[string, string][]} */
  const kinds = [
    ['liveChatTextMessageRenderer', 'text'],
    ['liveChatPaidMessageRenderer', 'superchat'],
    ['liveChatPaidStickerRenderer', 'sticker'],
    ['liveChatMembershipItemRenderer', 'membership'],
    ['liveChatSponsorshipsGiftPurchaseAnnouncementRenderer', 'membership_gift'],
  ];
  for (const [key, kind] of kinds) {
    let r = item[key];
    if (!r) continue;
    // メンバーシップのギフトは中身が header の下にある
    const head = kind === 'membership_gift' ? r?.header?.liveChatSponsorshipsHeaderRenderer || {} : r;
    const id = String(r.id || '').trim();
    if (!id) return null;
    const usec = Number(r.timestampUsec || head.timestampUsec || 0);
    const postedAtMs = Number.isFinite(usec) && usec > 0 ? Math.floor(usec / 1000) : 0;
    const name = plainText(head.authorName).trim();
    const channelId = String(r.authorExternalChannelId || head.authorExternalChannelId || '').trim();
    let text = plainText(r.message);
    if (!text && kind === 'membership') text = plainText(r.headerSubtext) || plainText(r.headerPrimaryText);
    if (!text && kind === 'membership_gift') text = plainText(head.primaryText);
    if (!text && kind === 'sticker') {
      text = String(r.sticker?.accessibility?.accessibilityData?.label || '') || 'スーパーステッカー';
    }
    let amount = 0;
    let currency = '';
    if (kind === 'superchat' || kind === 'sticker') {
      const p = parsePurchaseAmount(plainText(r.purchaseAmountText));
      amount = p.amount;
      currency = p.currency;
    }
    if (!name && !text && amount <= 0) return null;
    return {
      id,
      channelId,
      name,
      iconUrl: lastThumbUrl(head.authorPhoto),
      text,
      kind,
      amount,
      currency,
      badges: badgesOf(head),
      ts: '',
      postedAtMs,
      backfill: true,
    };
  }
  return null;
}

/**
 * get_live_chat_replay の返事から、記録の形の配列と次の続き番号を取り出す。
 * @param {any} json
 * @returns {{ items: any[], next: string, lastOffsetMs: number }}
 */
export function ytReplayResponseToRecords(json) {
  const cont = json?.continuationContents?.liveChatContinuation || {};
  const actions = Array.isArray(cont.actions) ? cont.actions : [];
  /** @type {any[]} */
  const items = [];
  let lastOffsetMs = 0;
  for (const a of actions) {
    const rep = a?.replayChatItemAction;
    if (!rep) continue;
    const off = Number(rep.videoOffsetTimeMsec || 0);
    if (Number.isFinite(off) && off > lastOffsetMs) lastOffsetMs = off;
    for (const inner of Array.isArray(rep.actions) ? rep.actions : []) {
      const rec = ytReplayItemToRecord(inner?.addChatItemAction?.item);
      if (rec) items.push(rec);
    }
  }
  let next = '';
  for (const c of Array.isArray(cont.continuations) ? cont.continuations : []) {
    // 最初の返事のあとは「再生位置を指定して取り直す」種類(playerSeek)が来て、そこから頭から順に進む
    const v = c?.liveChatReplayContinuationData?.continuation || c?.playerSeekContinuationData?.continuation || '';
    if (v) {
      next = String(v);
      break;
    }
  }
  return { items, next, lastOffsetMs };
}
