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
