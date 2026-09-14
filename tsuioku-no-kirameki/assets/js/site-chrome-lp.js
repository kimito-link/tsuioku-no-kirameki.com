/*
  site-chrome-lp.js — 追憶のきらめき サイト共通の「ヘッダー(ロゴ＋ハンバーガー)・ドロワーメニュー・フッター」。

  ★2026-09-14: LP(index.html)に inline で書かれていたヘッダー/ドロワー/フッターの HTML と開閉 JS を
    そのままここへ移し、LP と /live/(追憶のきらめき ランキング)の両方が同じ 1 本を読む
    (web-ios-android/CLAUDE.md 基準⑤⑥: 2箇所目を書く前に 1 つ目を共有置き場へ)。
    見た目の CSS は assets/css/site-chrome-lp.css(同じく LP から切り出し)。
  ★キットの templates/web/site-chrome(汎用ヘッダー金型)は「別デザインの汎用品」なので採用しない。
    LP の銀河デザインをそのまま部品化する方が、利用者の目には「同じサイト」に見える。

  使い方(2 か所に置く。どちらも【同期的に】その場へ差し込むので、後続スクリプトから DOM が見える):
    <script src="assets/js/site-chrome-lp.js" data-part="header" data-base=""></script>   ← body 先頭付近
    <script src="assets/js/site-chrome-lp.js" data-part="footer" data-base="" data-version="0.1.1509"></script> ← main の後
  data-base: LP からの相対パス(LP 自身は "" / /live/ は "../")。ナビの #アンカーは LP のセクションへ飛ぶ。
  data-version: フッターに出す版数(LP だけ。無ければ出さない)。★版数の正本は package.json→LP の 4 か所(verify:bump が照合)。
*/
/* global document */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var part = script.getAttribute('data-part') || 'header';
  var base = script.getAttribute('data-base') || '';
  var version = script.getAttribute('data-version') || '';
  var current = script.getAttribute('data-current') || '';   // 例: "live" → そのナビ項目に aria-current

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // ★LP のナビと【同じ順・同じ文言】。1 か所だけ直せば全ページに効く。
  var NAV = [
    ['#worldview', 'はじめに'],
    ['#record-foundation', '記録安定'],
    ['#record-results', '改善実績'],
    ['#record-transparency', '透明性'],
    ['#tanabata-preview', '七夕プレビュー'],
    ['#voices', 'タイムライン'],
    ['#context-scale', '背景の数字'],
    ['#multi-live', '同時視聴'],
    ['#extension-visual', '拡張の見え方'],
    ['#lp-comment-compose-guide', 'コメント送信'],
    ['#lp-voice-comment', '音声コメント'],
    ['#lp-anonymous-identicon', '匿名 Identicon'],
    ['#html-save', 'HTML保存'],
    ['#marketing-features', 'マーケ分析'],
    ['#marketing-what-you-can-do', '分析の読み方'],
    ['#problem', '問題'],
    ['#impact', '反応の階段'],
    ['#comments', '配信コメント'],
    ['#extension-guide', '画面の見方'],
    ['#algorithm', '同接推定'],
    ['#solution', '解決の方向'],
    ['#product-policy', '提供の考え方'],
    ['live/', '追憶のきらめき ランキング', 'live'],
    ['articles/', '技術記事', 'articles'],
    ['#record-cta', '導入・試用', 'cta', 'cta']
  ];
  function href(h) {
    // "#x" → base + "#x"(LP 自身なら "#x" のまま) / "live/" → base + "live/"
    return base + h;
  }

  function headerHtml() {
    var nav = NAV.map(function (it) {
      var cls = it[3] ? ' class="' + esc(it[3]) + '"' : '';
      var cur = current && it[2] === current ? ' aria-current="page"' : '';
      return '          <a href="' + esc(href(it[0])) + '"' + cls + cur + '>' + esc(it[1]) + '</a>';
    }).join('\n');
    return [
      '<header class="topbar" id="site-header">',
      '      <div class="shell topbar-inner">',
      '        <a class="topbar__logo" href="' + esc(base + '#worldview') + '" aria-label="君斗りんくの追憶のきらめき（はじめにへ）">',
      '          <img src="' + esc(base + '../extension/images/logo/kimito-link-color.png') + '" width="160" height="40" alt="Kimito-Link Project（キミトリンク）" loading="eager" decoding="async">',
      '        </a>',
      '        <button type="button" class="topbar__menu-btn" id="topbar-menu-btn" aria-expanded="false" aria-controls="topbar-drawer" aria-haspopup="dialog" aria-label="メニューを開く">',
      '          <span class="topbar__menu-icon" aria-hidden="true"><span></span><span></span><span></span></span>',
      '          <span class="topbar__menu-text" aria-hidden="true">メニュー</span>',
      '        </button>',
      '      </div>',
      '    </header>',
      '    <div class="topbar__backdrop" id="topbar-backdrop" aria-hidden="true"></div>',
      '    <div class="topbar__drawer" id="topbar-drawer" role="dialog" aria-modal="true" aria-labelledby="topbar-drawer-title" aria-hidden="true">',
      '      <h2 id="topbar-drawer-title" class="visually-hidden">サイトメニュー</h2>',
      '      <p class="topbar__drawer-hint" aria-hidden="true">' + (base ? 'サイト内リンク' : 'ページ内リンク') + '</p>',
      '      <nav class="topbar__nav" aria-label="主要リンク">',
      nav,
      '        </nav>',
      '      <p class="topbar__drawer-intro">',
      '        <strong>君斗りんくの追憶のきらめき</strong> — 応援が流れてしまう現実と、「なかったことにしたくない」気持ちに寄り添うページです。Web・iOS・Android と Chrome 拡張を前提に整理しています。見え方や仕組みは、上のリンクから章ごとにたどれます。今後、<strong>YouTube</strong> をはじめとした<strong>他の配信プラットフォーム</strong>への対応も視野に入れています。',
      '      </p>',
      '    </div>'
    ].join('\n');
  }

  function footerHtml() {
    return [
      '<footer class="footer-note">',
      '      <div class="shell">',
      version ? '        <div>追憶のきらめき v' + esc(version) + ' ― Kimito-Link Project</div>' : '        <div>追憶のきらめき ― Kimito-Link Project</div>',
      '        <div class="footer-note__links"><a href="' + esc(base + 'live/') + '">追憶のきらめき ランキング</a> ／ <a href="' + esc(base + 'articles/') + '">技術記事</a> ／ <a href="https://kimitotalk.link/talent/" target="_blank" rel="noopener">キミトトーク</a> ／ <a href="' + esc(base + 'privacy.html') + '">プライバシーポリシー</a></div>',
      '        <div class="footer-note__ip">',
      '          コメントを投稿者ごとの声で読み上げる仕組みは<strong>特許出願中</strong>です（特願2026-159890）。<br>',
      '          「キミトリンク」は商標登録第7069215号。',
      '        </div>',
      '      </div>',
      '    </footer>'
    ].join('\n');
  }

  function wireDrawer() {
    var btn = document.getElementById('topbar-menu-btn');
    var backdrop = document.getElementById('topbar-backdrop');
    var drawer = document.getElementById('topbar-drawer');
    var label = btn && btn.querySelector('.topbar__menu-text');
    if (!btn || !backdrop || !drawer) return;

    function setOpen(open) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
      backdrop.classList.toggle('is-open', open);
      drawer.classList.toggle('is-open', open);
      backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
      drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      document.body.classList.toggle('topbar-menu-open', open);
      if (label) label.textContent = open ? '閉じる' : 'メニュー';
    }

    btn.addEventListener('click', function () {
      setOpen(btn.getAttribute('aria-expanded') !== 'true');
    });
    backdrop.addEventListener('click', function () {
      setOpen(false);
    });
    drawer.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function () {
        setOpen(false);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  if (part === 'footer') {
    script.insertAdjacentHTML('beforebegin', footerHtml());
  } else {
    script.insertAdjacentHTML('beforebegin', headerHtml());
    wireDrawer();
  }
})();
