/**
 * identityAcquisitionCensus.js — サムネ / 数値ID / アカウント名 の【取得率】を数える純関数。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★なぜ要るか(ユーザー確定 2026-08-12)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   「計器強化して サムネ ID アカウント名 を確実にとるのが価値高いと思う」
 *
 * この3つが取れないと「誰が応援しているか」が分からない=このアプリの価値の根幹。
 * ところが従来の計器は【断片的】だった:
 *   - `savedCommentsUidStats.withUidPercent` … 保存コメント基準(レーンに出ている人ではない)
 *   - `avatarLoadDiag` … 画像の【読み込み】成否(URLが取れたかは別)
 *   - `storyUserLaneYukkuriNamedCensus` … 「ゆっくり顔なのに名前あり」の矛盾検出だけ
 * ＝「いまレーンに並んでいる人のうち、何%が3点セットを持っているか」を答える計器が無かった。
 *
 * ■ この計器の掟(今日確定した判定基準に従う)
 *   1. **「取れない」と「取れなかった」を分ける**。
 *      匿名(a:)は仕様上、数値IDも個人サムネも【原理的に存在しない】。
 *      これを「失敗」に数えると、匿名が多い配信で永久に赤くなり**読んでも直せない**
 *      ([[instrument-value-is-measured-by-fixes-2026-08-12]])。
 *      ★分母は「取れるはずの人(数値ID保持者)」にする。
 *   2. **0件を「異常なし」と言わない**([[zero-count-may-mean-unmeasured-2026-08-04]])。
 *   3. **原因を名指しする**([[instrument-must-name-the-cause-2026-08-01]])。
 *      未取得の内訳を「匿名だから原理的に不可 / 名前が未解決 / サムネが合成既定のまま」に分ける。
 *
 * 掟: 数えるだけ。DOM を触らない・storage を読まない(呼び出し側が渡す)。
 *
 * @module identityAcquisitionCensus
 */

import { isAnonymousStyleNicoUserId } from './supportGrowthTileSrc.js';
import { resolveLaneEvidence } from '../domain/lane/evidence.js';

/**
 * @typedef {{
 *   userId?: unknown,
 *   nickname?: unknown,
 *   displaySrc?: unknown,
 *   thumbScore?: unknown
 * }} IdentityCandidate
 */

/**
 * 数値ID(ニコニコの実ユーザーID)か。匿名(a:)やハッシュ風は false。
 * @param {unknown} userId
 * @returns {boolean}
 */
export function hasNumericUserId(userId) {
  const s = String(userId ?? '').trim();
  return /^\d{5,14}$/.test(s);
}

/**
 * 「アカウント名が取れている」か。
 * ★空・'匿名'・'(未取得)'・'u/<数字>' のような代替表記は【未取得】として扱う。
 *   ここを甘くすると「名前が取れている率99%」という嘘の緑になる。
 * @param {unknown} nickname
 * @param {unknown} userId
 * @returns {boolean}
 */
export function hasRealNickname(nickname, userId) {
  const n = String(nickname ?? '').trim();
  if (!n) return false;
  if (/^匿名$/.test(n)) return false;
  if (/^[（(]?未取得[)）]?$/.test(n)) return false;
  // 'u/12345' 形式は ID のフォールバック表示であって名前ではない。
  const uid = String(userId ?? '').trim();
  if (uid && (n === `u/${uid}` || n === uid)) return false;
  if (/^u\/\d{3,}$/.test(n)) return false;
  return true;
}

/**
 * レーン候補の集合から3点セットの取得状況を数える。
 *
 * @param {ReadonlyArray<IdentityCandidate>|null|undefined} candidates
 * @returns {{
 *   total: number,
 *   anonymous: number,
 *   identifiable: number,
 *   withThumb: number,
 *   withName: number,
 *   withAll: number,
 *   guessedThumb: number,
 *   thumbPercent: number,
 *   namePercent: number,
 *   allPercent: number,
 *   missingThumb: number,
 *   missingName: number,
 *   anonWithThumb: number,
 *   anonWithName: number,
 *   anonWithBoth: number,
 *   shortNumericId: number,
 *   overallThumbPercent: number,
 *   overallNamePercent: number,
 *   overallAllPercent: number
 * }}
 */
