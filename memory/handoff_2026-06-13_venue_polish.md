# 引き継ぎ: 会場モード仕上げ(2026-06-13・コンテキスト限界で中断)

## 現在地(全て push 済み・ブランチ feature/broadcaster-reputation-check)
会場モードを「本物のライブ会場」へ大幅改善。最新 v0.1.714。
- v0.1.708 全画面オーバーレイ化 / v0.1.709 全員ゆっくり顔 / v0.1.710 3Dひな壇
- v0.1.711 発言吹き出し+しゃべった人を席に / v0.1.712 実サムネ補強+匿名観客顔つき
- v0.1.713 明るい背景(配信映像透過)+しゃべった匿名アリーナ昇格して吹き出し
- v0.1.714 読み上げ囁き声除外(isWhisperStyleName)
- 純関数: venueSeats.js / venueSpeech.js / venueAvatar.js(テスト計88+全緑)
- UI: src/extension/venueBar.js(全部入り・content からのみ)
- 正本: memory/reference_venue_fullscreen_meeting.md(仕上げ会議の確定1-4を追記済み)

## ✅ 完了(実機で確認済み・人気番組lv350706736)
- サムネ補強(enrichVenueRowsWithProfileAvatars・nls_user_comment_profile_v1)
- 匿名を観客席にゆっくり顔(collectAudienceFaceUserIds・cap120)
- しゃべった匿名をpromoteUserIdsでアリーナ昇格→頭上に吹き出し(実況は匿名主体=これが本質)
- primeEmit=開いた瞬間に直近3件吹き出し
- 配信映像が透ける明るい背景(.nlsb-stage の background を半透明+ステージ照明radial-gradient)
- 読み上げ囁き声除外

## 🔴 次セッションで直す(ユーザー最新指摘・スクショ lv350741766)
### 1. サムネが出ない番組がある
- 症状: lv350741766 で前列(ザビッ!/隣の家のねこ/Quma/ひぐちゃん/はるまき/サトル)が全部ゆっくり顔。実サムネが出ない。
- 原因候補: ①この番組でプロファイルキャッシュ(nls_user_comment_profile_v1)にまだ avatarUrl が溜まっていない(記録が浅い・観測前)②avatarObserved の昇格タイミング③enrichVenueRowsWithProfileAvatars が profileMap を正しく読めていない可能性
- 確認: status.html を新規タブで開き chrome.storage.local.get('nls_user_comment_profile_v1') の中身を見て、その番組の発言者 userId に avatarUrl が入っているか確認。入っていれば enrich/表示側、入っていなければデータ蓄積タイミングの問題。
- ⚠️ 注意: lv350706736(人気番組)では実サムネが7人出た実績あり=コード自体は動く。番組/タイミング依存の可能性が高い。

### 2. 観客席の帯が大きすぎて配信映像を隠している(ユーザー指摘)
- 症状: 観客席(ゆっくり顔120人)が画面上部を大きく占め、せっかく透けている配信映像が隠れて見えない。
- 対策案: ①観客席を小さく(顔サイズ32→20px等)②観客席の高さを抑える(数行→1-2行に)③観客席を画面端/下部に寄せて配信映像エリアを空ける ④顔つき上限を120→60等に減らす。ユーザーは「配信画面が無駄に見えなくなってる」と不満=映像を活かしたい。
- 該当CSS: venueBar.js の .nlsb-audience / .nlsb-audience-face / .nlsb-seating の grid-template-rows。

## 残タスク(任意・未着手)
- 盛り上がり演出PR-c(発言で跳ねる+盛り上がりメーター)/PR-d(ギフト着弾canvas)/PR-e(スポットライト)
- ⑤CWSアップロード(ユーザー操作・ZIPは0.1.714で作り直し)
- SWモード既定ON昇格(既知問題5診断+PR1-c)

## 実機検証メモ
- 過疎番組(NHK実況lv350687922等)は新着が遅く吹き出しが稀=人気番組(ランキング上位)で検証すべき
- 拡張reload連打でSW増殖→Chrome詰まる。適度にChrome再起動
- status.htmlページ(別タブ)から chrome.storage.local を読むのが安定(watch tabのMAIN worldは不可)
- 役割分担: 設計/純関数核=司令塔、UIガワ=Codex(codex-impl・stdin パイプで起動)、検証=chrome-devtools-mcp
