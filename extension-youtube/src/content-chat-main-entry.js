// content-chat-main-entry.js — ページ自身の世界に入る束の入口。
// チャット欄の顔の印（content-chat-main.js）と、同時視聴者数（ytPageViewerReader.js）を同じ束にする。
import '../content-chat-main.js';
import { startYtPageViewerReader } from '../../src/lib/youtube/ytPageViewerReader.js';
import { installYtCommentPhotoTagger } from '../../src/lib/youtube/ytCommentPhotoTag.js';

startYtPageViewerReader();
// v0.1.2247: 動画のコメント欄の、まだ読み込まれていない顔の URL を属性に写す(合図が来たときだけ・ytCommentPhotoTag.js)
installYtCommentPhotoTagger(typeof window !== 'undefined' ? window : null);