export function countIdentityAcquisition(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  let total = 0;
  let anonymous = 0;
  let identifiable = 0;
  let withThumb = 0;
  let withName = 0;
  let withAll = 0;
  // ★IDから式で組んだ推測URL(実在未確認)。画面には絵が出るが「取れた」ではない。
  let guessedThumb = 0;
  // ★v1: 匿名側の保有(前提「匿名にはサムネも名前も無い」の正否を測る)。
  let anonWithThumb = 0;
  let anonWithName = 0;
  let anonWithBoth = 0;
  // ★v1: 1〜4桁の数値ID(実在する初期ユーザーが匿名扱いされている件数)。
  let shortNumericId = 0;

  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    total += 1;
    const uid = raw.userId;
    if (!hasNumericUserId(uid)) {
      /*
       * ★v1(2026-08-17 仕様見直し会議): 分母からは従来どおり外すが、
       *   【保有しているかは数える】ようにした。
       *   旧実装はここで素通りしていたため「匿名にサムネ/名前があるか」を
       *   誰も答えられなかった(=前提の誤りを検出できない計器だった)。
       *   判定は段分けの法(v2)と同じ正本 resolveLaneEvidence を使う
       *   ([[shared-knowledge-is-not-shared-judgment-2026-08-10]])。
       */
      if (isAnonymousStyleNicoUserId(uid)) {
        anonymous += 1;
        const ev = resolveLaneEvidence({
          userId: uid,
          // ★保存層の生の名前を使う。表示層(meta.nameLine)は「匿名（a:xxx）」を
          //   合成するので、それで測ると保有率100%の嘘になる。
          nickname: raw.rawNickname,
          avatarObserved: raw.avatarObserved,
          // thumbScore>=2 だけを実サムネとする(1=推測URLは404実績あり)。
          hasNonCanonicalPersonalUrl: Math.floor(Number(raw.thumbScore) || 0) >= 2
        });
        if (ev.hasObservedThumb) anonWithThumb += 1;
        if (ev.hasOwnName) anonWithName += 1;
        if (ev.hasObservedThumb && ev.hasOwnName) anonWithBoth += 1;
      }
      // ★桁レンジの既知の誤差(1〜4桁の実在初期ユーザーが匿名扱い)の発生数。
      //   直すかどうかはこの実測値を見てから決める(設計書 §5)。
      if (/^\d{1,4}$/.test(String(uid ?? '').trim())) shortNumericId += 1;
      continue;
    }
    identifiable += 1;
    /*
     * thumbScore: 0=無効 / 1=【IDから組んだ推測URL】/ 2=個人サムネ(実取得)。
     * ★2 だけを「取れた」とする。1 は画面に絵が出るが、それは
     *   `https://.../usericon/s/<上位>/<uid>.jpg` を式で組んだだけで、
     *   実在を確認していない=404 になりうる(実機速報で実際に1件404していた)。
     * ★ここを 1 も成功に数えると「サムネ100%」という嘘の緑になる。
     */
    const score = Math.floor(Number(raw.thumbScore) || 0);
    const thumbOk = score >= 2;
    if (score === 1) guessedThumb += 1;
    const nameOk = hasRealNickname(raw.nickname, uid);
    if (thumbOk) withThumb += 1;
    if (nameOk) withName += 1;
    if (thumbOk && nameOk) withAll += 1;
  }

  /** @param {number} n */
  const pct = (n) => (identifiable > 0 ? Math.round((n / identifiable) * 1000) / 10 : 0);
  /*
   * ★v1: 「画面に出ている全員」を分母にした率も出す(二重分母)。
   *   実機(2026-08-17)は 55人中51人が匿名で、同じ状態が
   *   【100%(取れるはずの4人中4人)】とも【7.3%(全55人中4人)】とも表示できた。
   *   片方だけ出すと必ずどちらかが誤解を生む＝ユーザー「正確なデータをださないといみがない」。
   * ★overall 側の分子には匿名の保有も加える(実際に取れている人は取れている)。
   */
  /** @param {number} n */
  const pctAll = (n) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
  return {
    total,
    anonymous,
    identifiable,
    withThumb,
    withName,
    withAll,
    guessedThumb,
    thumbPercent: pct(withThumb),
    namePercent: pct(withName),
    allPercent: pct(withAll),
    missingThumb: Math.max(0, identifiable - withThumb),
    missingName: Math.max(0, identifiable - withName),
    // ★v1 追加(既存フィールドは1つも変えていない)
    anonWithThumb,
    anonWithName,
    anonWithBoth,
    shortNumericId,
    overallThumbPercent: pctAll(withThumb + anonWithThumb),
    overallNamePercent: pctAll(withName + anonWithName),
    overallAllPercent: pctAll(withAll + anonWithBoth)
  };
}

