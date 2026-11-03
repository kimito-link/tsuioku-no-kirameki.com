// build-youtube-sidepanel-html.mjs — YouTube 版のサイドパネル HTML を、ニコ生版 popup.html から丸ごと写して作る。
//
// ★りんく「全然完コピじゃないので一旦ソースをごっそり写してから変えたほうがいい」(2026-11-03)。
//   見た目を自分で組み直すと必ずズレるので、extension/popup.html の <head>(CSS 全部)と <body> を
//   そのまま持ってきて、YouTube で使わない部品だけを抜き、言葉だけを YouTube 向けに差し替える。
//   YouTube だけにある部品(配信の選択・読み上げ設定・コメビュ3レーン)は
//   extension-youtube/src/sidepanel-yt-parts.html に置き、決まった場所へ差し込む。
//
// 使い方: node scripts/build-youtube-sidepanel-html.mjs
//   出力: extension-youtube/sidepanel.html(生成物・直接直さない)
//   ニコ生版の画面が変わったら、もう一度走らせるだけで YouTube 版も追いつく。

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const NICO_POPUP = resolve(root, 'extension/popup.html');
const YT_PARTS = resolve(root, 'extension-youtube/src/sidepanel-yt-parts.html');
const OUT = resolve(root, 'extension-youtube/sidepanel.html');

const src = readFileSync(NICO_POPUP, 'utf8');
const parts = readFileSync(YT_PARTS, 'utf8');

/** @param {string} name */
function part(name) {
  const open = `<!-- part:${name} -->`;
  const close = `<!-- /part:${name} -->`;
  const a = parts.indexOf(open);
  const b = parts.indexOf(close);
  if (a < 0 || b < 0) throw new Error(`sidepanel-yt-parts.html に part:${name} がありません`);
  return parts.slice(a + open.length, b);
}

// ---- <head>: CSS はニコ生版を 1 文字も変えずに使う。スクリプトだけ外す ----
const headEnd = src.indexOf('</head>');
const bodyOpen = src.indexOf('<body>');
const bodyClose = src.lastIndexOf('</body>');
if (headEnd < 0 || bodyOpen < 0 || bodyClose < 0) throw new Error('popup.html の形が想定と違います');
let head = src.slice(0, headEnd);
head = head.replace(/\s*<script src="dist\/cloak-failsafe\.js"><\/script>/, '');
if (/<script\b/.test(head)) throw new Error('popup.html の <head> に知らないスクリプトがあります');
// サイドパネルはニコ生版でも「中に埋め込む形(?inline=1&dock=sidepanel)」で popup.html を出している。
// そのときニコ生版の JS が付ける nl-inline を最初から付けておく(580px で切れる箱にしない)。
head = head.replace('<html lang="ja" ', '<html lang="ja" class="nl-inline" ');
if (!head.includes('class="nl-inline"')) throw new Error('popup.html の <html> の形が想定と違います');
head = head.replace(
  '<title>君斗りんくの追憶のきらめき</title>',
  '<title>君斗りんくの追憶のきらめき（YouTube Live）</title>',
);
head +=
  '    <!-- ↓ YouTube 版だけの部品の見た目（extension-youtube/src/sidepanel-yt-parts.html から） -->\n' +
  `    <style>${part('css')}    </style>\n` +
  '    <!-- このファイルは scripts/build-youtube-sidepanel-html.mjs の生成物です。直接直さないでください。 -->\n  ';

// ---- <body>: DOM として読んで、抜く・言い換える・差し込む ----
const window = new Window();
const doc = window.document;
doc.write(`<!DOCTYPE html><html><head></head><body>${src.slice(bodyOpen + 6, bodyClose)}</body></html>`);
const body = doc.body;

/** @param {string} sel */
function $(sel) {
  return body.querySelector(sel);
}
/** @param {string} sel */
function mustGet(sel) {
  const el = $(sel);
  if (!el) throw new Error(`popup.html に ${sel} が見つかりません（ニコ生版の画面が変わった?）`);
  return el;
}
/** @param {string[]} sels */
function removeAll(sels) {
  for (const sel of sels) {
    const list = Array.from(body.querySelectorAll(sel));
    for (const el of list) el.remove();
  }
}
/** @param {string} sel @param {string} text */
function setText(sel, text) {
  mustGet(sel).textContent = text;
}
/** @param {string} sel @param {string} name @param {string} value */
function setAttr(sel, name, value) {
  mustGet(sel).setAttribute(name, value);
}
/** @param {string} html */
function fragment(html) {
  const t = doc.createElement('template');
  t.innerHTML = html;
  return t.content;
}

