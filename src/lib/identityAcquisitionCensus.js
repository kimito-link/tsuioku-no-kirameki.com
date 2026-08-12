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
 *   missingName: number
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

  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    total += 1;
    const uid = raw.userId;
    if (!hasNumericUserId(uid)) {
      // ★匿名・ID無しは「取れるはずが無い」側。失敗に数えない。
      if (isAnonymousStyleNicoUserId(uid)) anonymous += 1;
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
    missingName: Math.max(0, identifiable - withName)
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
        thumbScore: p?.thumbScore
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
  if (ident <= 0) {
    /*
     * ★全員匿名でも「異常」ではない。仕様上ここに数値IDは存在しない。
     *   赤くすると読んでも直せない計器になる。
     */
    return `本人情報の取得 ⚪ 対象なし(${total}人すべて匿名=数値IDもサムネも仕様上ありません)`;
  }
  const mark = c.allPercent >= 80 ? '✅' : c.allPercent >= 50 ? '🟡' : '🔴';
  const anonNote = anon > 0 ? ` / 匿名${anon}人は対象外(仕様)` : '';
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
      : '\n  → 3点セットが全員そろっています';
  return (
    `本人情報の取得 ${mark} サムネ${c.thumbPercent}% / 名前${c.namePercent}% / 両方${c.allPercent}%` +
    ` (対象${ident}人${anonNote})${detail}${guessNote}`
  );
}
