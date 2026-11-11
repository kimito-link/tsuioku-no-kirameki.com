// youtube-build.mjs — YouTube 版の束ね方(esbuild の書き換えと入口の一覧)。2 か所から使う:
//   - scripts/build-youtube-ext.mjs: 単体の YouTube 版(extension-youtube/)
//   - scripts/build.mjs           : 本体に同梱する YouTube 版(extension/dist/yt-*.js と extension/yt-*.html・2026-11-05 りんく「メインに統合」)
// ★本体向けは NL_YT_MERGED=true。画面と視聴ページの入口に仕切り(ytMergedIsolationBoot.js)をいちばん先に入れ、
//   保存場所・IndexedDB・画面の名前・裏方への頼みをニコ生版から切り離す(src/lib/youtube/ytMergedIsolation.js)。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ニコ生版 venueBar.js は配信を視聴ページの URL(/watch/lv…)から決める(liveIdFromPathname)。YouTube の視聴ページでは
//   決められないので、YouTube 版のバンドルの中だけ、配信を教える口を末尾に足す(ファイル自体は書き換えない・ニコ生版は不変)。
/** 1か所だけ置き換える(見つからない・2か所ある=ニコ生版が変わった→ビルドを止めて気づく) */
function replaceOnce(src, from, to, what) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`venueBar.js の書き換え「${what}」の目印が ${n} か所(1か所のはず)。ニコ生版の変更に合わせて直す`);
  return src.replace(from, () => to);
}

// 2026-11-05 りんく選択「出ている吹き出しから選ぶ」: PICK UP は、その瞬間に画面に出ている吹き出しの発言からだけ選ぶ
//   (ニコ生版は直近8秒の発言から選ぶので、吹き出しが消えた/あふれて出なかった発言が PICK UP に出ることがあった)。
//   選び方(7秒ごと・点数)はニコ生版のまま、候補だけを「いま吹き出しが出ている発言」に絞る。ニコ生版は CWS 審査後に同じ直しを入れる。
function patchVenueBarPickupOnScreen(src) {
  // 吹き出しに、どの発言のものかを持たせる
  src = replaceOnce(src, '      bubbleKey,\n      seatIndex: seatUsable ? seatIndex : -1,', '      bubbleKey,\n      speechKey: String(/** @type {any} */ (speech).key || \'\'),\n      seatIndex: seatUsable ? seatIndex : -1,', '吹き出しに発言の印');
  // 候補を、いま出ている吹き出しの発言に絞る(1つも無ければ枠はそのまま)
  src = replaceOnce(
    src,
    '      const rows = pickupRing.length ? pickupRing : (Array.isArray(fallbackRows) ? fallbackRows : []);\n',
    '      let rows = pickupRing.length ? pickupRing : (Array.isArray(fallbackRows) ? fallbackRows : []);\n' +
      '      if (pickupRing.length) {\n' +
      '        const onScreen = new Set(activeBubbles.filter((b) => !b.removed && b.speechKey && !(b.ytGoneAt && b.ytGoneAt - Date.now() < 1500)).map((b) => b.speechKey));\n' +
      '        rows = rows.filter((r) => r && r.key && onScreen.has(String(r.key)));\n' +
      '        if (!rows.length) return;\n' +
      '      }\n',
    'PICK UP の候補'
  );
  // すぐ消える予定の吹き出し(後から出た吹き出しに隠れて消える等)は候補にしない: 消える時刻を覚える
  src = replaceOnce(src, '    const ms = Math.max(0, lifetimeMs);\n    if (!bubble.reducedMotion) {', '    const ms = Math.max(0, lifetimeMs);\n    bubble.ytGoneAt = Date.now() + ms;\n    if (!bubble.reducedMotion) {', '吹き出しの消える時刻');
  // 読む前に消えた吹き出し(押し出し・寿命)の声は列から外す(venue-inline-entry.js の __ytDropVoiceKey・会議 2026-11-05)
  src = replaceOnce(src, '    if (!bubble || bubble.removed) return;\n    bubble.removed = true;\n', '    if (!bubble || bubble.removed) return;\n    bubble.removed = true;\n    if (bubble.voiceState === \'pending\' && bubble.speechKey) { try { /** @type {any} */ (globalThis).__ytDropVoiceKey?.(bubble.speechKey); } catch { /* 声の後始末の失敗で描画を止めない */ } }\n', '消えた吹き出しの声');
  // 吹き出しを出し終えてから選ぶ(ニコ生版は吹き出しより先に選んでいた)
  src = replaceOnce(src, '      updatePickupBanner(null);\n    }\n    // ユーザー方針「しゃべった人を席に出して吹かせる」', '      queueMicrotask(() => updatePickupBanner(null));\n    }\n    // ユーザー方針「しゃべった人を席に出して吹かせる」', 'PICK UP を吹き出しの後に');
  return src;
}