// 1. ★部品は1つも抜かない(りんく「一旦完全コピーしてから変える約束かえないで」2026-11-03)。
//    抜くのはニコ生版のスクリプトだけ(YouTube 版は sidepanel.js が動かす)。
removeAll(['script']);

// 2. 上のボタン列: ニコ生版は JS(hoistQuickToolbarToTop)で一番上へ動かしている。YouTube 版は最初からそこに置く
const toolbar = mustGet('.nl-compose-quick-toolbar');
const main = mustGet('.nl-main');
toolbar.setAttribute('data-nl-hoisted', 'top');
toolbar.setAttribute('aria-label', '書き出しと視聴タブの再読み込み');
main.insertBefore(toolbar, main.firstElementChild);

// 3. 見出し
setText('.nl-header .nl-sub', 'YouTube Live の応援コメントを、このPCで見える化（視聴ページを開くと自動で記録）');

// 4. 配信の選択バー・読み上げの知らせを数字カードの上へ
const statCards = mustGet('#liveStatCards');
statCards.parentNode.insertBefore(fragment(part('top')), statCards);

// 5. 数字カード・数字の行の言葉
setAttr(
  '#supportVisualLiveCard',
  'title',
  'この数字は、このPCに記録したチャットの件数です（スーパーチャット・メンバー加入も含みます）。',
);
setText('#watchConcurrentCard .nl-live-stat-label', '同時視聴');
{
  const icon = mustGet('#watchConcurrentCard .nl-live-stat-icon');
  icon.removeAttribute('title');
  icon.removeAttribute('aria-label');
}
setText('.nl-live-stat-card--visitors .nl-live-stat-label', 'コメントした人');
setAttr('.nl-official-nico-stats__row', 'aria-label', 'この配信の数字の一覧');
{
  const labels = Array.from(body.querySelectorAll('.nl-official-nico-stats__row .nl-official-nico-stats__label'));
  const ytLabels = ['最大同接', '記録コメ', '経過', 'スパチャ', 'メンバー'];
  if (labels.length !== ytLabels.length) throw new Error('数字の行のチップ数がニコ生版と違います');
  labels.forEach((el, i) => {
    el.textContent = ytLabels[i];
  });
}

// 6. 公式値レーン → 応援レーン(スーパーチャット・メンバー・通貨別)
setText('.nl-north-star-lanes__title', '応援レーン（スーパーチャット・メンバー）');
setAttr('#northStarLanes', 'aria-label', '応援レーン（このPCの記録から集計）');
setText(
  '.nl-north-star-lanes__note',
  'このPCに記録したチャットから集計しています（YouTube の公式ランキングではありません）。違う通貨は換算しません。',
);
setAttr('[data-nl-trio-slot="rink"]', 'title', 'りんく（スーパーチャット）');
setAttr('[data-nl-trio-slot="konta"]', 'title', 'こん太（メンバー）');
setAttr('[data-nl-trio-slot="tanu"]', 'title', 'たぬ姉（通貨別の内訳）');
setText('[data-lane="contributionRanking"] .nl-north-star-lane__label', 'スーパーチャット貢献度');
setText(
  '[data-lane="contributionRanking"] .nl-north-star-lane__sublabel',
  'この配信でスーパーチャット・スーパーステッカーを送った人（いちばん多い通貨の金額順・最大10）。',
);
{
  const label = mustGet('[data-lane="giftHistory"] .nl-north-star-lane__label');
  const pt = label.querySelector('#giftHistoryProgramPt');
  label.textContent = 'メンバー加入・メンバーシップギフト';
  if (pt) {
    pt.setAttribute('title', 'この配信で記録したメンバー加入とメンバーシップギフトの件数');
    const ptLabel = pt.querySelector('.nl-north-star-lane__program-pt-label');
    if (ptLabel) ptLabel.textContent = '合計';
    label.appendChild(pt);
  }
}
setText(
  '[data-lane="giftHistory"] .nl-north-star-lane__sublabel',
  'メンバーに入った人・メンバーシップを贈った人（回数の多い順・最大10）。',
);
setText('[data-lane="programPoints"] .nl-north-star-lane__label', '通貨別の内訳');
setText(
  '[data-lane="programPoints"] .nl-north-star-lane__sublabel',
  'スーパーチャット・ステッカーの合計を通貨ごとに出します（換算なし）。',
);

