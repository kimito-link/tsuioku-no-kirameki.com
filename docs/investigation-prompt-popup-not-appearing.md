# 調査依頼プロンプト — Chrome 拡張の inline popup が出なくなる問題

> このファイルは複数 AI（Codex / Gemini / Grok / Kimi / GPT-5.5 など）に
> 並行で投げる調査依頼テンプレ。コピペで使う。

## 状況

私は単独で Chrome 拡張「君斗りんくの追憶のきらめき」を運用している。
ニコ生（niconico live）の watch ページに inline popup（iframe）を差し込んで、
コメントの記録・可視化を行う MV3 拡張。

**頻発する症状（再発防止策がほしい）:**
1. 拡張のバンプ（manifest.json の version 更新）後、Chrome をリロードしても
   旧バージョンが残り続ける（build 忘れ／worktree 同期漏れが過去に起きた）
2. 拡張のバンプ後、バージョンは更新されたが **inline popup（watch ページ内の
   フローティングパネル）が表示されなくなる**

特に 2 が今夜発生し、**0.1.100 → 0.1.101 で 1 行差分の変更**を入れただけで再現。
0.1.102 で revert したが popup が戻らない実機状態。

## 環境

- OS: Windows 11
- Chrome: 最新安定版
- ビルド: esbuild、`scripts/build.mjs` でバンドル
- 配信元: git worktree `flamboyant-perlman-a893c9`
  （Chrome は extension load を unpacked でこの worktree から行う）
- 開発元: 別 worktree `gallant-haslett-XXXXXX` 等で commit、main 反映や
  flamboyant への ff-merge は手動

## バンドル構成

`extension/dist/` 配下に `popup.js`, `content.js`, `page-intercept.js` が
esbuild で生成される。`extension/popup.html` が popup.js を読み込む。
content.js が watch ページに inline iframe を差し込む。

## 0.1.101 で入れた diff（revert 済みだが popup は戻らない）

`src/lib/storyUserLaneDisplaySrc.js`:

```diff
+import { isAvatarUrlForUserId } from '../shared/avatar/avatarUrlGuard.js';

 export function userLaneHttpForTilePick(userId, primaryHttp, storedRaw) {
   const preferred = supportGridPersonalThumbPreferredUrl(...);
-  if (preferred) return preferred;
+  if (preferred && isAvatarUrlForUserId(preferred, userId)) return preferred;
   const h = String(primaryHttp ?? '').trim();
   if (!isHttpOrHttpsUrl(h)) return '';
+  if (!isAvatarUrlForUserId(h, userId)) return '';
   return h;
 }
```

`isAvatarUrlForUserId` は `src/shared/avatar/avatarUrlGuard.js` の純粋関数で
URL 内 uid と entry uid の一致を返す（false 時は空に降格させる用）。
これだけで全 2231 unit tests PASS、lint clean、build 成功。
それでも実機で popup が起動しなくなった。

## 仮説（自信度低）

A. **esbuild のサイレントバンドル不整合** — import 追加で何かの変数巻き上げが
   崩れた？  
B. **Chrome 拡張のキャッシュ** — 更新ボタンでは反映されず、削除→再追加
   しないと dist が再ロードされない経路がある？  
C. **niconico の CSP が新しくなった** — iframe 差し込みが時々ブロックされる
   らしい兆候。  
D. **chrome.storage / IDB の整合性違反** — 何か古いデータ構造で popup-entry.js
   が throw してしまう？  
E. **content-entry.js の inline-popup-host 差し込みロジックが
   特定状態で無音失敗** — 過去にもあった。

## 質問（AI に投げる内容）

1. MV3 で inline popup（watch ページ内 iframe）が「manifest を bump しただけで
   出なくなる」典型パターンは何があるか？再発防止チェックリストがほしい
2. esbuild でバンドルされた popup.js が実機で起動しない時の調査手順を、
   chrome://extensions と DevTools のどちらでどう見るのが最短か
3. 「unpacked extension をリロードしても新しい dist が反映されない」現象の
   根本原因と再発防止策
4. inline iframe を watch ページに差し込む extension のベストプラクティス
   （CSP / sandbox / referrer / focus 管理）と、niconico の CSP 変更で詰まる典型
5. 単独運営の小規模拡張で「リリース毎に popup 起動を最低限保証する CI」を
   作るとしたら何を test するべきか（Playwright / puppeteer / vitest どれが向く？）

## 参考ファイル（依頼先 AI に必要なら共有）

- `extension/manifest.json` — MV3 manifest
- `src/extension/popup-entry.js` — popup 本体（10000 行超）
- `src/extension/content-entry.js` — inline iframe 差し込みロジック
- `scripts/build.mjs` — esbuild build
- `src/lib/storyUserLaneDisplaySrc.js` — 0.1.101 で触ったファイル

## 期待する回答

- 仮説 A〜E の各々の確からしさ（どれが先に潰すべきか）
- 再発防止のための **bump 前チェックリスト**（具体的な commands）
- popup 起動最低限保証のための **smoke test** 雛形
- 他の MV3 拡張開発者が踏みがちな同種 trap の事例

---

> 補足: この拡張は CWS でも公開している。「stalled review でも user が
> ローカルロードして動かす」ワークフローが日常。だから extension の
> reload 周りの確実性が極めて重要。
