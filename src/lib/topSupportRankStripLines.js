// topSupportRankStripLines.js — 応援ランキング上位ストリップの各行(サムネ/色アクセント/リンク)を組み立てる純ロジック。
import {
  isHttpOrHttpsUrl,
  isAnonymousStyleNicoUserId,
  pickSupportGrowthFallbackTileSrc
} from './supportGrowthTileSrc.js';
import {
  accentColorForSlot,
  accentSlotFromUserKey
} from './userSupportGridAccent.js';
import {
  UNKNOWN_USER_KEY,
  shortUserKeyDisplay,
  displayUserLabel
} from './userRooms.js';
import { anonymousNicknameFallback } from './nicoAnonymousDisplay.js';
import {
  formatNicknameWithUidFallback,
  scrubGiftRankingNickname
} from './giftDisplayNickname.js';

/**
 * @typedef {{
 *   userKey: string,
 *   nickname: string,
 *   count: number,
 *   avatarUrl?: string,
 *   rankHint?: number|null,
 *   hideIdLine?: boolean
 * }} TopSupportRankRoom
 */

/**
 * @typedef {{
 *   count: number,
 *   userKey: string,
 *   isUnknown: boolean,
 *   placeNumber: number | null,
 *   hasAccent: boolean,
 *   accentColorCss: string | null,
 *   thumbSrc: string,
 *   thumbNeedsNoReferrer: boolean,
 *   idTitle: string,
 *   idShort: string,
 *   nameLine: string,
 *   fullLabelForTitle: string
 * }} TopSupportRankLineModel
 */

/**
 * 公式DOMランキング行（広告/貢献度）の合成 userKey か。
 * `__ad_${i}_${name}` / `__anon_ad_${i}` / `__contrib_${i}_${name}` /
 * `__anon_contrib_${i}` を対象にする（giftHistory の `__gift_` は対象外＝不変）。
 *
 * @param {string} userKey
 * @returns {boolean}
 */
function isOfficialDomRankUserKey(userKey) {
  return /^__(?:anon_)?(?:ad|contrib)_\d+/.test(String(userKey || ''));
}

/**
 * 公式DOMランキング行の「匿名」合成 userKey か。
 * `__anon_ad_${i}` / `__anon_contrib_${i}` を対象にする。
 * これらは送信側で name が空（匿名行）のときに付く合成キーであり、
 * 表示にそのまま出すと `__anon_ad_2` / `u/__anon_ad_2` のような内部キーが
 * 画面に漏れる。公式ページ相当では「匿名」と表示すべき。
 *
 * @param {string} userKey
 * @returns {boolean}
 */
function isAnonymousOfficialDomRankUserKey(userKey) {
  return /^__anon_(?:ad|contrib)_\d+/.test(String(userKey || ''));
}

/**
 * ギフト履歴の合成 userKey か。
 * `__gift_${i}_${name}` / `__anon_gift_${i}` / `__gift_sender_${bucket}` を対象。
 * v0.1.318: これらは内部用の合成キーであり、id 行（idShort/idTitle）に出すと
 * `__anon_gift_0` / `__gift_sender_むめい` 等の内部文字列が画面に漏れる。名前は
 * nickname で出るので、id 行は抑制する（公式ランクキーと同じ扱い）。リンク化も
 * `isAnonymousStyleNicoUserId` が true を返すので発生しない。
 *
 * @param {string} userKey
 * @returns {boolean}
 */
function isSyntheticGiftSenderKey(userKey) {
  return /^__(?:anon_gift|gift)_/.test(String(userKey || ''));
}

/**
 * 公式 DOM/API ランキング（貢献度・広告）の匿名行の表示ラベル。
 * v0.1.317: niconico 公式は匿名を「名無し」と表記する（koken API supporterName /
 * 公式 DOM とも "名無し"）。レーンは「niconico の表示に準拠」と謳うので、内部キーは
 * 漏らさず公式表記に合わせる（旧 "匿名" から変更）。giftHistory(`__gift_`) は
 * 本判定の対象外＝この変更の影響を受けない（NDGR 送信者名は別出所のため）。
 */
