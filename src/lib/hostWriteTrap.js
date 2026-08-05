/**
 * 「誰が host に display:none を書いたか」を同期で捕らえた結果を集計する純関数群。
 * DOM も window も触らない(トラップ本体は page-intercept-entry.js 側)。
 *
 * ★v0.1.1268 の動機(2026-08-05・4日17版の空振りを経て):
 *   MutationObserver では犯人が特定できないと確定した(コールバックは非同期に配信され、
 *   書き手は既にスタックから消えている・MDN)。実際 v0.1.1267 の速報に出た
 *   「書き換えた場所: at MutationObserver.<anonymous>」は【計器自身の座標】で無価値だった。
 *   → style の setter を差し替え、【書いた瞬間に同期で】スタックを採る方式へ切り替える。
 *
 * ■ 実証済みの前提(chrome-devtools MCP で実ページ検証・2026-08-05)
 *   host.style.display はインスタンス側のデータプロパティ(writable/configurable: true)で、
 *   アクセサに差し替えると呼び出し元の関数名まで採れる。値も正しく適用され描画に影響しない。
 *   setProperty / setAttribute 経由も own property の shadow で捕獲できる。
 *
 * ■ ★world 境界(最重要・これを外すと永遠に 0 になる)
 *   content script は isolated world で動き、DOM は共有でも【JSラッパーは world ごとに別】。
 *   よってトラップは MAIN world(page-intercept-entry.js)に置く必要がある。
 *   副産物: 拡張自身(isolated)の書き込みは物理的にトラップを通らないので、
 *   【自分を犯人と誤報する経路が原理的に無い】。
 *
 * ■ 0 の意味を必ず三分岐にする([[zero-count-may-mean-unmeasured-2026-08-04]])
 *   ⚪未装着 / ✅装着済みで0回 / ⚠捕獲あり。この区別が無いと、また「0=異常なし」と誤読する。
 */

/** 速報を膨らませないためのサンプル上限。 */
export const TRAP_SAMPLE_MAX = 4;

/**
 * @typedef {{
 *   armed: boolean|null,
 *   armReason: string,
 *   reached: boolean,
 *   reachedInfo: string,
 *   counts: { prop: number, setProperty: number, cssText: number, setAttribute: number },
 *   noneWrites: number,
 *   samples: Array<{ route: string, valueHead: string, frames: string[], t: number }>
 * }} HostWriteTrapState
 */

/** @returns {HostWriteTrapState} */
export function createHostWriteTrapState() {
  return {
    // ★null = まだ装着結果の報告を受け取っていない(=未計測)。false とは意味が違う。
    armed: null,
    armReason: '',
    // ★v0.1.1270: MAIN world のトラップコードに到達したか(合図とは独立の土台)。
    reached: false,
    reachedInfo: '',
    counts: { prop: 0, setProperty: 0, cssText: 0, setAttribute: 0 },
    noneWrites: 0,
    samples: []
  };
}

/**
 * トラップの装着結果を記録する。★0 と未計測を区別するために必須。
 * @param {HostWriteTrapState} state
 * @param {boolean} ok
 * @param {string} [reason] 失敗理由(装着できなかったときだけ意味がある)
 */
export function noteHostWriteTrapArmed(state, ok, reason) {
  if (!state || typeof state !== 'object') return;
  const r = String(reason || '');
  /*
   * ★v0.1.1270: 「トラップのコードに到達した」報告は、あとから来る装着報告に
   *   上書きさせない。到達したか否かは切り分けの土台なので、消えると
   *   「合図が悪いのか、そもそも走っていないのか」がまた分からなくなる。
   */
  if (r.startsWith('reached(')) {
    state.reached = true;
    state.reachedInfo = r;
    // armed 自体はまだ確定していない(装着の成否はこの後の報告で決まる)。
    return;
  }
  state.armed = ok === true;
  state.armReason = r;
}

/**
 * MAIN world から届いた捕獲レポートを合算する。
 * @param {HostWriteTrapState} state
 * @param {{ counts?: object, noneWrites?: unknown, newSamples?: unknown }} detail
 */
export function noteHostWriteTrapReport(state, detail) {
  if (!state || typeof state !== 'object' || !detail || typeof detail !== 'object') return;
  const c = detail.counts && typeof detail.counts === 'object' ? detail.counts : {};
  for (const k of ['prop', 'setProperty', 'cssText', 'setAttribute']) {
    const v = Number(c[/** @type {keyof typeof c} */ (k)]);
    if (Number.isFinite(v) && v > 0) state.counts[/** @type {'prop'} */ (k)] += v;
  }
  const nw = Number(detail.noneWrites);
  if (Number.isFinite(nw) && nw > 0) state.noneWrites += nw;
  const list = Array.isArray(detail.newSamples) ? detail.newSamples : [];
  for (const s of list) {
    if (state.samples.length >= TRAP_SAMPLE_MAX) break;
    if (!s || typeof s !== 'object') continue;
    state.samples.push({
      route: String(s.route || ''),
      valueHead: String(s.valueHead || '').slice(0, 80),
      frames: (Array.isArray(s.frames) ? s.frames : [])
        .slice(0, 3)
        .map(/** @param {unknown} f */ (f) => String(f).slice(0, 160)),
      t: Number(s.t) || 0
    });
  }
}

