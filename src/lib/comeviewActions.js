// comeviewActions.js
// v0.1.666: コメビュのコメント単位アクション(わんコメ同等+追憶独自)の純ロジック。
//
// 設計(ユーザー要望 2026-06-10「ワンコメのこの機能+ワンコメにはない機能つけたい」):
//   わんコメのコメントホバー操作(コピー/ピン留め/非表示/ユーザーNG)を飲みやすさそのままに
//   載せ、さらに追憶だけの武器=全件アーカイブを使った「この人の発言だけ表示」を足す
//   (わんコメ/NCV はライブ受信が主で、過去まで遡った per-user 履歴は出せない)。
//
// このファイルは判定・整形の核ロジックだけ(DOM/storage/chrome.* 非依存・テスト可能):
//   - コピー文字列の組み立て
//   - ユーザー識別キー(userId 優先・無記名は名前で代替)
//   - NG リスト(追加/解除/正規化/上限)と行の非表示判定
//   - アーカイブ行から特定ユーザーの発言だけを抽出

import { normalizeComeviewRow, isGenericComeviewName } from './comeviewRows.js';
import { deriveAvatarUrlFromUid } from './deriveAvatarUrlFromUid.js';
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';

/** NG リストの storage キー(配信を跨いで効く・拡張ページからの小さな UI 状態書込)。 */
export const COMEVIEW_NG_STORAGE_KEY = 'nls_comeview_ng_v1';

/** NG リストの上限(無限に増やさない。古いものから捨てる)。 */
export const COMEVIEW_NG_MAX = 300;

/**
 * ピン留め共有の storage キー(同じ配信の全コメビュ窓=OBS透過窓にも同期)。
 * @param {string} liveId
 * @returns {string}
 */
export function comeviewPinStorageKey(liveId) {
  return `nls_comeview_pin_${String(liveId || '').trim().toLowerCase()}`;
}

/** 匿名など本家サムネが無いユーザーに出す、ニコニコ公式の既定アイコン。 */
export const COMEVIEW_DEFAULT_AVATAR_URL =
  'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg';

/**
 * v0.1.670: コメビュの行アイコンを本家と同じサムネに解決する。
 *   取り込み済みの avatar URL > userId から確定パターン生成(popup と同じ
 *   deriveAvatarUrlFromUid・v0.1.203 実機確認済) > 匿名(a:…)は公式の既定アイコン。
 *   いずれも無ければ ''=呼び出し側のフォールバック(色付き丸)に委ねる。
 * @param {{ avatar?: string, userId?: string }|null|undefined} row
 * @returns {string}
 */
export function resolveComeviewAvatarUrl(row) {
  if (!row || typeof row !== 'object') return '';
  const direct = String(row.avatar || '').trim();
  if (direct) return direct;
  const uid = String(row.userId || '').trim();
  const derived = deriveAvatarUrlFromUid(uid);
  if (derived) return derived;
  // v0.1.674: 匿名はパネルの応援タイムラインと同じ identicon(ユーザーごとに違う幾何学模様・
  //   同じ人=同じ模様)。一律グレーの既定アイコンだと「誰が何件書いたか識別できる」特徴が
  //   死ぬ(ユーザー指摘)。勝手なアレンジをせずパネルと同じ見え方に揃える。
  if (uid) {
    const identicon = anonymousIdenticonDataUrl(uid, 64);
    if (identicon) return identicon;
    return COMEVIEW_DEFAULT_AVATAR_URL;
  }
  return '';
}

/**
 * v0.1.673: 行にプロフィールキャッシュ(nls_user_comment_profile_v1)の名前/サムネを補完する。
 *   パネルの応援タイムラインで名前・サムネが出るのと同じ情報源をそのまま使う(ユーザー指示
 *   「むずかしく考えずこのデータをそのまま使えばいい」)。行自身の値があればそれを優先し、
 *   空のところだけキャッシュで埋める。
 * @param {{ name?: string, avatar?: string, userId?: string }|null|undefined} row
 * @param {Record<string, { nickname?: string, avatarUrl?: string }>|null|undefined} profileMap
 * @returns {any} 補完済みの行(変更不要ならそのまま返す)
 */
export function mergeComeviewRowWithProfile(row, profileMap) {
  if (!row || typeof row !== 'object') return row;
  const uid = String(row.userId || '').trim();
  const e =
    uid && profileMap && typeof profileMap === 'object' ? profileMap[uid] : null;
  if (!e) return row;
  const curName = String(row.name || '').trim();
  const curAvatar = String(row.avatar || '').trim();
  const name = curName || String(e.nickname || '').trim();
  const avatar = curAvatar || String(e.avatarUrl || '').trim();
  if (name === curName && avatar === curAvatar) return row;
  return { ...row, name, avatar };
}

/**
 * v0.1.671: ユーザーページ URL(数値 ID のみ。匿名 a:… には公開ページが無い)。
 * 「サムネ・ID・ハンドル・リンクは分かる限りセットで出す」原則のリンク部分。
 * @param {string|null|undefined} userId
 * @returns {string} 'https://www.nicovideo.jp/user/<id>' または ''
 */
export function comeviewUserPageUrl(userId) {
  const uid = String(userId || '').trim();
  if (!/^\d{1,18}$/.test(uid)) return '';
  return `https://www.nicovideo.jp/user/${uid}`;
}

