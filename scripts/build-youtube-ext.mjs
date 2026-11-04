// build-youtube-ext.mjs — YouTube Live 試作拡張（extension-youtube/）の esbuild バンドルスクリプト
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// サイドパネルの HTML はニコ生版 popup.html から丸ごと写して作る(先に作っておく)
const { copyReferencedImages } = await import('./build-youtube-sidepanel-html.mjs');

// ニコ生版 popup-entry.js が使う定数(scripts/build.mjs の popupDefine と同じ名前)。
// 版は YouTube 版の manifest の版にする(ニコ生版の「読み込み中の版とファイルの版がズレています」の比べ先)。
const PKG_VERSION = JSON.parse(readFileSync(resolve(root, 'extension-youtube/manifest.json'), 'utf8')).version;
const popupDefine = {
  NL_BUILD_ID: JSON.stringify(`yt-${new Date().toISOString().slice(0, 16)}`),
  NL_DEV_HOTRELOAD: 'false',
  NL_RELEASE: 'false',
  NL_BUNDLE_VERSION: JSON.stringify(PKG_VERSION),
};

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
  // 吹き出しを出し終えてから選ぶ(ニコ生版は吹き出しより先に選んでいた)
  src = replaceOnce(src, '      updatePickupBanner(null);\n    }\n    // ユーザー方針「しゃべった人を席に出して吹かせる」', '      queueMicrotask(() => updatePickupBanner(null));\n    }\n    // ユーザー方針「しゃべった人を席に出して吹かせる」', 'PICK UP を吹き出しの後に');
  return src;
}

const ytVenueLiveIdPlugin = {
  name: 'yt-venue-live-id',
  setup(b) {
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
const ytVenuePickupPlugin = {
  name: 'yt-venue-pickup',
  setup(b) {
    b.onLoad({ filter: /src[\\/]extension[\\/]venueBar\.js$/ }, (args) => ({
      contents: patchVenueBarForPickup(readFileSync(args.path, 'utf8')),
      loader: 'js',
      resolveDir: dirname(args.path),
    }));
  },
};
const patchVenueBarForPickup = patchVenueBarPickupOnScreen;

const common = {
  bundle: true,
  format: 'iife',
  target: ['chrome114'],
  charset: 'utf8',
  logLevel: 'info',
};

await Promise.all([
  build({
    ...common,
    entryPoints: [resolve(root, 'extension-youtube/src/content-chat-entry.js')],
    outfile: resolve(root, 'extension-youtube/content-chat.js'),
    banner: {
      js: '// content-chat.js — YouTube Live チャット欄 DOM の監視・コメント取得バンドル\n/* eslint-disable */',
    },
  }),
  build({
    ...common,
    entryPoints: [resolve(root, 'extension-youtube/src/background-entry.js')],
    outfile: resolve(root, 'extension-youtube/background.js'),
    banner: {
      js: '// background.js — YouTube Live コメントのローカル記録・読み上げキュー管理バンドル\n/* eslint-disable */',
    },
  }),
  build({
    ...common,
    // ★ニコ生版の本物 popup-entry.js を、YouTube の記録を読む入口(ytNicoShim)つきで束ねる
    entryPoints: [resolve(root, 'extension-youtube/src/sidepanel-nico-entry.js')],
    outfile: resolve(root, 'extension-youtube/sidepanel.js'),
    target: ['chrome100'],
    define: popupDefine,
    banner: {
      js: '// sidepanel.js — ニコ生版 popup-entry.js(本物)+ YouTube の記録を読む入口のバンドル\n/* eslint-disable */',
    },
  }),
  build({
    ...common,
    // ★ニコ生版の本物 marketing-export-entry.js(マーケ画面)を、同じ入口(ytNicoShim)つきで束ねる
    entryPoints: [resolve(root, 'extension-youtube/src/marketing-export-nico-entry.js')],
    outfile: resolve(root, 'extension-youtube/marketing-export.js'),
    target: ['chrome100'],
    define: popupDefine,
    banner: {
      js: '// marketing-export.js — ニコ生版 marketing-export-entry.js(本物)+ YouTube の記録を読む入口のバンドル\n/* eslint-disable */',
    },
  }),
  build({
    ...common,
    // ★ニコ生版の本物 comeview-entry.js(コメビュ)を、同じ入口(ytNicoShim)つきで束ねる
    entryPoints: [resolve(root, 'extension-youtube/src/comeview-nico-entry.js')],
    outfile: resolve(root, 'extension-youtube/comeview.js'),
    target: ['chrome100'],
    define: popupDefine,
    banner: {
      js: '// comeview.js — ニコ生版 comeview-entry.js(本物)+ YouTube の記録を読む入口のバンドル\n/* eslint-disable */',
    },
  }),
  build({
    ...common,
    // ★ニコ生版の本物 venue-entry.js(会場モード)を、同じ入口(ytNicoShim)つきで束ねる
    entryPoints: [resolve(root, 'extension-youtube/src/venue-nico-entry.js')],
    outfile: resolve(root, 'extension-youtube/venue.js'),
    target: ['chrome100'],
    define: popupDefine,
    plugins: [ytVenuePickupPlugin],
    banner: {
      js: '// venue.js — ニコ生版 venue-entry.js(本物)+ YouTube の記録を読む入口のバンドル\n/* eslint-disable */',
    },
  }),
  build({
    ...common,
    // 視聴ページの「🏟 会場モード」= ニコ生版 venueBar.js の mountVenueBarButton をそのまま視聴ページで動かす
    entryPoints: [resolve(root, 'extension-youtube/src/venue-inline-entry.js')],
    outfile: resolve(root, 'extension-youtube/venue-inline.js'),
    target: ['chrome100'],
    define: popupDefine,
    plugins: [ytVenueLiveIdPlugin],
    banner: {
      js: '// venue-inline.js — ニコ生版の視聴ページの会場モード(venueBar.js 本物)+ YouTube の記録を読む入口のバンドル\n/* eslint-disable */',
    },
  }),
  build({
    ...common,
    entryPoints: [resolve(root, 'extension-youtube/src/offscreen-entry.js')],
    outfile: resolve(root, 'extension-youtube/offscreen.js'),
    banner: {
      js: '// offscreen.js — YouTube Live VOICEVOX 読み上げ常駐再生 Offscreen Document バンドル\n/* eslint-disable */',
    },
  }),
]);

// popup-entry.js の中で使っている画像も写す
console.log(
  `画像を ${['sidepanel.js', 'marketing-export.js', 'comeview.js', 'venue.js'].reduce((n, f) => n + copyReferencedImages(readFileSync(resolve(root, 'extension-youtube', f), 'utf8')), 0)} 枚写しました`,
);
