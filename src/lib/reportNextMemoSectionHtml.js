// reportNextMemoSectionHtml.js
// v0.1.811(星野ロミ式コンポーネント化・第4弾): popup-entry.js の buildHtmlReportDocument 内
//   「次枠メモ」セクションの【純粋な HTML 組み立て部】を抽出(挙動完全不変)。
//   正本=council/hoshinoromi-componentize-factor-SYNTHESIS.md。
//
// 巨大関数本体に残すもの(entry側): memo の算出(await chrome.storage.get / aggregateMarketingReport /
//   buildReportMemoPayload)とアバター HTML の生成。ここ(lib)は『memo + アバター文字列 → HTML 文字列』
//   だけの純関数。依存は escapeHtml の既存 lib のみ=罠ゼロ。

import { escapeHtml } from './htmlEscape.js';

/**
 * @typedef {{ nextMemos: string[], highlights: { atLabel: string, reason: string, sampleLine: string }[],
 *   thanksPoints: string[], templates: string[] }} ReportMemoPayload
 */

/**
 * 「りんく・こん太・たぬ姉の次枠メモ」セクション HTML を組み立てる(純関数)。
 * @param {ReportMemoPayload} memo buildReportMemoPayload の戻り
 * @param {{ avatarLink?: string, avatarKonta?: string, avatarTanu?: string }} [avatars] 既に生成済みのアバター HTML 断片
 * @returns {string}
 */
export function buildReportNextMemoSectionHtml(memo, avatars = {}) {
  const m = /** @type {any} */ (memo) || {};
  const nextMemos = Array.isArray(m.nextMemos) ? m.nextMemos : [];
  const highlights = Array.isArray(m.highlights) ? m.highlights : [];
  const thanksPoints = Array.isArray(m.thanksPoints) ? m.thanksPoints : [];
  const templates = Array.isArray(m.templates) ? m.templates : [];
  const avatarLink = String(avatars.avatarLink || '');
  const avatarKonta = String(avatars.avatarKonta || '');
  const avatarTanu = String(avatars.avatarTanu || '');

  const memLis =
    nextMemos.length > 0
      ? nextMemos.map((/** @type {string} */ x) => `<li>${escapeHtml(x)}</li>`).join('')
      : '<li>（まだ十分なメモが出ません）</li>';
  const hiLis =
    highlights.length > 0
      ? highlights
          .map(
            (/** @type {any} */ h) =>
              `<li><strong>${escapeHtml(h.atLabel)}</strong> — ${escapeHtml(h.reason)}<br><span class="memo-sample">${escapeHtml(h.sampleLine)}</span></li>`
          )
          .join('')
      : '<li>（この枠では目立つ場面の抽出がまだ少ないです）</li>';
  const thLis =
    thanksPoints.length > 0
      ? thanksPoints.map((/** @type {string} */ t) => `<li>${escapeHtml(t)}</li>`).join('')
      : '<li>（記録が増えるとここが埋まります）</li>';
  const tplLis =
    templates.length > 0
      ? templates.map((/** @type {string} */ t) => `<li>${escapeHtml(t)}</li>`).join('')
      : '<li>（テンプレはマーケ分析の「りんく達の作戦会議」も参照）</li>';
  const dynamicNote = 'この内容は今回の配信データから組み立てています。配信内容によって毎回変わります。';
  const trioGuideHtml = `
        <div class="yukkuri-guide memo-yukkuri-guide" role="note" aria-label="りんく・こん太・たぬ姉の次枠ガイド">
          <div class="yukkuri-row">
            ${avatarLink}
            <div class="speech-bubble">
              <strong>りんくより</strong>
              <p>次の枠で試しやすい順に、まずはやってみる作戦をまとめたよ。1つだけでも十分なのだ。</p>
            </div>
          </div>
          <div class="yukkuri-row">
            ${avatarKonta}
            <div class="speech-bubble">
              <strong>こん太より</strong>
              <p>リスナーが参加しやすかった流れを拾ってるよ。声かけやお礼の言葉に使うと、空気があたたまりやすいのだ。</p>
            </div>
          </div>
          <div class="yukkuri-row">
            ${avatarTanu}
            <div class="speech-bubble">
              <strong>たぬ姉より</strong>
              <p>${escapeHtml(dynamicNote)}</p>
            </div>
          </div>
        </div>`;
  return `
      <section class="card yukkuri-guide-card" id="sec-next-memo" style="margin-top:12px;">
        <h2>りんく・こん太・たぬ姉の次枠メモ</h2>
        <p class="guide-lead">詳しい分析より先に、次の配信で試せる短い作戦をまとめたのだ。</p>
        ${trioGuideHtml}
        <h3>次の配信で試したいこと（最大3）</h3>
        <ol>${memLis}</ol>
        <h3>盛り上がった場面（最大3）</h3>
        <ul>${hiLis}</ul>
        <h3>ありがとうポイント</h3>
        <ul>${thLis}</ul>
        <h3>次の配信で使える一言テンプレ</h3>
        <ul>${tplLis}</ul>
      </section>`;
}
