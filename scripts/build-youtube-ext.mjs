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
  // 読む前に消えた吹き出し(押し出し・寿命)の声は列から外す(venue-inline-entry.js の __ytDropVoiceKey・会議 2026-11-05)
  src = replaceOnce(src, '    if (!bubble || bubble.removed) return;\n    bubble.removed = true;\n', '    if (!bubble || bubble.removed) return;\n    bubble.removed = true;\n    if (bubble.voiceState === \'pending\' && bubble.speechKey) { try { /** @type {any} */ (globalThis).__ytDropVoiceKey?.(bubble.speechKey); } catch { /* 声の後始末の失敗で描画を止めない */ } }\n', '消えた吹き出しの声');
  // 吹き出しを出し終えてから選ぶ(ニコ生版は吹き出しより先に選んでいた)
  src = replaceOnce(src, '      updatePickupBanner(null);\n    }\n    // ユーザー方針「しゃべった人を席に出して吹かせる」', '      queueMicrotask(() => updatePickupBanner(null));\n    }\n    // ユーザー方針「しゃべった人を席に出して吹かせる」', 'PICK UP を吹き出しの後に');
  return src;
}

// 会議(2026-11-05): VOICEVOX が混んで PC の声に切り替わると、戻るには速い合成が5回続く必要があるのに、PC の声の間は
//   30秒に1回しか VOICEVOX を確かめないので、原因が消えても戻るまで最短2分半かかっていた(PC 実測 約3分)。
//   YouTube 版だけ確かめる間隔を6秒にする(短い「てすと」1回=エンジンの邪魔は小さい・二重に頼まない仕組みはそのまま)。
//   ニコ生版は審査後に同じ直し。
function setupLightProbePatch(b) {
  // 0.1.95: 声の前後の無音を VOICEVOX 既定の0.1秒→0.05秒に。1件あたり約0.1秒短くなり、
  //   合成の手間も同じだけ減る(会議 2026-11-05「もっとテンポよく」)。ニコ生版は審査後に同じ直し。
  b.onLoad({ filter: /src[\\/]lib[\\/]voicevoxClient\.js$/ }, (args) => ({
    contents: replaceOnce(
      readFileSync(args.path, 'utf8'),
      '    audioQuery.outputStereo = false;\n',
      '    audioQuery.outputStereo = false;\n    audioQuery.prePhonemeLength = 0.05;\n    audioQuery.postPhonemeLength = 0.05;\n',
      '声の前後の無音'
    ),
    loader: 'js',
    resolveDir: dirname(args.path),
  }));
  b.onLoad({ filter: /src[\\/]lib[\\/]voiceLightFallback\.js$/ }, (args) => ({
    contents: replaceOnce(readFileSync(args.path, 'utf8'), 'export const LIGHT_VOICE_PROBE_INTERVAL_MS = 30000;', 'export const LIGHT_VOICE_PROBE_INTERVAL_MS = 6000;', 'PC の声から戻る確かめの間隔'),
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
const ytScreenPlugin = {
  name: 'yt-screen',
  setup(b) {
    setupYtDefaultIconTier(b);
    setupLagNoticePatch(b);
  },
};

// 0.1.102(2026-11-05 りんく画面「読み上げが約19秒遅れています」): 待ちが0件なのに遅れの案内が出ていた。
//   ニコ生版は「前に出していた」ときだけ待ち0で消すので、開き直した直後(前に出していない)は、古い平均(受信→キュー)が
//   大きいだけで待ち0でも出てしまう。待ちが0件なら遅れていないので出さない。ニコ生版にも後で同じ直し。
function setupLagNoticePatch(b) {
  b.onLoad({ filter: /src[\\/]lib[\\/]voiceLagNotice\.js$/ }, (args) => ({
    contents: replaceOnce(
      readFileSync(args.path, 'utf8'),
      '  if (Number.isFinite(queueNow) && queueNow <= 0 && prevShown) return { shown: false, lagMs, text: \'\' };',
      '  if (Number.isFinite(queueNow) && queueNow <= 0) return { shown: false, lagMs, text: \'\' };',
      '待ち0件なら遅れの案内を出さない'
    ),
    loader: 'js',
    resolveDir: dirname(args.path),
  }));
}

const ytVenueLiveIdPlugin = {
  name: 'yt-venue-live-id',
  setup(b) {
    setupLightProbePatch(b);
    setupYtDefaultIconTier(b);
    setupLagNoticePatch(b);
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
    setupLightProbePatch(b);
    setupYtDefaultIconTier(b);
    setupLagNoticePatch(b);
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
    plugins: [ytScreenPlugin],
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
    plugins: [ytScreenPlugin],
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
    plugins: [ytScreenPlugin],
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
