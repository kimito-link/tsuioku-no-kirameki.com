# 会議 SYNTHESIS: 星野ロミ型「見せる側は同じ鏡を読むだけ」に揃える(single source of truth)

> ユーザー指摘「星野ロミ理論つかってないんじゃ?」。司令塔が実コードで土台を作り 3視点で独立検証→統合。

## 判定: 1件差=both / 二系統=two_sources_confirmed

## ユーザーへ正直に
応援レーン・コメント鏡は「見せる側が鏡を読むだけ」で実装済みですが、北極星レーン（貢献度・広告ランキング）の passive での読み込み経路が完全に欠けていました。applyNorthStarMirrorForPassive を新規実装し、passive の初期化と onChanged 監視に組み込むことで、星野ロミ理論を北極星レーンにも適用します。

## 根の要約
星野ロミ理論（「作る人」と「見せる人」を分け、見せる側は同じ1つの鏡を読むだけ）は、応援レーン・コメント鏡では実装済み（passive で applyLaneMirrorForPassive / applyCommentTimelineMirrorForPassive が動く）だが、北極星レーン（貢献度・広告ランキング）では実装されていない。popup は北極星鏡を publishNorthStarMirror で焼くが、passive では鏡を読む経路（apply関数・onChanged監視）が完全に欠けている。v0.1.964 の診断で「北極星描画関数が呼ばれない」=鏡はあるが読む側がいない状態。1件差（拡張7≠鏡6）は鮮度差（koken 30秒更新、content の今 vs popup の2分前）で説明可能。

## passive 北極星の欠落と対策
applyNorthStarMirrorForPassive を popup-entry.js に実装（applyLaneMirrorForPassive:5424-5483 と同型）。storage.local から KEY_NORTH_STAR_MIRROR を read し、restoreNorthStarMirrorRows で各レーン行を取り出し、既存の officialDomRankingRowsToStripRooms / paintTopSupportRankStyleIntoElement で描く。initPopup末尾の INLINE_PASSIVE ブロック(21354-21389)の applyCommentTimelineMirrorForPassive の直後に 初回呼び出し + onChanged リスナーで KEY_NORTH_STAR_MIRROR 監視を追加。

## 第1段の最小修正
popup-entry.js に applyNorthStarMirrorForPassive 関数を追加し、passive の初期化と onChanged リスナーに組み込む。応援レーン・コメント鏡と同じ「鏡を読んで描く」構造に統一。popup refresh()/paint の read path・content koken 直読み・鏡 publish logic は一切不改変。

### なぜ安全か(地雷ゼロ)
passive で北極星レーン（貢献度・広告）が鏡から描かれていない実装欠落を修復。星野ロミ理論「見せる側は同じ鏡を読むだけ」を応援レーン・コメント鏡と同じく北極星レーンにも適用。実装は低リスク＝storage read のみ、既存関数の流用、新規 write/inject/fetch なし。

### テスト方針
実機 v0.1.964 の応援プレビュー(passive)を開き、northStarRenderProbe.contribResolveCalls と activePath が 0 から増えることを確認。storyUserLaneRenderProbe.activePath が "mirror" に変わり、描画関数が呼ばれる状態になることを確認。貢献度・広告レーンの行が鏡の内容で表示されることを目視確認。liveviewPublishSelfDiag で「拡張 ≠ 鏡」の誤検警告が鮮度差で保留されることを確認（第1段では根治ではなく passive のレンダリング経路復旧のみ）。

## 「3画面+診断が同じ鏡を読む」に必要な変更(優先順)
1. popup-entry.js:21362 の applyCommentTimelineMirrorForPassive() 直後に void applyNorthStarMirrorForPassive() を追加
2. popup-entry.js:21382-21384 の KEY_COMMENT_TIMELINE_MIRROR onChanged ハンドラーの直後に KEY_NORTH_STAR_MIRROR ハンドラーを追加
3. applyNorthStarMirrorForPassive 関数をpopup-entry.js の applyCommentTimelineMirrorForPassive:5493 の直後に実装（storage read のみ・描画は既存関数を流用）

## 段階方針
【第1段（v0.1.965 想定）】applyNorthStarMirrorForPassive を実装。passive で北極星鏡を鏡から描く経路を復旧。目標：応援プレビューで貢献度・広告ランキングが見える状態に。【第2段以降】整合チェック(liveviewPublishSelfDiag.js:150-168)を「拡張 apiRows」から「鏡の rows 件数」に統一し、二系統の「作る人」を一人に絞る(=同語反復で 1件差を構造的に消す)。当面は鮮度差での保留警告で誤検知を抑制(既実装)。

## 到達条件
正確。実コード確認により以下が確証されました：1) content-entry.js:6204 で content が koken API を直読み(apiRows=7)、2) popup-entry.js:9351-9395 + officialContributionRankingResolver.js:115 で popup が storage から読み直して鏡を焼く(rows=6)、3) liveviewPublishSelfDiag.js:150-168 が「二系統の apiRows」を突き合わせている、4) popup-entry.js:21354-21389 の passive 配線で applyLaneMirrorForPassive と applyCommentTimelineMirrorForPassive は呼ばれるが applyNorthStarMirrorForPassive は存在しない(関数なし・監視なし)。鮮度差で 1件差は説明可能（koken 30秒自動更新）。
