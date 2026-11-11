// content-chat-main-entry.js — ページ自身の世界に入る束の入口。
// チャット欄の顔の印（content-chat-main.js）と、同時視聴者数（ytPageViewerReader.js）を同じ束にする。
import '../content-chat-main.js';
import { startYtPageViewerReader } from '../../src/lib/youtube/ytPageViewerReader.js';

startYtPageViewerReader();
