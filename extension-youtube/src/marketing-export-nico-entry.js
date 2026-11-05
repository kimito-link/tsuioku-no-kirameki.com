// marketing-export-nico-entry.js — ニコ生版のマーケ画面(本物 marketing-export-entry.js)を YouTube の記録で動かす入口。
// sidepanel-nico-entry.js と同じ型: 先に ytNicoShim(データの入口の差し替え)、次にニコ生版の本物。
import './ytNicoShim.js';
import '../../src/extension/marketing-export-entry.js';
