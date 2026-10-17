/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】ピックアップ枠に出す「発言者の情報セット」(サムネ・ハンドルネーム・ID・リンク)を作る規則
 * 【この箱に入らないもの】DOM(venuePickupBanner.js)・storage・どの発言を選ぶか(pickTickerHighlight.js)
 * 【書けるstorageキー】なし
 * 【正本宣言】会場ピックアップ枠の発言者表示の規則はこのファイルのみ
 *
 * ★なぜ(2026-10-17 ユーザー要望・AGENTS.md §3.5): 「人が画面に出る場所では サムネ・ID・ハンドルネーム・リンク を分かる限りセットで出す」。
 *   枠は本文だけで、誰の発言か分からなかった。
 *   - 数値ID(本登録): サムネ=プロフィールで観測済みの実URL > uid から導出する公式パターン / 名前=ハンドルネーム / ID:数値 / ユーザーページへのリンク
 *   - 匿名(184): サムネ=identicon(ゆっくり顔)/ 名前=「匿名NNN」(安定番号)/ IDは出さない / リンクなし(捏造しない)
 * @module venuePickupSpeaker
 */

import { deriveAvatarUrlFromUid } from './deriveAvatarUrlFromUid.js';
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';
import { anonymousDisplayLabel, nicoUserPageUrl } from './nicoUserPage.js';
import { isNumericNicoUserId } from '../domain/user/identity.js';

/**
 * @typedef {{ uid: string, anon: boolean, name: string, idLine: string, href: string, avatar: string, fallbackAvatar: string }} PickupSpeaker
 */

/** @param {unknown} v @returns {boolean} http(s) の実URLか */
function isHttpUrl(v) {
  return typeof v === 'string' && /^https?:\/\//i.test(v.trim());
}

/**
 * @param {{ userId?: unknown, name?: unknown }|null|undefined} speech 発言(userId / name)
 * @param {{ profileAvatarUrl?: unknown, profileNickname?: unknown }} [ctx] 観測済みのプロフィールのサムネURL・ハンドルネーム(あれば使う)
 * @returns {PickupSpeaker}
 */
export function resolvePickupSpeaker(speech, ctx = {}) {
  const uid = String(speech?.userId ?? '').trim();
  // ハンドルネーム: 発言行の名前 > 観測済みプロフィール(NDGR の発言は名前を持たないことが多い)。
  const rawName = String(speech?.name ?? '').replace(/\s+/g, ' ').trim() || String(ctx.profileNickname ?? '').replace(/\s+/g, ' ').trim();
  if (uid && isNumericNicoUserId(uid)) {
    const observed = isHttpUrl(ctx.profileAvatarUrl) ? String(ctx.profileAvatarUrl).trim() : '';
    return {
      uid,
      anon: false,
      name: rawName,
      idLine: `ID:${uid}`,
      href: nicoUserPageUrl(uid) || '',
      avatar: observed || deriveAvatarUrlFromUid(uid) || anonymousIdenticonDataUrl(uid, 64),
      fallbackAvatar: anonymousIdenticonDataUrl(uid, 64)
    };
  }
  const key = uid || rawName || 'anonymous';
  return {
    uid,
    anon: true,
    name: anonymousDisplayLabel(key),
    idLine: '',
    href: '',
    avatar: anonymousIdenticonDataUrl(key, 64),
    fallbackAvatar: anonymousIdenticonDataUrl(key, 64)
  };
}