/**
 * 行からユーザー識別キーを作る。userId 優先・無ければ表示名で代替(ニコ生の匿名は
 * userId が空で name だけのことがある)。どちらも無い行は識別不能('')=NG 対象外。
 * @param {{ userId?: string, name?: string }|null|undefined} row
 * @returns {string} 'u:<userId>' | 'n:<name>' | ''
 */
export function comeviewUserKeyForRow(row) {
  if (!row || typeof row !== 'object') return '';
  const uid = String(row.userId || '').trim();
  if (uid) return `u:${uid}`;
  const name = String(row.name || '').trim();
  // v0.1.671: 「匿名」「名無し」等の汎用名は個人を識別しない=キーにしない
  //   (1人をNGしたら全匿名が消える事故の防止)。
  if (name && !isGenericComeviewName(name)) return `n:${name}`;
  return '';
}

/**
 * コピー用文字列を組み立てる(名前があれば「名前: 本文」、無ければ本文だけ)。
 * @param {{ name?: string, text?: string }|null|undefined} row
 * @returns {string}
 */
export function buildComeviewCopyText(row) {
  if (!row || typeof row !== 'object') return '';
  const text = String(row.text || '').trim();
  if (!text) return '';
  const name = String(row.name || '').trim();
  return name ? `${name}: ${text}` : text;
}

/**
 * storage から読んだ生値を NG エントリ配列 [{key,name,at}] に正規化する。
 * @param {unknown} raw
 * @returns {Array<{ key: string, name: string, at: number }>}
 */
export function normalizeComeviewNgList(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {Array<{ key: string, name: string, at: number }>} */
  const out = [];
  const seen = new Set();
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const key = String(/** @type {any} */ (e).key || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      name: String(/** @type {any} */ (e).name || '').trim(),
      at: Number(/** @type {any} */ (e).at) || 0
    });
  }
  return out.length > COMEVIEW_NG_MAX ? out.slice(out.length - COMEVIEW_NG_MAX) : out;
}

/**
 * NG リストへ行のユーザーを追加した新しいリストを返す(冪等・上限で古い順に捨てる)。
 * @param {Array<{ key: string, name: string, at: number }>} list
 * @param {{ userId?: string, name?: string }} row
 * @param {number} [nowMs]
 * @returns {{ list: Array<{ key: string, name: string, at: number }>, added: boolean, key: string }}
 */
export function addComeviewNgEntry(list, row, nowMs = 0) {
  const key = comeviewUserKeyForRow(row);
  const base = Array.isArray(list) ? list : [];
  if (!key) return { list: base, added: false, key: '' };
  if (base.some((e) => e && e.key === key)) return { list: base, added: false, key };
  const next = [
    ...base,
    { key, name: String(row?.name || '').trim(), at: Number(nowMs) || 0 }
  ];
  return {
    list: next.length > COMEVIEW_NG_MAX ? next.slice(next.length - COMEVIEW_NG_MAX) : next,
    added: true,
    key
  };
}

/**
 * NG リストから key を外した新しいリストを返す。
 * @param {Array<{ key: string, name: string, at: number }>} list
 * @param {string} key
 * @returns {Array<{ key: string, name: string, at: number }>}
 */
export function removeComeviewNgEntry(list, key) {
  const base = Array.isArray(list) ? list : [];
  const k = String(key || '').trim();
  if (!k) return base;
  return base.filter((e) => e && e.key !== k);
}

/**
 * 行を画面から隠すべきか(ユーザーNG or 行単位の非表示)。
 * @param {{ id?: string, userId?: string, name?: string }|null|undefined} row
 * @param {Set<string>} ngKeys NG 中のユーザーキー集合
 * @param {Set<string>} hiddenIds 行単位で隠した id 集合
 * @returns {boolean}
 */
export function isComeviewRowHidden(row, ngKeys, hiddenIds) {
  if (!row || typeof row !== 'object') return false;
  const id = String(row.id || '');
  if (hiddenIds instanceof Set && id && hiddenIds.has(id)) return true;
  if (ngKeys instanceof Set && ngKeys.size > 0) {
    const key = comeviewUserKeyForRow(row);
    if (key && ngKeys.has(key)) return true;
  }
  return false;
}

/**
 * アーカイブの生コメント行(チャンク本体の配列)から、特定ユーザーの発言だけを
 * 時系列昇順で抽出する(追憶独自「この人の発言だけ」の核)。
 * 件数は total(全件)と rows(末尾 max 件)で返す=巨大配信でも DOM を溢れさせない。
 *
 * @param {unknown} rawRows チャンクを連結した生コメント配列(昇順想定)
 * @param {string} userKey comeviewUserKeyForRow の形式('u:…'/'n:…')
 * @param {number} [max] 返す行数の上限(既定 200)
 * @returns {{ rows: ReturnType<typeof normalizeComeviewRow>[], total: number }}
 */
export function extractUserCommentRows(rawRows, userKey, max = 200) {
  const key = String(userKey || '').trim();
  if (!Array.isArray(rawRows) || !key) return { rows: [], total: 0 };
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : 200;
  /** @type {ReturnType<typeof normalizeComeviewRow>[]} */
  const hits = [];
  for (const raw of rawRows) {
    const n = normalizeComeviewRow(raw);
    if (!n) continue;
    if (comeviewUserKeyForRow(n) !== key) continue;
    hits.push(n);
  }
  return {
    rows: hits.length > cap ? hits.slice(hits.length - cap) : hits,
    total: hits.length
  };
}
