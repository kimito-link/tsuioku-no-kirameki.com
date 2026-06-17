# 統合: 星野ロミ式 コンポーネント化・ファクタリング最大化(司令塔の裏取りで1案に収束)

会議 5/12 応答(groq gpt-oss-120b / groq llama-3.3-70b / gemini-2.5-flash / openrouter gpt-oss-120b /
local qwen2.5・ローカル大型は VRAM abort=仕様) + 司令塔の実コード裏取り。

## 会議の一致点(5応答が収束)
1. **分割軸 = 機能 × 関心事(純ロジック / I-O / DOM描画)の混合**。過剰な service/repository 3層は全員否定。
2. **抽出順 = 純ロジック(大きい・変更頻度高・テスト無し)最優先 → I/O → UI描画**。
3. **安全手順 = characterization test 先行 → 1関数ずつ → import差し替えのみ → esbuild同梱確認 → feature-map 断線チェック**。
4. **entry に残す = DOM配線・Chrome API直叩き・イベント登録**(純関数化しない)。
5. **最大の罠(批判役) = モジュールスコープ変数への隠れ依存**(broadcasterUidCache 等を抜くと状態共有が壊れデグレ)。
   次点=循環参照・見せかけ分割で可読性低下。

## 司令塔の裏取りで会議を【2点訂正】(会議はリポ現状を知らない=素材)
### 訂正1: 会議の最優先候補(ndgrDecode/commentChunkStore/statusFormat/blobDownload)は【既に抽出済み】
content-entry.js は既に 180+ の src/lib を import(monotonicCommentCount / ndgrDecode / ndgrChatRows /
commentRecord / statusFormat / commentChunkStore / blobDownload / exportWaitNarration / reportCompleteVoice 等)。
= 純ロジック抽出の文化は成熟済み。残った 17k/21k は『抜きにくいグルー(DOM配線・Chrome API・モジュール状態)』
＋『まだ抜けていない巨大ビルダー』。会議の「デコードを抜け」は周回遅れ。

### 訂正2: 実測で判明した【本当の最優先ターゲット = 巨大ビルダー(診断/スナップショット/HTML生成)】
司令塔が実測(関数ごとの行数)した抜くべき塊(効果の大きい順):

| 順 | ファイル | 関数 | 行数 | 性質 | 抽出先案 |
|---|---|---|---|---|---|
| 1 | popup-entry.js | `buildHtmlReportDocument` (L15794) | **1,482** | HTML文字列ビルダー | src/lib/htmlReport/*(セクション単位で更に分割可) |
| 2 | content-entry.js | `buildGiftDiagnosticsBundle` (L5318) | **889** | 状態→診断オブジェクト | src/lib/giftDiagnosticsBundle.js |
| 3 | content-entry.js | `collectWatchPageSnapshot` (L8152) | **520** | DOM/状態→snapshotオブジェクト | src/lib/watchPageSnapshot.js(DOM読みは関数注入) |
| 4 | content-entry.js | `buildAiSharePageDiagnostics` (L8719) | **381** | 状態→診断オブジェクト | src/lib/aiSharePageDiagnostics.js |
| 5 | popup-entry.js | `computeGiftHistoryNorthStarRoomsContext` (L9186) | **293** | データ集計(純寄り) | src/lib/giftHistoryNorthStarRooms.js |

(※ start/initPopup/refresh/submitComment/paintWatchPopupUi は DOM配線・Chrome API・イベント登録の塊
 =会議4の『entry に残す』対象。無理に抜かない=星野ロミ式やりすぎ防止。)

## 採用する1案(星野ロミ式・最小で最大効果・挙動完全不変)

### 方針
『大きい・純粋寄り・データ/HTML を組み立てて返すだけ』のビルダーを **state 引数化して src/lib へ**。
DOM読み/Chrome API は **関数として注入**(entry 側が渡す)＝純関数化しつつ挙動不変。
過剰な feature/io/ui 3層ディレクトリは作らない(会議 openrouter 案の3層は本リポには過剰=却下)。
既存の『src/lib に純関数 + .test.js』の作法にそのまま乗る(車輪の再発明をしない)。

### 罠(批判役)への対策=本案の肝
抽出対象は `broadcasterUidCache` / `broadcasterIconUrlCache` / `liveId` 等の【モジュール変数を直接参照】する。
そのまま抜くと参照が切れて挙動が変わる。**必ず引数(opts)で渡す**:
```js
// before (entry内・モジュール変数直参照)
function buildGiftDiagnosticsBundle() { ...broadcasterUidCache... }
// after (src/lib・純関数・state は引数)
export function buildGiftDiagnosticsBundle(state) { ...state.broadcasterUid... }
// entry 側は呼ぶだけ
buildGiftDiagnosticsBundle({ broadcasterUid: broadcasterUidCache, broadcasterIconUrl: ..., liveId, ... });
```
循環参照防止=抽出先 lib は entry を import しない(一方向: entry → lib のみ)。

### 安全手順(1関数=1コミット・デグレゼロ)
1. **characterization test 先行**: 抽出対象の現挙動を固定するテストを先に書く(代表入力→期待出力スナップショット)。
2. **state を洗い出す**: 関数が参照するモジュール変数/グローバルを全列挙し、引数(opts)に変換。
3. **src/lib へ純関数として移動** + 既存テストを lib 側へ。
4. **entry は import 差し替えのみ**(呼び出し箇所で state を渡す)。ロジックは1行も変えない。
5. **esbuild バンドル同梱確認**(dist に新コードが入ったか grep)。
6. **feature-map 断線チェック**(`npm run feature-map` で producer/consumer がズレないか)。
7. **verify:cc 全緑** + max-lines ラチェットを**下げる**(抽出後の実値に・『増やす禁止』を守る)。

### やりすぎ防止ライン(星野ロミ式割り切り・会議4一致)
- entry に残す: DOM 要素の生成・イベント登録(addEventListener)・chrome.* 直叩き・MutationObserver 配線・
  モジュール状態の保持(キャッシュ変数そのもの)。
- 抜く: 状態を読んで『オブジェクト/文字列/真偽値を返すだけ』の純粋寄りロジック。
- 1ファイル=1関心。ただし feature/io/ui の3階層ディレクトリは作らない(本リポ規模に過剰)。src/lib フラット + 命名で十分。

## 段階リリース(1版=1〜2関数・必ず緑で push)
- v0.1.807: `buildGiftDiagnosticsBundle`(889行・最も純粋寄り・効果大)を src/lib へ。content-entry が ~900行減。
- v0.1.808: `buildHtmlReportDocument`(1,482行)を src/lib/htmlReport へ(セクション単位)。popup が大幅減・ラチェット緩む。
- 以降: collectWatchPageSnapshot / buildAiSharePageDiagnostics / computeGiftHistoryNorthStarRoomsContext。
- 各版で characterization test + verify:cc 全緑 + max-lines ラチェットを下げる。

## 退行ゼロの担保
記録の永続(IDB/chunk/テール)不変・新 storage 書き込みゼロ・挙動完全不変(引数化のみ・ロジック不変)・
純関数化でテスト追加・feature-map で断線検知・1関数1コミットでロールバック容易。

## 検証観点
抽出後、診断JSON/HTMLレポート/スナップショットの**出力が抽出前とバイト一致**(characterization test)。
実機で記録・popup・会場・状態速報の挙動が完全に同じ。
