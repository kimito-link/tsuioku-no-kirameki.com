/**
 * v0.1.1741: スマホの WEB版で「押しても黙って何も起きない」拡張専用のボタンを片付ける。
 *
 * ■ なぜ
 *   WEB版は本物の popup をそのまま動かし、拡張の機能(chrome.windows・chrome.tabs など)は空っぽの代わりを入れている。
 *   そのため、別窓を開く・PC のタブを操作する・PC の拡張の設定を変えるボタンは、エラーも出さずに何もしない。
 *   Android 実機で全ボタンを押して確かめた(2026-10-22・60個中12個が無反応、設定スイッチ約18個は見た目だけ変わる)。
 * ■ やること
 *   1. 拡張でしか働かないボタン・設定・開発用の欄を隠す(CSS だけ。popup 本体は変えない)。
 *   2. 応援者アイコンを押したら、その人のニコニコのページを開く。
 *      popup は「コメビュの詳細を別窓で開く」ために既定のリンク動作を止めている(wireLaneUserDetailOpen.js)が、
 *      スマホでは別窓が開けない=何も起きなかった。スマホでは popup の処理まで届かせず、リンクのまま開く。
 *
 * @module live-view-phone-fit
 */

/** スマホでは働かない(拡張の別窓・PC のタブ・PC の拡張の設定が前提)ものの選び方。 */
export const PHONE_HIDDEN_SELECTORS = Object.freeze([
  '#exportJson', // 💾 HTML保存(拡張のダウンロード)
  '#exportMarketingQuickBtn', // 📊 マーケ(拡張の別タブ)
  '#exportMediaKitBtn', // 📣 メディアキット(拡張の別タブ)
  '#captureScreenshot', // 📷 スクショ(PC の放送タブを撮る)
  '#reloadWatchTabBtn', // ↻ 再読み込み(PC の放送タブ)
  '#openComeviewBtn', // 💬 コメビュ(拡張の別窓)
  '#nlPlacementQuickbar', // パネル位置(PC の放送ページ上のパネル)
  '#nlPlacementQuickHint',
  '#nlPopupSettings', // 詳細設定(PC の拡張の設定=スマホで変えても届かない)
  '#devMonitorDetails', // 詳しい状況(開発・切り分け用)
  '#supportVisualCountToggle', // 応援数の切り替え(PC の画面の設定)
  '#storyGrowthCollapseBtn' // アイコン列を隠す(PC の画面の設定)
]);

/** 応援者アイコンの押下を popup の「別窓で開く」処理へ届かせない(リンクとして開く)。 @param {Event} ev */
export function keepLaneCellAsLink(ev) {
  const t = ev.target instanceof Element ? ev.target : null;
  const cell = t ? t.closest('a.nl-story-userlane-cell[href]') : null;
  if (!cell) return false;
  ev.stopPropagation(); // 既定の動作(リンクを開く)は止めない
  return true;
}

export function mountPhoneFit() {
  if (document.getElementById('lvWebPhoneFitStyle')) return;
  const style = document.createElement('style');
  style.id = 'lvWebPhoneFitStyle';
  style.textContent = `${PHONE_HIDDEN_SELECTORS.join(',')}{display:none!important}`;
  document.head.appendChild(style);
  // window の捕捉段階=document に付いた popup の処理より先に受け取る。
  window.addEventListener('click', keepLaneCellAsLink, true);
}