const OFFICIAL_RANK_ANON_LABEL = '名無し';

/**
 * userKey から決定的な短いハッシュ（byte 一意性の保証用、djb2）。
 *
 * @param {string} s
 * @returns {string}
 */
function shortDeterministicHash(s) {
  let h = 5381;
  const str = String(s || '');
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

/**
 * 実アバターが取れない公式DOMランキング行の「順位バッジ風 中立プレースホルダ」。
 *
 * 匿名 identicon トグルに依存せず、行ごとに必ず異なる決定的 data URL を返す
 * （旧: 全行が共有プレースホルダ1枚に潰れ「サムネかぶり」だった）。
 * 「本物のアイコン」と誤認させないよう灰色地に順位番号＋「未取得」を出す中立
 * デザイン。userKey ハッシュを `<title>` に埋め、順位が同値でも byte 一意になる
 * ことを保証する。副作用なし・トグル状態に非依存。
 *
 * @param {number|null} placeNumber 1始まりの順位（null/0以下は '—'）
 * @param {string} userKey
 * @returns {string} data:image/svg+xml URL
 */
function officialDomRankBadgeThumb(placeNumber, userKey) {
  const n =
    typeof placeNumber === 'number' &&
    Number.isFinite(placeNumber) &&
    placeNumber > 0
      ? String(Math.floor(placeNumber))
      : '—';
  const uniq = shortDeterministicHash(userKey);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" role="img">' +
    `<title>順位${n} 未取得 ${uniq}</title>` +
    '<rect width="48" height="48" rx="11" fill="#e7e9ec"/>' +
    `<text x="24" y="25" font-family="sans-serif" font-size="17" font-weight="700" fill="#8b95a1" text-anchor="middle">${n}</text>` +
    '<text x="24" y="38" font-family="sans-serif" font-size="8" fill="#aab2bc" text-anchor="middle">未取得</text>' +
    '</svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * 応援ランキングストリップ1行分の表示モデル（DOM・HTML エスケープなし）。
 *
 * @param {TopSupportRankRoom[]} stripRooms
 * @param {{
 *   defaultThumbSrc: string,
 *   anonymousFallbackThumbSrc?: string,
 *   colorScheme?: 'light'|'dark',
 *   anonymousIdenticonResolver?: (userId: string) => string,
 *   placeNumberMode?: 'row'|'dense'
 * }} opts
 * @returns {TopSupportRankLineModel[]}
 */
export function topSupportRankLineModels(stripRooms, opts) {
  const defaultThumb = String(opts?.defaultThumbSrc || '').trim();
  const anonThumb = String(opts?.anonymousFallbackThumbSrc || '').trim();
  const colorScheme = opts?.colorScheme === 'dark' ? 'dark' : 'light';
  const placeMode = opts?.placeNumberMode === 'dense' ? 'dense' : 'row';
  const idnResolver =
    typeof opts?.anonymousIdenticonResolver === 'function'
      ? opts.anonymousIdenticonResolver
      : null;
  const rooms = Array.isArray(stripRooms) ? stripRooms : [];
  // v0.1.282: 公式DOMランキングの scrape が上位行に同一の実 thumbnailUrl を
  // 入れる事故（実機: 広告ランキング 1-3 位が全部同じアイコン）への防御。
  // 同一 http URL が公式DOMランク行で 2 行以上に重複していたら scrape
  // アーティファクト（別の応援者なのに同一画像）と判断し、その URL を持つ
  // 行は実URL不採用 → 下流で行別「中立順位バッジ」へ落とす（ユーザー選択の
  // 方針＝かぶりは識別可能な中立表示で解消、本物アイコン誤認も避ける）。
  /** @type {Map<string, number>} */
  const officialRankUrlFreq = new Map();
  for (const rr of rooms) {
    if (!isOfficialDomRankUserKey(String(rr?.userKey ?? ''))) continue;
    const u = String(rr?.avatarUrl || '').trim();
    if (!u || !isHttpOrHttpsUrl(u)) continue;
    officialRankUrlFreq.set(u, (officialRankUrlFreq.get(u) || 0) + 1);
  }
  let knownRank = 0;
  /** 密順位（同回数は同順位、次は飛ばさず 1,2,2,2,3…）用 */
  let denseRank = 0;
  /** @type {number|null} */
  let denseLastCount = null;

  return rooms.map((r) => {
    const userKey = String(r?.userKey ?? '');
    const isUnknown = userKey === UNKNOWN_USER_KEY;
    const count = Math.max(0, Number(r?.count) || 0);
    const rankHintRaw = r?.rankHint;
    const rankHint =
      typeof rankHintRaw === 'number' &&
      Number.isFinite(rankHintRaw) &&
      rankHintRaw > 0
        ? Math.floor(rankHintRaw)
        : null;
    /** @type {number|null} */
    let placeNumber;
    if (isUnknown) {
      placeNumber = null;
    } else if (rankHint != null) {
      placeNumber = rankHint;
    } else if (placeMode === 'dense') {
      if (denseLastCount === null || count < denseLastCount) {
        denseRank += 1;
        denseLastCount = count;
      }
      placeNumber = denseRank;
    } else {
      knownRank += 1;
      placeNumber = knownRank;
    }

    const rawAv = String(r?.avatarUrl || '').trim();
    const uidForThumb = isUnknown ? '' : userKey;
    const isOfficialRank = isOfficialDomRankUserKey(userKey);
    // 公式DOMランクで同一 http URL が複数行に重複 = scrape アーティファクト。
    // 実URL を採用せず中立バッジへ（1-3 位かぶりの本丸）。
    const rawAvDuplicatedOfficial =
      isOfficialRank &&
      isHttpOrHttpsUrl(rawAv) &&
      (officialRankUrlFreq.get(rawAv) || 0) >= 2;
    let thumbSrc = '';
    if (isHttpOrHttpsUrl(rawAv) && !rawAvDuplicatedOfficial) {
      thumbSrc = String(rawAv).trim();
    } else if (isOfficialRank) {
      // v0.1.282: 公式DOMランキング（広告/貢献度）で実サムネが取れない or
      // 重複アーティファクトの行は、匿名 identicon トグルに依存せず行ごとに
      // 必ず異なる「順位バッジ風 中立プレースホルダ」にする（旧: idnResolver
      // =undefined 時に共有プレースホルダ1枚へ全行が潰れ「サムネかぶり」、
      // および scrape が上位行へ同一実URLを入れる「サムネかぶり」両方を解消）。
      // 一意な実 http サムネは上の分岐で最優先のまま不変。
      thumbSrc = officialDomRankBadgeThumb(placeNumber, userKey);
    } else if (
      idnResolver &&
      uidForThumb &&
      isAnonymousStyleNicoUserId(uidForThumb)
    ) {
      const idn = String(idnResolver(uidForThumb) || '').trim();
      thumbSrc = idn
        ? idn
        : pickSupportGrowthFallbackTileSrc(
            uidForThumb,
            rawAv,
            defaultThumb,
            anonThumb || defaultThumb
          );
    } else {
      thumbSrc = pickSupportGrowthFallbackTileSrc(
        uidForThumb,
        rawAv,
        defaultThumb,
        anonThumb || defaultThumb
      );
    }
    const thumbNeedsNoReferrer = isHttpOrHttpsUrl(thumbSrc);

    const nickRaw = scrubGiftRankingNickname(String(r?.nickname ?? ''));
    const hideIdLine = Boolean(r?.hideIdLine);
    const useOfficialDomNick =
      /^__(ad|contrib)_\d+_/i.test(userKey) && Boolean(nickRaw);
    // 公式DOMランキング行で「使える公式表示名が無い」ものは、内部合成キーを表示に
    // 漏らさず「匿名」と出す（公式ページ相当）。id 行・u/ リンク・title も出さない。
    //
    // v0.1.308 は明示的匿名キー（__anon_ad_N / __anon_contrib_N）だけを対象に
    // していたが、scrape が name を読めず isAnonymous も付かなかった行は
    // `__ad_N_` / `__contrib_N_`（name 空サフィックス）になり、useOfficialDomNick が
    // false のまま下流の uid フォールバックで `u/__ad_N_` と内部キーが漏れていた。
    // → 「公式DOMランク行 かつ 使える公式表示名が無い」を一律 匿名表示に倒す（v0.1.315）。
    const isAnonOfficialDomRank =
      isAnonymousOfficialDomRankUserKey(userKey) ||
      (isOfficialRank && !useOfficialDomNick);
    const resolvedNickForLine = useOfficialDomNick
      ? nickRaw
      : isAnonOfficialDomRank
        ? OFFICIAL_RANK_ANON_LABEL
        : anonymousNicknameFallback(userKey, nickRaw);

    // 合成キー（公式ランク／ギフト履歴）は id 行・id title に内部キーを出さない。
    // 名前は nickname で出るので id 行は抑制する（v0.1.318: ギフト合成キーも追加）。
    const isSyntheticGift = isSyntheticGiftSenderKey(userKey);
    const idTitle =
      isUnknown || isAnonOfficialDomRank || useOfficialDomNick || isSyntheticGift || hideIdLine
        ? ''
        : String(r.userKey);
    let idShort = isUnknown
      ? '—'
      : useOfficialDomNick || isAnonOfficialDomRank || isSyntheticGift || hideIdLine
        ? ''
        : shortUserKeyDisplay(userKey) || String(userKey);

    const nameLine = isUnknown
      ? '—'
      : isAnonOfficialDomRank
        ? OFFICIAL_RANK_ANON_LABEL
        : formatNicknameWithUidFallback(userKey, resolvedNickForLine) || '（未取得）';

    // internal key が __anon_<表示名> で name と一致するときは id 行を出さない（二重表示防止）
    if (!isUnknown && !useOfficialDomNick && idShort) {
      const m = /^__anon_(.+)$/i.exec(String(userKey));
      if (m && String(nameLine).trim() === String(m[1]).trim()) {
        idShort = '';
      }
    }

    // title（hover ラベル）も合成キーを漏らさない。匿名は公式表記「名無し」、公式DOM
    // ランクの名前付き行は公式表示名のみ（`displayUserLabel` だと `名前（__ad_0_名前）`
    // と内部キーが括弧で出てしまう）。非公式行は従来どおり id 併記。
    const fullLabelForTitle = isAnonOfficialDomRank
      ? OFFICIAL_RANK_ANON_LABEL
      : useOfficialDomNick
        ? nickRaw
        : isSyntheticGift
          ? // ギフト合成キーは title にも内部キーを出さず nickname のみ（空なら「名無し」）
            String(r?.nickname || '').trim() || '名無し'
          : displayUserLabel(userKey, r?.nickname);

    let hasAccent = false;
    let accentColorCss = null;
    if (!isUnknown) {
      const slot = accentSlotFromUserKey(userKey);
      const col = slot != null ? accentColorForSlot(slot, colorScheme) : null;
      if (col) {
        hasAccent = true;
        accentColorCss = col;
      }
    }

    return {
      count,
      userKey,
      isUnknown,
      placeNumber,
      hasAccent,
      accentColorCss,
      thumbSrc,
      thumbNeedsNoReferrer,
      idTitle,
      idShort,
      nameLine,
      fullLabelForTitle
    };
  });
}
