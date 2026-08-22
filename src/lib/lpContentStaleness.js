/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】LPの「掲載内容」が何版ぶん止まっているかの判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】LP本文の鮮度判定はこのファイルのみ
 *
 * lpContentStaleness.js — ★LPの【中身】が何版ぶん止まっているかを数える。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★なぜ要るか(2026-08-23 ユーザー指摘「LPにも全部反映されてますか？」)
 *
 *   ★実測すると、LPはこうなっていた:
 *     版数表記(4箇所)      … v0.1.1479 ✅ 完全に一致
 *     本文(機能説明)の最新 … ★v0.1.1237
 *   ⟹ ★242版ぶん、中身が載っていなかった。
 *
 *   ★LPを触った直近40コミットが【すべて4行だけ】の変更だった。
 *   4行＝verify-bump [6] が見ている版数4箇所ちょうど。
 *   ＝ ★機械が見ている所だけが動き、見ていない所は一度も動かなかった。
 *
 * ■ ★これは「ゲートが正しく、守備範囲が狭い」型
 *   verify-bump [6] には設計意図としてこう書いてある:
 *     「版数表記は常に追従・★掲載内容は選別」
 *   ★方針は正しい(計器だけの版をLPに載せる必要はない)。
 *   ★壊れたのは「選別する人がいなくなっても誰も気づかない」こと。
 *
 * ■ ★どう解くか(強制しない・気づけるようにする)
 *   「載せないと赤」にすると★【LPが計器の羅列になる】。
 *   ユーザーに関係のない版まで載せる動機を作ってしまう＝LPの価値が下がる。
 *   → ★何版ぶん止まっているかを数えて見せるだけにする。
 *
 *   ★[[improvement-staleness]] と同じ形。台帳で学んだことをLPに横展開したもの。
 *
 * ■ ★なぜ「載っていない版の数」でなく「最後に載った版からの距離」で測るか
 *   ★載せるべきでない版(計器・内部リファクタ)が大多数なので、
 *   「載っていない版の数」は常に大きくなり★意味を持たない(狼少年になる)。
 *   最後に載った版からの距離なら、★選別しても増えない。
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * ここを超えて本文が動いていなければ「止まっている」とみなす版数。
 *
 * ★60の根拠: このリポは1日に5〜8版出る。60版＝おおよそ10日〜2週間。
 *   ユーザーに見える変更が2週間まったく無いことは実績上ほぼ無い
 *   (直近6版のうち4版がユーザーに見える変更だった)。
 *   ★逆に242版(1ヶ月半)は明らかに異常＝この閾値なら確実に鳴っていた。
 */
export const LP_CONTENT_STALE_VERSIONS = 60;