/**
 * 診断ペイロード用に「集計 + 速報行」をまとめて返す。
 * ★popup-entry.js の行数上限対策(組み立てはこちらに置く)。
 * @param {ReturnType<typeof countIdentityAcquisition>|null|undefined} c
 * @returns {object|null}
 */
export function buildIdentityAcquisitionProbe(c) {
  if (!c || typeof c !== 'object') return null;
  return { ...c, line: formatIdentityAcquisitionLine(c) };
}

/**
 * レーンの pick 配列(描画に渡した実表示)から直接数える。
 * ★popup-entry.js は max-lines 上限(22119)に張り付いているので、
 *   pick→候補への写像はこちら(lib)に置く。呼び出し側は1行で済む。
 * ★数えるのは【画面に出ている人】。候補全体を数えると画面と食い違う
 *   ([[check-what-the-number-counts-2026-08-09]])。
 *
 * @param {ReadonlyArray<any>|null|undefined} picks renderStoryUserLaneDom に渡す item 配列
 * @returns {ReturnType<typeof countIdentityAcquisition>|null}
 */
export function countIdentityFromLanePicks(picks) {
  try {
    const list = Array.isArray(picks) ? picks : [];
    return countIdentityAcquisition(
      list.map((p) => ({
        userId: p?.entry?.userId,
        nickname: p?.meta?.nameLine,
        thumbScore: p?.thumbScore,
        /*
         * ★v1 追加: 匿名側の保有を測るための【保存層】の生の値。
         *   上の `nickname` は表示層(meta.nameLine)で、匿名には
         *   「匿名（a:xxxx）」が合成されて入る＝これで名前保有を測ると
         *   100%の嘘になる([[check-what-the-number-counts-2026-08-09]])。
         *   ★会場(venueLaneBuckets)の pick は entry が {userId} だけなので、
         *     この計器を会場側へ配線すると匿名の保有が全ゼロに見える
         *     ([[measure-the-region-you-claim-2026-08-10]])。①POP専用。
         */
        rawNickname: p?.entry?.nickname,
        avatarObserved: p?.entry?.avatarObserved
      }))
    );
  } catch {
    return null;
  }
}

/**
 * 速報の行を作る。
 * ★分母を必ず明示する(「取れるはずの人」基準であることを読み手に隠さない)。
 *
 * @param {ReturnType<typeof countIdentityAcquisition>|null|undefined} c
 * @returns {string}
 */