// 0.1.106: ニコ生版 v0.1.1861 の「混んだら大事なものだけ」(voicePlayer の中)は、YouTube のスパチャ・メンバー・バッジを
//   知らないので、同じ人の2回目のスパチャを読まずに飛ばしてしまう。YouTube 版は先に入れた自前の選び方
//   (venue-inline-entry.js・ytVoicePriority.js・2026-11-04 りんく決定)があるので、ニコ生版の方は YouTube 版では使わない
//   (master を取り込む前と同じ動き)。
function setupYtBusyPatch(b) {
  b.onLoad({ filter: /src[\\/]lib[\\/]voiceBusyPriority\.js$/ }, (args) => ({
    contents: replaceOnce(
      readFileSync(args.path, 'utf8'),
      '  return busy && !input?.importance;',
      '  return busy && !input?.importance && false; // YouTube 版は自前の選び方(ytVoicePriority.js)',
      'ニコ生版の混雑時の絞り込みを使わない'
    ),
    loader: 'js',
    resolveDir: dirname(args.path),
  }));
}

// 0.1.99 りんく(2026-11-05)「自分でちゃんと設定している人は認知してほしい」: YouTube は全員に名前があるので、
//   ニコ生版の決まり(名前＋数字ID=りんく)だと全員りんく欄になる。最初からの文字アイコンのままの人はこん太欄へ下げる。
//   見分けは ytNicoShim(ytDefaultIcon.js)が画像で行い globalThis.__ytIsDefaultIconUid で答える。YouTube 版だけ。
function setupYtDefaultIconTier(b) {
  b.onLoad({ filter: /src[\\/]lib[\\/]supportGridDisplayTier\.js$/ }, (args) => ({
    contents: replaceOnce(
      readFileSync(args.path, 'utf8'),
      '  const tier = demoteNiconicoAnonymousFromKontaTier(uid, tierRaw);', // ★このファイルは CRLF なので改行を目印に入れない
      "  let tier = demoteNiconicoAnonymousFromKontaTier(uid, tierRaw);\n  if (tier === SUPPORT_GRID_TIER_LINK && typeof globalThis.__ytIsDefaultIconUid === 'function' && globalThis.__ytIsDefaultIconUid(uid)) tier = SUPPORT_GRID_TIER_KONTA;",
      '文字アイコンの人はこん太欄'
    ),
    loader: 'js',
    resolveDir: dirname(args.path),
  }));
  // ★応援レーン(りんく欄)の段は supportGridDisplayTier ではなく domain/lane/tier.js の resolveLaneTier で決まる
  //   (0.1.99 では上だけ書き換えて効かなかった・りんく実機 2026-11-05)。こちらも同じ答えで下げる。
  b.onLoad({ filter: /src[\\/]domain[\\/]lane[\\/]tier\.js$/ }, (args) => ({
    contents: replaceOnce(
      readFileSync(args.path, 'utf8'),
      '  if (matchesLinkPolicy(entry)) return 3;',
      "  if (matchesLinkPolicy(entry)) return typeof globalThis.__ytIsDefaultIconUid === 'function' && globalThis.__ytIsDefaultIconUid(uid) ? 2 : 3;",
      '文字アイコンの人はこん太欄(レーンの段)'
    ),
    loader: 'js',
    resolveDir: dirname(args.path),
  }));
}
export const ytScreenPlugin = {
  name: 'yt-screen',
  setup(b) {
    setupYtDefaultIconTier(b);
    setupYtBusyPatch(b);
  },
};

export const ytVenueLiveIdPlugin = {
  name: 'yt-venue-live-id',
  setup(b) {
    setupYtDefaultIconTier(b);
    setupYtBusyPatch(b);
    b.onLoad({ filter: /src[\\/]extension[\\/]venueBar\.js$/ }, (args) => ({
      contents:
        patchVenueBarForPickup(readFileSync(args.path, 'utf8')) +
        '\n/** YouTube 版のバンドルだけに足す口(scripts/build-youtube-ext.mjs) */\nexport function __ytSetVenueLiveId(v) { _forcedLiveId = v ? String(v) : null; }\n',
      loader: 'js',
      resolveDir: dirname(args.path),
    }));
  },
};

