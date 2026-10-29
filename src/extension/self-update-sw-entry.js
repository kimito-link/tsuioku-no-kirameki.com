// self-update-sw-entry.js — 開発版の拡張が、拡張のフォルダの新しい版に自分で入れ替わる(v0.1.1802)。
//   background.js(直書きクラシック SW)は ES import できないので、IIFE バンドルにして importScripts で読む。
//   中身はキットの写し(./self-update.js・web-ios-android templates/extension-self-update)。直すときはキットを先に直す。
import { SELF_UPDATE_ALARM, checkForNewVersion, scheduleSelfUpdateCheck } from './self-update.js';

globalThis.__nlsSelfUpdate = { SELF_UPDATE_ALARM, checkForNewVersion, scheduleSelfUpdateCheck };
