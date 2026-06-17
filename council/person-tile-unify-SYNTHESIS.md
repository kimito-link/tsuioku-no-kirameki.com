# 人物タイル正本化＋アクティブユーザー全員着席 — 統合設計（SYNTHESIS）

正本。会議4応答(groq gpt-oss-120b / groq llama-3.3-70b / gemini-2.5-flash / openrouter gpt-oss-120b)＋司令塔の実コード裏取り。日付 2026-06-17。

## ユーザーの確定方針（このセッションで固めた）
- **アクティブユーザー＝コメント/ギフト/広告のいずれかでアクションし、userId が観測できた人。匿名(a:xxx)か数値IDかは無関係。全員が会場の主役。**
- popup の応援アイコン列に出る人は、そのまま会場の席にも出る（顔ぶれ一致）。
- 来場者数（ニコ生公式の「来場 N人」）は PV 的な延べ数。無言の通りすがり込みで userId が取れない→席には出せない。→**背景群衆 Canvas の密度**で表現（席とは別レイヤー）。

## 会議の一致点（4応答すべて同方向）
1. 人物タイル（丸サムネ）を**1つの正本**にして popup/venue で使い回す。文脈別の装飾（吹き出し・読み上げ・ギフト）だけ被せる。
2. `UserLaneCandidateFromStorage` を**読み取り専用で拡張**し、userId キーで comments/gifts/ads を畳み込む（新規 storage 書き込みゼロ）。
3. hot path は**増分更新**（初回1回＋差分マージ）で全件再走査を避ける。
4. **段階導入**：①タイル正本化→popup ②venue席組込み＋150席 ③吹き出し/読み上げ/ギフト ④背景群衆を「超過アクティブ」と「来場者数(PV)」に分離。

## 司令塔の実コード裏取り＝会議の前提を訂正（ハルシネ除去）
- ⚠️ **このプロジェクトは React ではない**。素の DOM 操作（popup=`paintStoryUserLaneDomFilled`、venue=`buildVenueSeating`→ひな壇 DOM）。会議の `useMemo`/`useUserProfile`/`ErrorBoundary` 前提は丸ごと使えない→「純関数＋素DOM描画関数の正本化」に翻訳する。
- ⚠️ **匿名除外はもう撤回済み**。`venueParticipantKey`(venueSeats.js:77) は `userId があれば匿名でも席キー u:${uid} を返す`（2026-06-14 方針「匿名もいれたほうが満員感」）。会議が言う「匿名除外分岐を削除」は**対象が存在しない**。
- ⚠️ **データ集約 `userLaneCandidatesFromStorage` は既に popup/venue 共通**。`commentCount`/`giftCount` も userId 単位で既に持つ(:171-176)。未共通化なのは**描画だけ**。
- ⚠️ **`.comment-number` 消失問題（別件・実DOM確証済み）**: 現行ニコ生はコメント行から番号セルを外した(`role=grid` の data-grid・本文は `.comment-text`)。`parseNicoLiveTableRow`(nicoliveDom.js:822) が「番号セル＋本文セル両方必須」で DOM 観測コメントを全捨て→`visible:0`。これは userId が乗らない→席にも出ない遠因。本タイル設計とは別タスクだが関連（userId 無し行は席に出せない）。

## 「会場に出ない」の真因（実コードで確定）
席資格(`venueParticipantKey`)は匿名込みで `u:${uid}` を返す＝**userId を持つ人は全員席の候補**。それでも popup と顔ぶれが食い違うのは席資格より後ろ：
1. **userId が乗らない行**（DOM観測の no無し/userId無し。`.comment-number` 消失で visible 経路が死亡）→ venueParticipantKey が null。
2. **席数150上限＋表示間引き**（`visibleSeatCount`/`selectStableVisibleMembers`）で1画面/150席に収まらない分が表示落ち。
3. **描画が別物**（popup タイル vs venue 席）でドリフトしうる。

## 統合設計（素DOMに即した1案）

### データ層（第1の正本・純関数）
- `userLaneCandidatesFromStorage` の戻りに、読み取り専用で `recentComments[]`（最新N件）/`recentGifts[]`/`contributionScore?` を **userId 畳み込み**で付与（または別の純関数 `buildPersonProfilesFromRows(rows, liveId)` を新設し Map<userId, PersonProfile> を返す）。
- 新規 storage 書き込みゼロ＝引数 rows（既に IndexedDB から読んだもの）を畳み込むだけ。
- 有界：recentComments は最新5件等で cap。全件は持たない（重くしない）。
- 増分：初回1回構築→以降は新規 chunk seq 分だけ差分マージ（venueBar が既にやっている `mergeUserLaneAggregates` と同じ流儀）。

### 描画層（第2の正本・素DOM部品）
- 「丸サムネ＋ID＋ニックネーム」を描く**1つの DOM ビルダー関数** `buildPersonTileEl(profile, { mode })` を新設（src/lib/personTileDom.js 等）。
- popup（`paintStoryUserLaneDomFilled`）も venue（席ノード生成）も**この関数でタイル本体を作る**。横並び/座席座標などレイアウトは呼び出し側が担う（タイル本体は共通）。
- venue 専用の吹き出し・読み上げ・ギフト演出は、タイル要素に**被せる**（タイル本体は触らない）。

### 来場者数（背景群衆）
- 席＝アクティブユーザー（顔が見える）、背景群衆 Canvas（既存 crowdCanvas/drawCrowdOnCanvas）＝来場者数 PV（顔は出ない密度）の二層。
- 現行「ほか観客 N人」テキストは PV と紛らわしい→「席に表示しきれない超過アクティブ N人」と「来場 N人(PV)」に**意味を分離**してラベルを明確化。

## 段階導入（退化最小・星野ロミ「落とさない」最優先）
- **第1コミット**: データ層だけ。`buildPersonProfilesFromRows`（純関数＋characterization test）を新設。挙動変えず、まず「userId に comments/gifts/ads を畳み込む正本」を作る。既存 UI は不変。
- **第2コミット**: 描画タイルビルダー `buildPersonTileEl` を切り出し、まず popup を置換（見た目不変を characterization で担保）。
- **第3コミット**: venue 席のタイル生成を同ビルダーに統一。popup と顔ぶれ一致を確認。150席上限/入れ替えは維持。
- **第4コミット**: 来場者数の二層化（超過アクティブ vs PV）とラベル明確化。
- 別タスク（並行可）: `.comment-number` 消失で DOM観測コメントが全捨ての件（nicoliveDom の番号必須を緩める）。userId 無し行を救うが誤検知ガード必須。

## 退化ガード（厳守）
- 記録本体(IndexedDB/chunk/tail)不可侵・新規 storage 書き込みゼロ。
- venue hot path：全件再走査しない（増分）・上限 cap・1フレームの DOM 変更数を抑える。
- 読み上げのゼロ音声回帰なし／画面溢れは既存 selectBubblesToEvict+BUBBLE_MAX 維持／配信者アイコン取り違え(v0.1.793)再発なし。
- popup の匿名段・診断パネル不変。
- 各 commit で verify:cc 全緑・dist 同梱確認。