/** 別窓の会場(venue.js)にも同じ PICK UP の直しを入れる */
export const ytVenuePickupPlugin = {
  name: 'yt-venue-pickup',
  setup(b) {
    setupYtDefaultIconTier(b);
    setupYtBusyPatch(b);
    b.onLoad({ filter: /src[\\/]extension[\\/]venueBar\.js$/ }, (args) => ({
      contents: patchVenueBarForPickup(readFileSync(args.path, 'utf8')),
      loader: 'js',
      resolveDir: dirname(args.path),
    }));
  },
};
const patchVenueBarForPickup = patchVenueBarPickupOnScreen;


const ISOLATION_BOOT = resolve(root, 'extension-youtube/src/ytMergedIsolationBoot.js');

/**
 * YouTube 版の束の一覧。
 * @param {{ merged: boolean, define: Record<string, string> }} o
 *   merged=false: extension-youtube/ に単体の拡張として書く / true: extension/dist/yt-*.js に本体向けとして書く
 * @returns {Array<Record<string, any>>} esbuild の設定(bundle/format などの共通分は呼ぶ側が足す)
 */
export function ytBuildTargets({ merged, define }) {
  const out = (name) => (merged ? `extension/dist/yt-${name}` : `extension-youtube/${name}`);
  const def = { ...define, NL_YT_MERGED: merged ? 'true' : 'false' };
  const page = merged ? { inject: [ISOLATION_BOOT] } : {};
  const src = (f) => resolve(root, 'extension-youtube/src', f);
  /** @type {Array<Record<string, any>>} */
  const list = [
    { entryPoints: [src('content-chat-entry.js')], outfile: out('content-chat.js'), target: 'chrome114', define: def, ...page,
      banner: { js: '// content-chat.js — YouTube Live チャット欄 DOM の監視・コメント取得バンドル\n/* eslint-disable */' } },
    { entryPoints: [src('background-entry.js')], outfile: out('background.js'), target: 'chrome114', define: def,
      banner: { js: '// background.js — YouTube Live コメントのローカル記録・読み上げキュー管理バンドル\n/* eslint-disable */' } },
    // ★ニコ生版の本物 popup-entry.js を、YouTube の記録を読む入口(ytNicoShim)つきで束ねる
    { entryPoints: [src('sidepanel-nico-entry.js')], outfile: out('sidepanel.js'), target: 'chrome100', define: def, plugins: [ytScreenPlugin], ...page,
      banner: { js: '// sidepanel.js — ニコ生版 popup-entry.js(本物)+ YouTube の記録を読む入口のバンドル\n/* eslint-disable */' } },
    // ★ニコ生版の本物 marketing-export-entry.js(マーケ画面)を、同じ入口(ytNicoShim)つきで束ねる
    { entryPoints: [src('marketing-export-nico-entry.js')], outfile: out('marketing-export.js'), target: 'chrome100', define: def, plugins: [ytScreenPlugin], ...page,
      banner: { js: '// marketing-export.js — ニコ生版 marketing-export-entry.js(本物)+ YouTube の記録を読む入口のバンドル\n/* eslint-disable */' } },
    // ★ニコ生版の本物 comeview-entry.js(コメビュ)を、同じ入口(ytNicoShim)つきで束ねる
    { entryPoints: [src('comeview-nico-entry.js')], outfile: out('comeview.js'), target: 'chrome100', define: def, plugins: [ytScreenPlugin], ...page,
      banner: { js: '// comeview.js — ニコ生版 comeview-entry.js(本物)+ YouTube の記録を読む入口のバンドル\n/* eslint-disable */' } },
    // ★ニコ生版の本物 venue-entry.js(会場モード)を、同じ入口(ytNicoShim)つきで束ねる
    { entryPoints: [src('venue-nico-entry.js')], outfile: out('venue.js'), target: 'chrome100', define: def, plugins: [ytVenuePickupPlugin], ...page,
      banner: { js: '// venue.js — ニコ生版 venue-entry.js(本物)+ YouTube の記録を読む入口のバンドル\n/* eslint-disable */' } },
    // 視聴ページの「🏟 会場モード」= ニコ生版 venueBar.js の mountVenueBarButton をそのまま視聴ページで動かす
    { entryPoints: [src('venue-inline-entry.js')], outfile: out('venue-inline.js'), target: 'chrome100', define: def, plugins: [ytVenueLiveIdPlugin], ...page,
      banner: { js: '// venue-inline.js — ニコ生版の視聴ページの会場モード(venueBar.js 本物)+ YouTube の記録を読む入口のバンドル\n/* eslint-disable */' } },
  ];
  // チャット欄のページ自身の世界で動く小さな手伝い(単体版は手書きのファイルをそのまま使う。本体向けは指紋に入るよう束ねて置く)
  if (merged) {
    // Twitch の視聴ページの入口(council/twitch-support-PLAN.md)。記録は YouTube 版と同じ口へ送る=本体向けだけに置く
    list.push({ entryPoints: [src('tw-content-entry.js')], outfile: out('tw-content.js'), target: 'chrome114', define: def, ...page,
      banner: { js: '// tw-content.js — Twitch の視聴ページでチャット(公式の読み取り専用 IRC)を読み、記録へ渡すバンドル\n/* eslint-disable */' } });
    // Kick の視聴ページの入口(council/kick-support-PLAN.md)。Twitch と同じく本体向けだけ
    list.push({ entryPoints: [src('kick-content-entry.js')], outfile: out('kick-content.js'), target: 'chrome114', define: def, ...page,
      banner: { js: '// kick-content.js — Kick の視聴ページでチャット(ページ自身が使う Pusher)を読み、記録へ渡すバンドル\n/* eslint-disable */' } });
    // ふわっちの視聴ページの入口(council/whowatch-support-PLAN.md)。Kick と同じく本体向けだけ
    list.push({ entryPoints: [src('ww-content-entry.js')], outfile: out('ww-content.js'), target: 'chrome114', define: def, ...page,
      banner: { js: '// ww-content.js — ふわっちの視聴ページで配信とコメント(ページ自身が使う API)を読み、記録へ渡すバンドル\n/* eslint-disable */' } });
    // SHOWROOM の部屋のページの入口(council/showroom-support-PLAN.md)。本体向けだけ
    list.push({ entryPoints: [src('sr-content-entry.js')], outfile: out('sr-content.js'), target: 'chrome114', define: def, ...page,
      banner: { js: '// sr-content.js — SHOWROOM の部屋のページでコメントとギフト(ページ自身が使うソケット)を読み、記録へ渡すバンドル\n/* eslint-disable */' } });
    // ミクチャの配信ページの入口(council/mixch-support-PLAN.md)。本体向けだけ
    list.push({ entryPoints: [src('mx-content-entry.js')], outfile: out('mx-content.js'), target: 'chrome114', define: def, ...page,
      banner: { js: '// mx-content.js — ミクチャの配信ページでコメントとギフト(ページ自身が使うソケット)を読み、記録へ渡すバンドル\n/* eslint-disable */' } });
    // TikTok LIVE の配信ページの入口(council/tiktok-support-PLAN.md)。ページ自身の世界の写し役と、記録へ渡す入口の2つ。本体向けだけ
    list.push({ entryPoints: [src('tt-main-entry.js')], outfile: out('tt-main.js'), target: 'chrome114', define: def,
      banner: { js: '// tt-main.js — TikTok の配信ページ自身の世界で、ページのソケットの受信と gift/list を写して入口へ渡すバンドル\n/* eslint-disable */' } });
    list.push({ entryPoints: [src('tt-content-entry.js')], outfile: out('tt-content.js'), target: 'chrome114', define: def, ...page,
      banner: { js: '// tt-content.js — TikTok の配信ページでコメントとギフト(ページ自身のソケットの写し)を読み、記録へ渡すバンドル\n/* eslint-disable */' } });
    list.push({ entryPoints: [src('content-chat-main-entry.js')], outfile: out('content-chat-main.js'), target: 'chrome114', define: def });
  }
  // offscreen は1つしか持てないので、本体向けには作らない(本体の offscreen を使う・YouTube の読み上げはコメビュ)
  if (!merged) {
    list.push({ entryPoints: [src('offscreen-entry.js')], outfile: out('offscreen.js'), target: 'chrome114', define: def,
      banner: { js: '// offscreen.js — YouTube Live VOICEVOX 読み上げ常駐再生 Offscreen Document バンドル\n/* eslint-disable */' } });
  }
  return list;
}

