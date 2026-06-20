/**
 * changelogConsistency.js — 版番号の三者一致を機械照合する純関数(v0.1.835)。
 *
 * 背景(self-verifying loop の取り込み): 既存 changelog.test.js は changelog 先頭 ↔ manifest を
 * 照合するが、package.json は見ていない。verify-bump.mjs は manifest の version 形式しか見ない。
 * よって「changelog/manifest/package のどれか1つだけ bump し忘れ」を verify:cc が捕まえられない隙間が
 * あった。本純関数で三者一致+先頭エントリの体裁(date/summary≤35/items非空)を照合し、verify-bump 経由で
 * verify:cc の必須経路に乗せる(テストは test を回さないと気づかないが :check は verify:cc で必ず落ちる)。
 *
 * 「ソースに突き合わせて自分のミスを捕まえる」機械ゲート=検証可能な事実のみ扱う(意味照合はしない)。
 * 設計正本=council/self-verifying-loop-SYNTHESIS.md。副作用なし(I-O は呼び出し側 verify-bump.mjs)。
 */

/** summary の最大長(popup の summary 行で省略しないため・changelog.test.js と同値)。 */
export const CHANGELOG_SUMMARY_MAX = 35;

/**
 * @typedef {{ version?: unknown, date?: unknown, summary?: unknown, items?: unknown }} ChangelogEntryLike
 * @typedef {{
 *   changelogVersion: string|null|undefined,
 *   manifestVersion: string|null|undefined,
 *   packageVersion: string|null|undefined,
 *   headEntry: ChangelogEntryLike|null|undefined
 * }} ConsistencyInput
 */

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 三者一致+先頭エントリ体裁を照合し、違反メッセージ配列を返す(空=OK)。
 * @param {ConsistencyInput} input
 * @returns {string[]} violations
 */
export function checkChangelogConsistency(input) {
  /** @type {string[]} */
  const violations = [];
  if (!input || typeof input !== 'object') {
    return ['入力がオブジェクトでない'];
  }
  const { changelogVersion, manifestVersion, packageVersion, headEntry } = input;

  // version は3つとも semver 文字列であること。
  const trio = [
    ['changelog', changelogVersion],
    ['manifest', manifestVersion],
    ['package', packageVersion]
  ];
  for (const [name, v] of trio) {
    if (typeof v !== 'string' || !SEMVER_RE.test(v)) {
      violations.push(`${name} version が不正な semver: ${String(v)}`);
    }
  }
  // 形式が揃っていれば三者一致を照合(揃っていない時点では一致照合してもノイズなので skip)。
  if (
    typeof changelogVersion === 'string' &&
    typeof manifestVersion === 'string' &&
    typeof packageVersion === 'string' &&
    SEMVER_RE.test(changelogVersion) &&
    SEMVER_RE.test(manifestVersion) &&
    SEMVER_RE.test(packageVersion)
  ) {
    if (
      !(changelogVersion === manifestVersion && manifestVersion === packageVersion)
    ) {
      violations.push(
        `版番号の三者不一致: changelog=${changelogVersion} / manifest=${manifestVersion} / package=${packageVersion}（3つを揃えてください）`
      );
    }
  }

  // 先頭エントリの体裁。
  if (!headEntry || typeof headEntry !== 'object') {
    violations.push('changelog 先頭エントリが無い');
    return violations;
  }
  if (typeof headEntry.date !== 'string' || !DATE_RE.test(headEntry.date)) {
    violations.push(`先頭エントリの date が YYYY-MM-DD でない: ${String(headEntry.date)}`);
  }
  if (typeof headEntry.summary !== 'string' || headEntry.summary.length === 0) {
    violations.push('先頭エントリの summary が空');
  } else if (headEntry.summary.length > CHANGELOG_SUMMARY_MAX) {
    violations.push(
      `先頭エントリの summary が長い(${headEntry.summary.length} 字 > ${CHANGELOG_SUMMARY_MAX}): ${headEntry.summary}`
    );
  }
  if (!Array.isArray(headEntry.items) || headEntry.items.length === 0) {
    violations.push('先頭エントリの items が空');
  }
  return violations;
}