// 7. 詳細設定 → YouTube の読み上げ設定・チャットの表示
{
  const settings = mustGet('#nlPopupSettings');
  setText('#nlPopupSettings .nl-popup-settings__summary', '詳細設定（読み上げ・チャットの表示）');
  const settingsBody = mustGet('#nlPopupSettings .nl-popup-settings__body');
  // ニコ生版の設定はそのまま残し、先頭に YouTube の読み上げ・チャット設定を足す
  settingsBody.insertBefore(fragment(part('settings')), settingsBody.firstChild);
  settings.removeAttribute('open');
}

// 8. コメント投稿欄・書き出し
setAttr('#commentInput', 'maxlength', '200');
setAttr('#commentInput', 'placeholder', 'ここにコメントを書いて送信（YouTube のチャットに送ります）');
setAttr('#commentInput', 'aria-label', 'コメント本文（200文字まで）');
setAttr('#reloadWatchTabBtn', 'title', '視聴ページのタブを再読み込みします（F5 と同じ）');
setAttr('#reloadWatchTabBtn', 'aria-label', '視聴ページのタブを再読み込みします（F5 と同じ）');
setAttr('#captureScreenshot', 'aria-label', '画面を1枚保存。動画の画面を PNG 画像として保存します。');
setAttr('#openComeviewBtn', 'title', 'コメビュ（3レーンのコメント一覧）を開く');
setAttr('#openComeviewBtn', 'aria-label', 'コメビュ（3レーンのコメント一覧）を開きます。');
setAttr('#openComeviewVoiceBtn', 'title', '読み上げ設定を開く（VOICEVOX が必要）');
setAttr('#openComeviewVoiceBtn', 'aria-label', '読み上げ設定を開きます。読み上げには VOICEVOX が必要です。');
setText(
  '#exportToolbarHint',
  'HTML保存・マーケ・スクショ（動画の画面）・再読み込みは、いちばん上のボタンからもできます。',
);

// 9. 応援の記録と表示(タイムライン・ユーザーレーン)
setText('.nl-support-timeline__summary-label', '応援タイムライン（コメント＋スパチャ・メンバー）');
setText(
  '#sceneStoryUserLaneLinkHint',
  'この段は「チャンネルID・表示名・アイコンがそろった人」だけ。いまの記録では該当者がいないので、下の段に並んでいます。',
);
setAttr('#sceneStoryUserLaneLink', 'aria-label', '優先1・チャンネルID・表示名・アイコンがそろった人');
setAttr('#sceneStoryUserLaneGift', 'aria-label', 'スーパーチャット・スーパーステッカーを送った人');
setAttr('#sceneStoryUserLaneAd', 'aria-label', 'メンバー（加入・ギフト・バッジ）');
setAttr('#sceneStoryUserLaneKonta', 'aria-label', '優先2・表示名かアイコンのどちらかが取れている人');
setAttr('#sceneStoryUserLaneTanu', 'aria-label', '優先3・情報が薄い人');
setAttr(
  '#sceneStoryUserLaneStack',
  'title',
  '応援してくれた人を、スーパーチャット・メンバー・プロフィールの揃い具合の段に分けて並べています。タイルを押すとその人の発言一覧が出ます。',
);

// 10. コメビュ(3レーン)は「応援の記録と表示」のあと
{
  const stats = mustGet('section.nl-stats');
  stats.parentNode.insertBefore(fragment(part('comeview')), stats.nextSibling);
}

// ---- 書き出し ----
const bodyHtml = body.innerHTML;
if (/<script\b/i.test(bodyHtml)) throw new Error('本文にニコ生版のスクリプトが残っています');
if (/dist\/popup\.js/.test(bodyHtml)) throw new Error('popup.js への参照が残っています');
const out = `${head}</head>\n  <body class="nl-inline">${bodyHtml}\n    <script src="sidepanel.js"></script>\n  </body>\n</html>\n`;
writeFileSync(OUT, out, 'utf8');

// ---- 画像: ニコ生版から使っている画像を YouTube 版へ写す(無いものだけ) ----
const imgs = new Set(Array.from(out.matchAll(/(?:src|href)="(images\/[^"]+)"/g), (m) => m[1]));
let copied = 0;
for (const rel of imgs) {
  const to = resolve(root, 'extension-youtube', rel);
  if (existsSync(to)) continue;
  const from = resolve(root, 'extension', rel);
  if (!existsSync(from)) throw new Error(`画像が見つかりません: ${rel}`);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  copied += 1;
}
await window.happyDOM.close();
console.log(`sidepanel.html を作りました（${out.length.toLocaleString()} 文字・画像 ${copied} 枚を写した）`);
