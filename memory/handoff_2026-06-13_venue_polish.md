# 引き継ぎ: 会場モード仕上げ(2026-06-13)

## 現在地(全て push 済み・ブランチ feature/broadcaster-reputation-check)
会場モードを「本物のライブ会場」へ大幅改善。最新 **v0.1.715**。
- v0.1.708 全画面オーバーレイ化 / v0.1.709 全員ゆっくり顔 / v0.1.710 3Dひな壇
- v0.1.711 発言吹き出し+しゃべった人を席に / v0.1.712 実サムネ補強+匿名観客顔つき
- v0.1.713 明るい背景(配信映像透過)+しゃべった匿名アリーナ昇格して吹き出し
- v0.1.714 読み上げ囁き声除外(isWhisperStyleName)
- **v0.1.715 配信映像セーフエリア+横スクロール根絶+名前にユーザーページリンク(下記)**
- 純関数: venueSeats / venueSpeech / venueAvatar / **nicoUserPage / venueViewport**(テスト計133+全緑)
- UI: src/extension/venueBar.js
- 正本: memory/reference_venue_fullscreen_meeting.md(第3回会議の確定A/B/C+PR分割を追記済み)

## ✅ v0.1.715 で完了(実機 lv350743409 で計測確認済み)
第3回会議(deepseek-r1/gpt-oss/Codex 全員集合)→PR-A/PR-B実装→実機検証まで完遂。
### A: IDアンカー必須(原則適合)
- 座席の名前を `<a href=nicovideo.jp/user/<数値ID> target=_blank rel=noopener>` 化。
  実機=19名にリンク生成・pointer-events:auto でクリック可能(hitTest 通過)を確認。
- 匿名は href なし+「匿名NNN」安定ラベル(anonymousDisplayLabel)。顔だけにしない原則。
- comeviewUserPageUrl を **src/lib/nicoUserPage.js** へ単一ソース化(会場/コメビュ共有)。
### B: 配信映像を見せる+横スクロール根絶(ユーザー実機不満の根治)
- stage-layout を「上=観客帯44px1行 / 中=映像セーフエリア / 下=ひな壇」に再編。
  実機計測=映像セーフエリアが画面の **67%**(1370/2045px)・席は下端23%。配信映像が見える。
- 横スクロールバー根治: tier の width:max-content→width:100%+flex-wrap、seats overflow:hidden。
  実機=seatsHorizontalScroll:false / layoutHorizontalScroll:false(「位置ずれ・変な動き」解消)。
- **src/lib/venueViewport.js**=論理150席保持・同時表示は行に収まる数(実機20席)へ安定選抜。
  直近発言者は必ず表示・席順は元順で安定(ちらつき防止)。観客帯も1行に絞り残りは「ほか観客N人」。

## 🔴 次セッションの残タスク
### C: 会場モードの切り離し(別ウィンドウ移動)= 会議確定済み・未着手
ユーザー要望「会場を切り離して別の場所(OBS/別モニタ)に移動できるように」。
**会議で全員一致=別ウィンドウ独立 venue.html 方式**(comeview.html と同型)。
- 会場のデータ読みは既に全て chrome.storage.local.get 経由(venueBar.js:1007/1060)なので、
  同じ純関数を独立HTMLでそのまま呼べる(liveId は ?lv= 経由に変えるだけ)。
- ⚠️**最大の罠(Codex発見・必読)**:
  1. content script から chrome.windows は直接呼べない→SW経由({type:'NLS_OPEN_VENUE',liveId})必須。
  2. **現行SWは popup.html 以外の自拡張ページを「孤児」として閉じる(background.js:2491)**
     →venue.html を識別して閉じない様に直さないと会場窓が即死。
  3. IDB更新は storage.onChanged を発火しない→tail/summary を通知源にし定期整合も残す。
  4. nls_last_watch_url は複数watchタブ競合→入口から必ず ?lv= を渡す。
- PR分割: C基盤(renderer/data source 共通化+SWのpopup識別改善)→C本体(venue.html新規・
  build/提出スクリプト追加・storage購読・SW経由別窓起動)。詳細は reference 第3回会議。

### #6: ギフト着弾演出(ユーザー要望 2026-06-13・現状改善後に着手)
誰かがギフト/広告を投げたら、その人のアイコンから配信画面へ「ばばばばーっ」と飛ぶアクション。
- ⚠️**重要=ニコニコの実アイテム画像を使う**(バハムートならバハムート・広告なら広告・
  オリジナルアイテムならオリジナルアイテム)。実画像の取得元URLを先に調査。
- 検知元: nls_gift_subapp_history_<lv>(誰が何を)/nls_gift_users_<lv>/nls_event_dom_<lv>。
- 初回フラッシュ防止(開いた時点の過去ギフトを一斉に飛ばさない=venueSpeech と同じ基準
  スナップショット方式)必須。会議確定PR-d(Canvasギフト着弾)と統合。

## 残タスク(任意・未着手)
- 盛り上がり演出PR-c(発言で跳ねる+盛り上がりメーター)/PR-e(スポットライト)
- ⑤CWSアップロード(ユーザー操作・ZIPは0.1.715で作り直し)
- SWモード既定ON昇格(既知問題5診断+PR1-c)

## 実機検証メモ
- 過疎番組(NHK実況等)は新着が遅く吹き出しが稀=人気番組(ランキング上位)で検証すべき
- 拡張reload連打でSW増殖→Chrome詰まる。適度にChrome再起動
- chrome-devtools-mcp: install_extension で extension/ を入れると ID 同一で実機検証可。
  会場のレイアウトは evaluate_script で getBoundingClientRect 計測すると正確(スクショより確実)。
- 役割分担: 設計/純関数核=司令塔、UIガワ=Codex、検証=chrome-devtools-mcp
