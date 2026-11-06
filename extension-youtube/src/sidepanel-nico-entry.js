// sidepanel-nico-entry.js — YouTube 版サイドパネル = ニコ生版の本物 popup-entry.js をそのまま動かす。
// ★順番が大事: 入口の差し替え(ytNicoShim)を先に評価してから、ニコ生版の本体を読み込む。
import './ytNicoShim.js';
import '../../src/extension/popup-entry.js';