/**
 * スタックの各行から「犯人」の1行を選ぶ。
 *
 * ★自拡張のフレームとトラップ自身のフレームは飛ばす。
 *   トラップは自拡張のコードなので、素直に先頭を取ると必ず自分を指してしまう。
 *
 * @param {unknown} frames スタックの行の配列
 * @param {unknown} ownExtensionOrigin 例: 'chrome-extension://abcdef/'
 * @returns {string} 犯人と思われる1行(見つからなければ '')
 */
export function pickCulpritFrame(frames, ownExtensionOrigin) {
  const list = (Array.isArray(frames) ? frames : []).map((f) => String(f || ''));
  const own = String(ownExtensionOrigin || '');
  for (const f of list) {
    if (!f.trim()) continue;
    // Error() を作った行そのもの(トラップ内)は犯人ではない。
    if (f.includes('installHostDisplayWriteTrap')) continue;
    if (f.includes('hostWriteTrap')) continue;
    if (own && f.includes(own)) continue;
    return f.trim();
  }
  // 全部が自拡張/トラップだった場合は、先頭を返して「自拡張」と分類させる
  // (起きないはずだが、起きたときに黙って '' にすると原因が消える)。
  return list.find((f) => f.trim()) ? String(list.find((f) => f.trim())).trim() : '';
}

/**
 * 犯人フレームの URL から出所を分類する。
 * @param {unknown} url
 * @param {unknown} ownOrigin
 * @returns {'page'|'other-extension'|'own-extension'|'unknown'}
 */
export function classifyCulpritUrl(url, ownOrigin) {
  const s = String(url || '');
  if (!s) return 'unknown';
  const own = String(ownOrigin || '');
  if (own && s.includes(own)) return 'own-extension';
  if (s.includes('chrome-extension://')) return 'other-extension';
  if (s.includes('http://') || s.includes('https://')) return 'page';
  return 'unknown';
}

/**
 * 速報用スナップショット。
 * @param {HostWriteTrapState|null|undefined} state
 * @param {string} [ownOrigin] 自拡張の origin(分類に使う)
 */
export function snapshotHostWriteTrap(state, ownOrigin) {
  const s = state && typeof state === 'object' ? state : null;
  if (!s) return null;
  const samples = Array.isArray(s.samples) ? s.samples.slice(0, TRAP_SAMPLE_MAX) : [];
  const first = samples[0] || null;
  const culprit = first ? pickCulpritFrame(first.frames, ownOrigin) : '';
  return {
    armed: s.armed,
    armReason: String(s.armReason || ''),
    reached: s.reached === true,
    reachedInfo: String(s.reachedInfo || ''),
    counts: { ...s.counts },
    noneWrites: Number(s.noneWrites) || 0,
    samples,
    culprit,
    culpritKind: culprit ? classifyCulpritUrl(culprit, ownOrigin) : 'unknown'
  };
}

/**
 * 分類タグを日本語に。
 * @param {string} kind
 */
function kindLabel(kind) {
  if (kind === 'page') return 'ページ';
  if (kind === 'other-extension') return '別の拡張';
  if (kind === 'own-extension') return '★この拡張自身(計器矛盾)';
  return '不明';
}

/**
 * 状態速報の行。★0 の意味を三分岐で言い切る。
 * @param {ReturnType<typeof snapshotHostWriteTrap>} snap
 * @returns {string}
 */
export function formatHostWriteTrapLine(snap) {
  const s = snap && typeof snap === 'object' ? snap : null;
  if (!s) return '';
  // (1) 未装着 = 測っていない。0回と決して混同しない。
  if (s.armed !== true) {
    const why = s.armReason ? `:${s.armReason}` : '';
    const head = s.armed === null ? 'arm未受信' : `装着失敗${why}`;
    /*
     * ★v0.1.1270: 「到達したか」を必ず併記する。ここが切り分けの分岐点:
     *   到達✅ + 未装着 → 合図/host探索の問題(拡張内で直せる)
     *   到達なし        → MAIN world のコードが視聴ページで走っていない(仕込む場所が違う)
     * 2版続けて armed:null のまま原因が絞れなかったのは、この区別が無かったため。
     */
    const reach = s.reached
      ? `到達✅ ${s.reachedInfo}`
      : '★到達なし(MAIN worldのコードが動いていません)';
    return `犯人トラップ ⚪ 未装着(${head})\n  ${reach}`;
  }
  // (2) 装着済みで0回 = 「ページではない」という積極的な情報。
  if (s.noneWrites <= 0) {
    return (
      '犯人トラップ ✅ 装着済み・外部からの display:none 書き込み0回\n' +
      '  → 消失が続くなら書き手はページではありません(別の拡張かブラウザ内部)。' +
      '次は他の拡張を全部オフにして1配信お試しください'
    );
  }
  // (3) 捕獲あり = 犯人を名指しする。
  const routes = Object.entries(s.counts)
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => `${k}:${v}`)
    .join(' / ');
  const lines = [
    `犯人トラップ ⚠ 外部が display:none を${s.noneWrites}回書きました(経路: ${routes || '-'})`
  ];
  if (s.culprit) {
    lines.push(`  ★犯人: ${s.culprit} [分類:${kindLabel(s.culpritKind)}]`);
  }
  const first = Array.isArray(s.samples) ? s.samples[0] : null;
  if (first && first.valueHead) {
    lines.push(`  書込値: "${first.valueHead}"`);
  }
  return lines.join('\n');
}
