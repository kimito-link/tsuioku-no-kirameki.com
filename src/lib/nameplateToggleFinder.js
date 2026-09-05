/**
 * nameplateToggleFinder.js — ニコ生公式の「なふだを表示」トグルを見つける(純関数)。
 *
 * ★なぜ要るか(2026-08-14 ユーザー要望)
 *   「公式のこれも POPで操作できるようにしたい」
 *   = 公式のコメント欄設定にある **「なふだを表示」** の ON/OFF を、
 *     わざわざ公式UIを開かずに①POPから切り替えたい。
 *
 * ■ 「なふだ」とは(公式の説明文そのまま)
 *   「ONにすると放送者のみにあなたのアイコンやニックネームが表示されます」
 *   ＝**視聴者側の設定**。この拡張の中心である「誰が来たか」に直結する
 *     (なふだOFFの人は、放送者から見て匿名に近くなる)。
 *
 * ■ なぜ「探し方」を別モジュールにするか
 *   公式DOMは予告なく変わる。セレクタを content-entry.js に直書きすると、
 *   壊れたときに**実ブラウザでしか確認できない**。ここに切り出して
 *   HTML断片でテストできるようにする=壊れた瞬間にテストが赤くなる。
 *   ★[[verify-on-shipped-bundle-2026-08-07]] と同じ思想(公式依存を検査可能にする)。
 *
 * ■ 探し方の優先順位(壊れにくい順)
 *   1. ラベル文言「なふだ」を含む行の中の input[type=checkbox] / role=switch
 *   2. aria-label に「なふだ」を含む要素
 *   ★class 名は使わない(公式のハッシュ付きclassは毎ビルド変わる)。
 *   ★**文言で探す**のが最も長持ちする(表示文言はユーザーに見える=簡単には変えない)。
 *
 * @module nameplateToggleFinder
 */

/** 「なふだ」設定を指す文言(公式の表記ゆれに備える)。 */
const NAMEPLATE_WORDS = Object.freeze(['なふだ', '名札']);

/**
 * 要素のテキストに「なふだ」が含まれるか。
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeNameplateLabel(text) {
  const t = String(text || '');
  return NAMEPLATE_WORDS.some((w) => t.includes(w));
}

/**
 * トグル本体(checkbox / switch)を、与えられたコンテナから探す。
 *
 * @param {any} root document 相当(querySelectorAll を持つもの)
 * @returns {any|null} 見つかった要素(input か role=switch)。無ければ null。
 */
export function findNameplateToggle(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return null;

  // ── 経路1: aria-label に「なふだ」(最も確実・あれば一発) ──────────
  try {
    const labeled = root.querySelectorAll('[aria-label]');
    for (const el of labeled) {
      if (!looksLikeNameplateLabel(el.getAttribute('aria-label'))) continue;
      const hit = toggleWithin(el) || (isToggle(el) ? el : null);
      if (hit) return hit;
    }
  } catch {
    /* 続行 */
  }

  // ── 経路2: 「なふだ」を含む行の中のトグル ─────────────────────
  //   公式は「ラベル文言」と「トグル」が同じ行(親)に並ぶ作り。
  try {
    const all = root.querySelectorAll('label, li, div, section');
    for (const el of all) {
      // ★textContent は子孫を全部含むので、巨大な祖先が誤ヒットする。
      //   「自分の直下テキスト」に近い短い要素だけを見る(誤爆防止)。
      const text = String(el.textContent || '');
      if (text.length > 200) continue;
      if (!looksLikeNameplateLabel(text)) continue;
      const hit = toggleWithin(el);
      if (hit) return hit;
    }
  } catch {
    /* 続行 */
  }
  return null;
}

/**
 * その要素が ON/OFF を持つトグルか。
 * @param {any} el
 * @returns {boolean}
 */
export function isToggle(el) {
  if (!el || typeof el.getAttribute !== 'function') return false;
  const tag = String(el.tagName || '').toLowerCase();
  const type = String(el.getAttribute('type') || '').toLowerCase();
  if (tag === 'input' && type === 'checkbox') return true;
  const role = String(el.getAttribute('role') || '').toLowerCase();
  return role === 'switch' || role === 'checkbox';
}

/**
 * 子孫からトグルを1つ取る。
 * @param {any} el
 * @returns {any|null}
 */
function toggleWithin(el) {
  if (!el || typeof el.querySelectorAll !== 'function') return null;
  const cands = el.querySelectorAll('input[type="checkbox"], [role="switch"], [role="checkbox"]');
  return cands && cands.length > 0 ? cands[0] : null;
}

/**
 * いまONか(判定できなければ null=不明。false と混同しない)。
 *
 * ★不明を false にすると「OFFだと思って押す」→ 実は ON で**逆に消す**事故になる。
 *
 * @param {any} el
 * @returns {boolean|null}
 */
export function readToggleState(el) {
  if (!el) return null;
  try {
    if (typeof el.checked === 'boolean') return el.checked;
    const aria = el.getAttribute && el.getAttribute('aria-checked');
    if (aria === 'true') return true;
    if (aria === 'false') return false;
  } catch {
    /* 不明 */
  }
  return null;
}

/**
 * 目的の状態にするために「押すべきか」を判定する。
 *
 * @param {boolean|null} current 現在(null=不明)
 * @param {boolean} want 目的
 * @returns {{ shouldClick: boolean, reason: string }}
 */
export function decideNameplateClick(current, want) {
  if (current === null) {
    // ★不明なら押さない。逆方向に切り替える事故の方が高くつく。
    return { shouldClick: false, reason: 'unknown-state' };
  }
  if (current === want) return { shouldClick: false, reason: 'already' };
  return { shouldClick: true, reason: 'toggle' };
}