/** @param {string} v @returns {number[]} */
function parseVersion(v) {
  return String(v || '')
    .split('.')
    .map((p) => Number(p))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

/**
 * 版の距離(何版ぶん離れているか)。
 * ★major/minor が違うときは patch 差で測れないので null(＝測れなかった)。
 *
 * @param {string} from @param {string} to
 * @returns {number|null}
 */
export function versionDistance(from, to) {
  const a = parseVersion(from);
  const b = parseVersion(to);
  if (a.length < 3 || b.length < 3) return null;
  if (a[0] !== b[0] || a[1] !== b[1]) return null;
  return Math.abs(b[2] - a[2]);
}

/**
 * LP本文から「掲載されている版」をすべて拾う。
 *
 * ★狙うのは本文の `（v0.1.1237）` `（v0.1.1232〜1237）` の形だけ。
 * ★メタ情報(meta/JSON-LD/フッター)の版数は【拾ってはいけない】。
 *   あれは verify-bump [6] が毎版必ず書き換えるので、
 *   ★拾うと常に最新になり、この検査は【恒真】になって死ぬ。
 *   ＝ [[comparison-needs-two-origins]]: 起点が同じものを比べても何も分からない。
 *
 * @param {string} html LPのHTML全文
 * @returns {string[]} 見つかった版(重複あり・出現順)
 */
export function extractBodyVersions(html) {
  // ★<meta> と <script>(JSON-LD) を先に取り除く。
  //   2026-08-23: meta description は「〜（v0.1.1479）。」と【全角カッコ】で版を書いており、
  //   ★verify-bump [6] が毎版必ず書き換える＝拾うと常に最新になり、この検査は恒真で死ぬ。
  //   ★実際に一度そうなった(「0版前」と出た)。本文は1479を1つも持っていなかった。
  const body = String(html || '')
    .replace(/<meta[^>]*>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const s = body;
  /** @type {string[]} */
  const found = [];
  // 全角カッコに囲まれた v0.1.x のみ。「〜」で範囲表記されるので後半も拾う。
  const re = /（v(\d+\.\d+\.\d+)(?:\s*[〜～]\s*(\d+))?）/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    found.push(m[1]);
    if (m[2]) {
      const head = m[1].split('.').slice(0, 2).join('.');
      found.push(`${head}.${m[2]}`);
    }
  }
  return found;
}

/**
 * @typedef {object} LpStalenessVerdict
 * @property {'fresh'|'stale'|'unknown'} state ★unknown と stale を混ぜない
 * @property {string} newestInBody 本文に載っている最新の版('' なら1つも無い)
 * @property {number|null} behind 何版ぶん止まっているか(測れなければ null)
 * @property {string} reason なぜその判定になったか
 */

/**
 * LP本文が何版ぶん止まっているかを判定する。
 *
 * @param {object} input
 * @param {string} input.html LPのHTML全文
 * @param {string} input.currentVersion package.json の版
 * @param {number} [input.staleAfter] 何版空いたら stale とするか
 * @returns {LpStalenessVerdict}
 */
export function judgeLpContentStaleness(input) {
  const current = String(input?.currentVersion || '');
  const staleAfter =
    typeof input?.staleAfter === 'number'
    && Number.isFinite(input.staleAfter)
    && input.staleAfter > 0
      ? input.staleAfter
      : LP_CONTENT_STALE_VERSIONS;

  if (!current) {
    // ★「いまの版が分からない」は「止まっていない」ではない
    return {
      state: 'unknown',
      newestInBody: '',
      behind: null,
      reason: '★いまの版が分かりません'
    };
  }

  const versions = extractBodyVersions(input?.html || '');
  if (versions.length === 0) {
    // ★本文に版表記が1つも無い＝表記の形が変わった可能性。
    //   「新しい」とは言えないので unknown(通してはいけない側)。
    return {
      state: 'unknown',
      newestInBody: '',
      behind: null,
      reason: '★本文に版の表記が1つも見つかりません(表記の形が変わった可能性)'
    };
  }

  let newest = '';
  let smallest = /** @type {number|null} */ (null);
  for (const v of versions) {
    const d = versionDistance(v, current);
    if (d === null) continue; // 体系が違う版は測れない＝無視
    if (smallest === null || d < smallest) {
      smallest = d;
      newest = v;
    }
  }

  if (smallest === null) {
    return {
      state: 'unknown',
      newestInBody: '',
      behind: null,
      reason: '★本文の版と現在の版が別の体系で、距離を測れません'
    };
  }

  if (smallest > staleAfter) {
    return {
      state: 'stale',
      newestInBody: newest,
      behind: smallest,
      reason: `★本文が ${smallest} 版ぶん止まっています(最後の掲載 v${newest})`
    };
  }

  return {
    state: 'fresh',
    newestInBody: newest,
    behind: smallest,
    reason: `本文の最終掲載は v${newest}(${smallest} 版前)`
  };
}

/**
 * 人が読む形にする。★数を見せるだけで、載せることは強制しない。
 *
 * @param {LpStalenessVerdict} verdict
 * @returns {string}
 */
export function formatLpStalenessLine(verdict) {
  const v = verdict || /** @type {LpStalenessVerdict} */ ({});
  if (v.state === 'fresh') return `LP本文の鮮度: ${v.reason} ✅`;
  if (v.state === 'stale') {
    return [
      `LP本文の鮮度: ${v.reason}`,
      '  🟡 ユーザーに見える変更が載っていないかもしれません。',
      '  ★載せるべきでない版(計器・内部リファクタ)なら、載せなくて構いません。',
      '    この検査は数を見せるだけで、載せることを強制しません。'
    ].join('\n');
  }
  return `LP本文の鮮度: ★判定できませんでした — ${v.reason}`;
}
