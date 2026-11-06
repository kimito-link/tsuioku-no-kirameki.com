// ytMergedIsolationBoot.js — 本体に同梱した YouTube 版の画面・視聴ページの入口で、いちばん先に動く仕切り。
//   scripts/youtube-build.mjs が本体向けの束(extension/dist/yt-*.js)にだけ inject する(単体の YouTube 版には入らない)。
//   中身は src/lib/youtube/ytMergedIsolation.js。
/* global chrome */
import { installYtMergedIsolation } from '../../src/lib/youtube/ytMergedIsolation.js';

installYtMergedIsolation({
  chrome: typeof chrome !== 'undefined' ? chrome : undefined,
  indexedDB: typeof indexedDB !== 'undefined' ? indexedDB : undefined,
});