/**
 * 本体向けの YouTube 版の画面(extension/yt-*.html)= ニコ生版の画面の完全コピー。変えるのはプログラムの置き場所だけ
 *   (画像・音は本体と同じものを使う=同じ場所に同じファイルがある)。コメビュだけ単体版と同じ CSS を1つ足す。
 * ★先に scripts/build-youtube-sidepanel-html.mjs が単体版の画面を作っているので、コメビュの CSS はそこから取る。
 */
/**
 * 横の欄(yt-sidepanel.html)の最初の描画。プログラムが読み込まれるまでの 0.2〜0.3 秒、ニコ生版の HTML の
 * 「推定同時接続 —」と来場者数・広告pt 等が見えていた(2026-11-11 PC 計測)。値は最初から「読み込み中」にし、
 * サービスごとの見出しが付くまで(platformMetricChrome.js が html に data-nl-platform-ready を付ける)ニコ生の見出しと欄を隠す。
 * @param {string} html
 */
function ytPanelPrePaint(html) {
  const est = '<div class="nl-live-stat-value" id="watchConcurrentEst">—</div>';
  if (html.split(est).length !== 2) throw new Error('popup.html の #watchConcurrentEst の形が変わった(ytPanelPrePaint)');
  const css =
    '<style>/* YouTube 版: サービスの見出しが付くまでニコ生の見出しと欄を出さない(scripts/youtube-build.mjs) */\n' +
    'html:not([data-nl-platform-ready]) #watchConcurrentCard .nl-live-stat-label,\n' +
    'html:not([data-nl-platform-ready]) .nl-official-nico-stats__row { visibility: hidden; }\n' +
    'html:not([data-nl-platform-ready]) .nl-live-stat-card--visitors { display: none !important; }\n' +
    '</style>\n';
  const label = '<div class="nl-live-stat-label">推定同時接続</div>';
  if (html.split(label).length !== 2) throw new Error('popup.html の同時接続の見出しの形が変わった(ytPanelPrePaint)');
  const htmlTag = '<!DOCTYPE html><html lang="ja"';
  if (!html.startsWith(htmlTag)) throw new Error('popup.html の1行目の形が変わった(ytPanelPrePaint)');
  return html
    // ページに数が出るサービスの画面の印(popup-entry.js の clearWatchMetaCard が「（接続中…）」でなく「読み込み中」と出す)
    .replace(htmlTag, `${htmlTag} data-nl-page-count-only="1"`)
    // 見出しはサービスが分かってから付ける(ニコ生の「推定同時接続」を一瞬も出さない)
    .replace(label, '<div class="nl-live-stat-label"></div>')
    .replace(est, '<div class="nl-live-stat-value is-placeholder" id="watchConcurrentEst">読み込み中</div>')
    .replace('</head>', `${css}</head>`);
}