export function formatIdentityAcquisitionLine(c) {
  if (!c || typeof c !== 'object') return '';
  const total = Math.max(0, Math.floor(Number(c.total) || 0));
  if (total <= 0) {
    return '本人情報の取得 ⚪ 未観測(レーンに誰も出ていません)';
  }
  const ident = Math.max(0, Math.floor(Number(c.identifiable) || 0));
  const anon = Math.max(0, Math.floor(Number(c.anonymous) || 0));
  const aThumb = Math.max(0, Math.floor(Number(c.anonWithThumb) || 0));
  const aName = Math.max(0, Math.floor(Number(c.anonWithName) || 0));
  /*
   * ★v1(2026-08-17): 匿名の保有を必ず併記する。
   *   旧実装は「匿名=対象外(仕様)」としか書かず、匿名が実際にサムネや名前を
   *   持っていても【誰にも見えなかった】。実機で匿名に個人サムネと表示名が
   *   出ていることが確認され、前提そのものが誤りだったと判明した。
   */
  const anonHold =
    anon > 0
      ? `\n  → 匿名${anon}人のうち サムネ観測${aThumb}人 / 本人名${aName}人` +
        (aThumb > 0 || aName > 0
          ? '(★取れています。現行の段分けではたぬ姉段のままです)'
          : '(いまは0人)')
      : '';
  const shortId = Math.max(0, Math.floor(Number(c.shortNumericId) || 0));
  const shortNote =
    shortId > 0
      ? `\n  → ★1〜4桁の数値ID${shortId}人を匿名扱いしています(初期ユーザーの既知の誤差)`
      : '';
  if (ident <= 0) {
    /*
     * ★全員匿名でも「異常」ではない(ここは維持)。
     *   ただし旧文言「数値IDもサムネも仕様上ありません」は【誤り】だったので消した。
     *   匿名でもサムネ・名前は取れることがある(上の anonHold が実数で示す)。
     */
    return `本人情報の取得 ⚪ 数値IDの人がいません(${total}人すべて匿名)${anonHold}${shortNote}`;
  }
  const mark = c.allPercent >= 80 ? '✅' : c.allPercent >= 50 ? '🟡' : '🔴';
  const anonNote = anon > 0 ? ` / 匿名${anon}人は分母外` : '';
  const guessed = Math.max(0, Math.floor(Number(c.guessedThumb) || 0));

  /*
   * ★実機(2026-08-12)で「サムネ0% なのに画面にはアイコンが出ている」という
   *   一見矛盾する状態が出た。実態は【IDから式で組んだ推測URLを表示している】。
   *   同じ速報に `アイコン画像が1件読み込めていません(.../142381212.jpg)` が出ており、
   *   推測URLが 404 になりうることが実証されていた。
   *   ★この事情を書かないと「計器が壊れている」と誤読される=誤誘導は価値が負
   *     ([[instrument-value-is-measured-by-fixes-2026-08-12]])。
   */
  const guessNote =
    guessed > 0
      ? `\n  → うち${guessed}人は【IDから組んだ推測URL】を表示中です` +
        '(実在未確認=404で欠けることがあります。画面に絵が出ていても「取れた」ではありません)'
      : '';
  const detail =
    c.missingThumb > 0 || c.missingName > 0
      ? `\n  → 未取得: サムネ${c.missingThumb}人 / 名前${c.missingName}人` +
        '(数値IDはあるのに取れていない=取得経路を疑う)'
      : `\n  → 対象${ident}人は3点セットがそろっています(★匿名を除いた数です)`;
  /*
   * ★v1: 実稼働の率(画面の全員が分母)を必ず併記する。
   *   実機は 55人中51人が匿名で、同じ状態が【100%】とも【7.3%】とも書けた。
   *   期待値だけを出すと「ほぼ完璧に取れている」と誤読される。
   */
  const overall =
    `\n  → 実稼働: サムネ${c.overallThumbPercent}% / 名前${c.overallNamePercent}%` +
    ` / 両方${c.overallAllPercent}% (画面の全${total}人が分母)`;
  return (
    `本人情報の取得 ${mark} サムネ${c.thumbPercent}% / 名前${c.namePercent}% / 両方${c.allPercent}%` +
    ` (期待値: 対象${ident}人${anonNote})${detail}${overall}${anonHold}${shortNote}${guessNote}`
  );
}
