// venue-nico-entry.js — ニコ生版の会場モード(本物 venue-entry.js)を YouTube の記録で動かす入口。
// comeview-nico-entry.js と同じ型: 先に ytNicoShim(データの入口の差し替え)、次にニコ生版の本物。
import './ytNicoShim.js';
import '../../src/extension/venue-entry.js';
