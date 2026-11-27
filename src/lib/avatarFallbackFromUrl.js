/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】サムネ(usericon の URL)が表示できなかったとき、その人ごとの代替顔(ゆっくり顔=identicon)を決める関数
 * 【この箱に入らないもの】画像の読み込み・プローブ・DOM(正本は supportGrowthAvatarLoad.js)
 * 【書けるstorageキー】なし
 * 【正本宣言】「サムネが出ないときの代替顔」を決める唯一の入口。POP も会場もここを通す
 *
 * ★なぜ要るか(2026-10-13・ユーザー指摘「POPと会場が完全一致していない。会場だけサムネあり・その逆」)
 *   アイコン未設定の人は CDN が 404 を返す。そのときの代替顔が【POP と会場で別々に決まっていた】:
 *     ・POP  : 公式の既定アイコン(blank.jpg=白い丸)のまま(popup-entry.js の guard に代替解決器が無い)
 *     ・会場 : その人ごとのゆっくり顔(v0.1.1318「白丸だらけにならないように」で会場にだけ足した)
 *   実測(同じ配信・数値IDの35人): 5人が POP=白丸 / 会場=ゆっくり顔 に割れていた。
 *   その5人の URL は視聴ページの中でも拡張ページの中でも読み込みが error(404)=時間切れではなく未設定。
 *   どちらも意図した設計だったが、二重に決めていたため「同じ人が面によって違う顔」になった。
 *   → 判定をこの1関数に集め、POP と会場が同じ代替顔を出す(白丸でなく、その人ごとのゆっくり顔=過去の方針と同じ)。
 *
 * @module avatarFallbackFromUrl
 */
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';

/**
 * 失敗した usericon の URL から uid を取り出し、その人ごとのゆっくり顔(identicon の data URL)を返す。
 * 解決できなければ ''(呼び出し側の共通 fallback へ倒れる=必ず何か出る)。
 *   URL の形: .../usericon/s/<uid の上位桁>/<uid>.jpg(s/m は任意)。★ここは uid を【取り出すだけ】で URL は組み立てない(組み立ての正本は deriveAvatarUrlFromUid.js)。
 * @param {unknown} requestedSrc
 * @returns {string}
 */
export function identiconFallbackForAvatarUrl(requestedSrc) {
  try {
    const m = /\/usericon\/(?:[sm]\/)?\d+\/(\d{1,14})\.jpg/i.exec(String(requestedSrc || ''));
    const uid = m ? m[1] : '';
    if (!uid) return '';
    return anonymousIdenticonDataUrl(uid, 64) || '';
  } catch {
    return ''; // 失敗時は共通 fallback へ倒れる
  }
}

/**
 * v0.1.2248: 失敗したサムネの代替顔(全サービス共通)。ニコの usericon は uid のゆっくり顔、
 *   それ以外(Twitch・YouTube など)は URL ごとのゆっくり顔。公式の既定アイコン(白い丸)にはしない。
 *   ライブの横の欄・会場・状態ページ・動画の顔の列が同じこの1関数を使う。
 * @param {unknown} requestedSrc
 * @returns {string}
 */
export function avatarFallbackFaceForUrl(requestedSrc) {
  const byUid = identiconFallbackForAvatarUrl(requestedSrc);
  if (byUid) return byUid;
  try {
    const s = String(requestedSrc || '').trim();
    if (!s) return '';
    // v0.1.2259: 公式の灰色の既定アイコンは「顔が無い」と同じ。URL だけでは誰か分からないので、共通のゆっくり顔(灰色にはしない)
    if (isSiteDefaultSilhouetteUrl(s)) return noAvatarFace();
    return anonymousIdenticonDataUrl(s, 64) || '';
  } catch {
    return '';
  }
}

/*
 * v0.1.2259: 「この URL は公式の灰色の既定アイコン(=その人の顔ではない)か」を決める唯一の場所。
 *   ニコの usericon/defaults/ 配下(blank.jpg・blank_s.jpg。secure-dcdn と img.nicoprofile の両方)。
 *   この画像は普通に読み込めるので、読み込み失敗のガードでは拾えず、ニコ生の横の欄に灰色の丸が約80人分残っていた
 *   (lv351883073・約960人中)。Twitch などの色つきの既定アイコンは灰色ではないので、ここには入れない(そのまま出す)。
 *   新しい灰色の既定アイコンが見つかったら、ここに足すだけで全部の欄に効く。
 */
const SITE_DEFAULT_SILHOUETTE_RE = /\/usericon\/defaults\//i;

/**
 * @param {unknown} url
 * @returns {boolean}
 */
export function isSiteDefaultSilhouetteUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  return SITE_DEFAULT_SILHOUETTE_RE.test(url);
}

/** 誰か分からないときの共通の顔(ゆっくり顔)。灰色の既定アイコンの代わりに使う最後の顔。 */
export function noAvatarFace() {
  try {
    return anonymousIdenticonDataUrl('nl-no-avatar', 64) || '';
  } catch {
    return '';
  }
}

/**
 * v0.1.2259: ID の無い行(興味来場など)の顔。記録が重なりを見分けるのと同じ鍵(buildDedupeKey=放送・コメント番号・本文)で
 *   その行ごとのゆっくり顔を決める(全員同じ絵にしない・読み直しても同じ顔)。鍵が無ければ共通のゆっくり顔。
 * @param {unknown} rowKey
 * @returns {string}
 */
export function faceForRowKey(rowKey) {
  const k = String(rowKey || '').trim();
  if (!k) return noAvatarFace();
  try {
    return anonymousIdenticonDataUrl(`row:${k}`, 64) || noAvatarFace();
  } catch {
    return noAvatarFace();
  }
}

/**
 * v0.1.2259: 顔の候補が灰色の既定アイコンなら、その人ごとのゆっくり顔に替える(それ以外はそのまま返す)。
 *   personKey(利用者 ID・名前など)が無いときは共通のゆっくり顔。灰色は出さない。
 * @param {unknown} src
 * @param {unknown} personKey
 * @returns {string}
 */
export function faceInsteadOfSilhouette(src, personKey) {
  const s = String(src || '').trim();
  if (!isSiteDefaultSilhouetteUrl(s)) return s;
  try {
    const k = String(personKey || '').trim();
    const face = k ? anonymousIdenticonDataUrl(k, 64) : '';
    return face || noAvatarFace() || s;
  } catch {
    return noAvatarFace() || s;
  }
}
