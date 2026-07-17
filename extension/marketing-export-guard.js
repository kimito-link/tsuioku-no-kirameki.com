/*
 * marketing-export-guard.js — マーケ分析タブ(marketing-export.html)の「何があっても開く」保険。
 *
 * status-guard.js と同型(2026-07-17・マーケ分析の別タブ化・marketing-export-tab-DESIGN.md)。
 *
 * ★これは esbuild を通さない【素のファイル】= extension/ 直下に置き、copy-ext が丸ごとミラーする。
 *   dist/marketing-export.js(バンドル本体)がどう壊れても・重くても・全く読めなくても、この guard
 *   だけは別ファイルとして必ず先に動く。
 *
 * CSP: manifest の extension_pages は `script-src 'self'` =【インライン <script> は禁止】。
 *   だから HTML 直書きでなく、同梱の独立 .js(='self')として読み込む。
 *
 * やること(3つだけ・最小):
 *   1. window.onerror / unhandledrejection を捕まえ、本体読込中の例外を画面に出す(白画面・無言固着を防ぐ)。
 *   2. 起動見張り: 一定時間内に本体(marketing-export.js)が起動フラグ window.__NL_MKTEXPORT_BOOTED を
 *      立てなければ、「準備中...」のまま固着させず、案内に置き換える。
 *   3. 本体が起動したら自分は黙る(見張りを解除)。
 *
 * 本体(marketing-export-entry.js)との約束: bootstrap の冒頭で
 *   `window.__NL_MKTEXPORT_BOOTED = true` を立てる。このファイルはそのフラグを読むだけ
 *   =本体の挙動は1mmも変えない(疎結合)。
 */
(function () {
  'use strict';

  var BOOT_TIMEOUT_MS = 12000;

  var banner = null;
  function ensureBanner() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.id = 'nlMktExportGuardBanner';
    banner.setAttribute('role', 'alert');
    banner.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:2147483647;margin:0;padding:12px 14px;' +
      'border-bottom:2px solid #ec4899;background:#fff0f6;color:#9d174d;' +
      'font:14px/1.6 ui-monospace,Consolas,monospace;white-space:pre-wrap;';
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

  // 1) 本体読込中・実行中の例外を捕まえる。
  window.addEventListener(
    'error',
    function (ev) {
      var src = ev && ev.target && ev.target.src ? String(ev.target.src) : '';
      if (src && /marketing-export\.js/.test(src)) {
        showBanner(
          '⚠ 分析スクリプト(dist/marketing-export.js)の読み込みに失敗しました。\n' +
            '  このタブを閉じて、拡張のポップアップからもう一度開いてください。\n' +
            '  記録自体は watch タブ側で続いています(止まっていません)。'
        );
        return;
      }
      var msg = ev && ev.message ? String(ev.message) : '不明なエラー';
      showBanner(
        '⚠ マーケ分析タブの初期化でエラーが出ました。\n' +
          '  内容: ' + msg + '\n' +
          '  このタブを閉じて、もう一度開いてください。'
      );
    },
    true
  );

  window.addEventListener('unhandledrejection', function (ev) {
    var reason = ev && ev.reason ? String(ev.reason && ev.reason.message ? ev.reason.message : ev.reason) : '';
    if (/timed?.?out|marketing_storage_timeout/i.test(reason)) return;
    if (reason) showBanner('⚠ マーケ分析タブで未処理のエラー: ' + reason + '\n  タブを閉じて再度お試しください。');
  });

  // 2) 起動見張り。
  function checkBoot() {
    if (window.__NL_MKTEXPORT_BOOTED) return; // 3) 本体が起動した=黙る。
    showBanner(
      '⏳ マーケ分析タブの起動に時間がかかっています(' + Math.round(BOOT_TIMEOUT_MS / 1000) + '秒以上)。\n' +
        '  このタブを閉じて、拡張のポップアップからもう一度開いてください。記録は止まっていません。'
    );
  }

  function arm() {
    window.setTimeout(checkBoot, BOOT_TIMEOUT_MS);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm, { once: true });
  } else {
    arm();
  }
})();
