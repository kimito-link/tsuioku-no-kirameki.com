/*
 * status-guard.js — 状態速報ページ(status.html)の「何があっても開く」保険。
 *
 * 2026-06-22: ユーザー「status.html が重くて開かないことがときどきある。会場をいじる前に、
 *   診断HTMLが何があっても影響を受けない設定を先に入れたい」。
 *
 * ★これは esbuild を通さない【素のファイル】= extension/ 直下に置き、copy-ext が丸ごとミラーする。
 *   dist/status.js(バンドル本体)がどう壊れても・重くても・全く読めなくても、この guard だけは
 *   別ファイルとして必ず先に動く。これが「本体に影響されない」核心。
 *
 * CSP: manifest の extension_pages は `script-src 'self'` =【インライン <script> は禁止】。
 *   だから HTML 直書きでなく、同梱の独立 .js(='self')として読み込む。
 *
 * やること(3つだけ・最小):
 *   1. window.onerror / unhandledrejection を捕まえ、本体読込中の例外を画面に出す(白画面・無言固着を防ぐ)。
 *   2. 起動見張り: 一定時間内に本体(status.js)が起動フラグ window.__NL_STATUS_BOOTED を立てなければ、
 *      「読み込み中...」のまま固着させず、リロード案内に置き換える。
 *   3. 本体が起動したら自分は黙る(見張りを解除)。本体が後から重く描画するのは妨げない。
 *
 * 本体(status-entry.js)との約束: bootstrap の冒頭で `window.__NL_STATUS_BOOTED = true` を立てる。
 *   このファイルはそのフラグを読むだけ=本体の挙動は1mmも変えない(疎結合)。
 */
(function () {
  'use strict';

  // 本体が起動フラグを立てるまでの猶予。これを過ぎても起動しなければ「開かない」とみなし案内を出す。
  //   重い storage でも本体側は 1.5s timeout で degrade 表示に入る設計なので、それでも来ない=異常。
  var BOOT_TIMEOUT_MS = 12000;

  // 自己診断バナーの DOM を一度だけ作る。状態速報の各セルより前(ページ最上部)に差し込む。
  var banner = null;
  function ensureBanner() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.id = 'nlStatusGuardBanner';
    banner.setAttribute('role', 'alert');
    banner.style.cssText =
      'margin:10px 0;padding:12px 14px;border:2px solid #ec4899;border-radius:10px;' +
      'background:#fff0f6;color:#9d174d;font:14px/1.6 ui-monospace,Consolas,monospace;' +
      'white-space:pre-wrap;';
    var body = document.body;
    if (body) body.insertBefore(banner, body.firstChild);
    return banner;
  }

  function showBanner(text) {
    try {
      var el = ensureBanner();
      if (el) el.textContent = text;
    } catch (_e) {
      void _e; /* DOM がまだ無い等。次の機会に出す。 */
    }
  }

  // 「読み込み中...」のままのセルだけを、固着メッセージに置き換える(本体が描いた内容は触らない)。
  function replaceStuckCells(note) {
    var ids = ['overviewBody', 'livesBody', 'actionBody', 'mindmapBody'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && /読み込み中/.test(el.textContent || '')) {
        el.className = 'empty-note';
        el.textContent = note;
      }
    }
  }

  // 1) 本体読込中・実行中の例外を捕まえる(白画面化の最大要因=無言の throw を可視化する)。
  window.addEventListener('error', function (ev) {
    // リソース読み込み失敗(script/img)も error イベントで来る。src があれば読込失敗とみなす。
    var src = ev && ev.target && ev.target.src ? String(ev.target.src) : '';
    if (src && /status\.js/.test(src)) {
      showBanner(
        '⚠ 診断スクリプト(dist/status.js)の読み込みに失敗しました。\n' +
          '  拡張を再読み込み(chrome://extensions の 🔄)してから、このページを F5 してください。\n' +
          '  記録自体は各 watch タブ側で続いています(止まっていません)。'
      );
      return;
    }
    var msg = ev && ev.message ? String(ev.message) : '不明なエラー';
    showBanner(
      '⚠ 診断ページの初期化でエラーが出ました。\n' +
        '  内容: ' + msg + '\n' +
        '  F5 で再読み込みしても直らないときは、拡張の 🔄 を試してください。\n' +
        '  記録自体は watch タブ側で継続中です。'
    );
  }, true); // capture=true: リソース読込失敗もここで拾う。

  window.addEventListener('unhandledrejection', function (ev) {
    // 本体は各所を try/catch + timeout で degrade 済みだが、漏れた reject も握って固着を防ぐ。
    var reason = ev && ev.reason ? String(ev.reason && ev.reason.message ? ev.reason.message : ev.reason) : '';
    // storage 混雑 timeout は本体が画面に出す想定内事象=ここで重ねて騒がない。
    if (/timed?.?out|STORAGE_OP_TIMED_OUT/i.test(reason)) return;
    if (reason) showBanner('⚠ 診断ページで未処理のエラー: ' + reason + '\n  数秒待つか F5 してください。');
  });

  // 2) 起動見張り。BOOT_TIMEOUT_MS 経っても本体が起動フラグを立てなければ固着とみなして案内。
  function checkBoot() {
    if (window.__NL_STATUS_BOOTED) return; // 3) 本体が起動した=黙る。
    replaceStuckCells('(診断スクリプトの起動が遅れています… F5 で再読み込みできます)');
    showBanner(
      '⏳ 診断ページの起動に時間がかかっています(' + Math.round(BOOT_TIMEOUT_MS / 1000) + '秒以上)。\n' +
        '  ストレージが混雑していると重くなることがあります。\n' +
        '  この画面のまま少し待つか、F5 で再読み込みしてください。記録は止まっていません。'
    );
  }

  // DOM 準備後にタイマーを張る(body が無いと banner を出せないため)。
  function arm() {
    window.setTimeout(checkBoot, BOOT_TIMEOUT_MS);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm, { once: true });
  } else {
    arm();
  }
})();