export function writeYtMergedHtml() {
  const pages = [
    ['popup.html', 'yt-sidepanel.html', 'dist/popup.js', 'dist/yt-sidepanel.js'],
    ['marketing-export.html', 'yt-marketing-export.html', 'dist/marketing-export.js', 'dist/yt-marketing-export.js'],
    ['comeview.html', 'yt-comeview.html', 'dist/comeview.js', 'dist/yt-comeview.js'],
    ['venue.html', 'yt-venue.html', 'dist/venue.js', 'dist/yt-venue.js'],
  ];
  const ytCv = readFileSync(resolve(root, 'extension-youtube/comeview.html'), 'utf8');
  const cssM = /<style>\/\* YouTube 版: [\s\S]*?<\/style>\n/.exec(ytCv);
  if (!cssM) throw new Error('extension-youtube/comeview.html に YouTube 版の CSS がありません(build-youtube-sidepanel-html.mjs が変わった?)');
  for (const [from, to, js, ytJs] of pages) {
    const src = readFileSync(resolve(root, 'extension', from), 'utf8');
    const tag = `<script src="${js}"></script>`;
    if (src.split(tag).length !== 2) throw new Error(`${from} に ${tag} が1つではありません(ニコ生版の形が変わった?)`);
    let out = src.replace(tag, `<script src="${ytJs}"></script>`);
    if (from === 'comeview.html') out = out.replace('</head>', `${cssM[0]}</head>`);
    if (from === 'popup.html') out = ytPanelPrePaint(out);
    out = out.replace(
      '</html>',
      `<!-- このファイルは scripts/youtube-build.mjs の生成物です(本体に同梱する YouTube 版・ニコ生版 extension/${from} の完全コピー)。直接直さないでください。 -->\n</html>`,
    );
    const path = resolve(root, 'extension', to);
    let prev = '';
    try {
      prev = readFileSync(path, 'utf8');
    } catch {
      /* 初回 */
    }
    if (prev !== out) writeFileSync(path, out, 'utf8'); // 変わらなければ書かない(生成物の掟)
  }
}
