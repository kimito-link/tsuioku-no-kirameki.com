# 設計: 良い資産を「正確に輸入して、ストレスなく使える」にする最小の仕組み

> 設計=Fable(claude-fable-5-1) / 会議素材=無料ハーネス(5体+批判2+統合・質は低く素材扱い) / 裏取り・保存=司令塔(Claude) / 2026-10-06
> 3段構えの手順2の産物。お題(ユーザー確定): 「正確にただしく良い資産を輸入してストレスなく使えるようにする」+「UIUX＝ユーザー体験の最大化」
> 実装ハンドオフ: [asset-import-IMPLEMENTATION-HANDOFF.md](asset-import-IMPLEMENTATION-HANDOFF.md)
> 前段の経緯: [live-to-extension-absorb-MAP/SPEC/IMPLEMENTATION-HANDOFF](live-to-extension-absorb-SPEC.md)(v0.1.1562〜1568)
> ★本書の「推測」表記は未確認。司令塔の裏取り状況は IMPLEMENTATION-HANDOFF の「裏取り結果」を見ること。

## 裏取り(Fable が実コードで確認した事実)

| 項目 | 要点 |
|---|---|
| `src/extension/venueBar.js:1162-1479` | `/* LANE_CSS_SYNC_BEGIN popup.html:1037-1320 ... */`〜`/* LANE_CSS_SYNC_END */`。転写元の行番号をコメントで手書き(2026-08-30に手で更新した履歴=腐る型) |
| `extension/popup.html` | 対応する BEGIN/END マーカーは**無い** |
| `src/lib/laneTilePresentation.parity.test.js` | ①直描画/③鏡復元/②会場 の outerHTML 一致。fixture は attach 関数を通す(**fixture に新フィールドを足し忘れると比較が空振りで緑**) |
| `laneMirror.js toMirrorCell` / `venueLaneMirrorSupply.js composeVenueLaneBuckets` | stats/pulse を個別列挙で引き継ぐ |
| `renderStoryUserLaneDom.js syncStoryUserLaneStatsInPlace` | 「描かない経路」から呼ぶ。コメント自体が「テストは paint 経路しか通らない」と明記 |
| `src/lib/laneTilePresentation.wiring.test.js` | 3ファイルに `toContain` をフィールドごとに手で列挙(4ブロック) |
| `src/lib/laneContentLod.wiring.test.js:54-60` | `indexOf('continue;')` の位置依存(観測6の実体)。同:62-71 には `function storyLaneTierBodyKey` を関数単位で切る**良い型**が同居 |
| `src/lib/laneHeatTracker.js:37` | `now - lastAt > windowMs` で全リセット。裏タブ1/分クランプ下では原理的に熱い人が出ない |
| `src/lib/officialCommentRate.js:39-40` | `c <= last.count` を捨てる。過大値1回で以後の正しい小さい値を全部捨て、15分まで固着(実コードで確定) |
| `popup.html` の `--nl-lane-pulse-gift/hot` | light 同値 `#c8721c`・dark 同値 `#ffb86c`・mega は両方 `#c02a2a`。同一ファイル内に複数定義=効く値はカスケード位置依存 |
| `scripts/build.mjs:199-210` | `app/live-view.js` をバンドルするだけ。`app/live-view.html` は build が書かない(手動コピー) |
| `check-gate-bypass` | このリポには無い。`../web-ios-android/templates/diagnostics/check-gate-bypass.mjs` が `.github/workflows/*.yml` の `continue-on-error: true` / コメントアウトされた検証ステップを見る |

## A. 理想の体験フロー

### 配信者(①popup/②会場を見ながら配信中)
1. サイドパネルの応援レーンに顔が並ぶ。顔・名前・IDは常に揃う(§3.5)。
2. 誰かがギフトを投げた瞬間、その人のタイルが一回だけ脈打ち「+500 pt」。**同じ人の値が更新されても再び脈打たない**(増えたときだけ)。
3. 3行目「🎁1,200 📣— 💬12」を1秒で読める。
4. 脚注で「🎁📣=公式の公開値/💬=この拡張の記録」が分かる。北極星(公式ランキング取得)OFF の人は🎁📣が無い理由が**脚注に1行**出る(黙って欠けない)。
5. 会場に切り替えても並び・数字・バッジが①と同じ。
6. 裏タブから戻っても全員が一斉に脈打つバーストは起きない。裏に回っていた間は無視し、戻った後の増分だけを見せる。

### 視聴者(③別窓/純Web)
1. 別窓も同じレーン(鏡)。
2. 公式「本家コメ」チップに「+66/分」。値源が切り替わっても古い値に固着しない。
3. 画面が狭くても3行目とバッジが重ならない。
4. prefers-reduced-motion では脈打ちが出ない(実装済み・維持)。

## B. 統合アーキ(コンポーネント4個・既存部品の再利用)

```
[1] 輸入契約(宣言)   src/lib/laneImportContract.js  ★新規・小(定数だけ)
      「輸入フィールド1つ = 鏡キー / CSSセレクタ群 / トークン名 / 描かない経路での同期要否」を1行で宣言
[2] 3画面パリティ(既存) laneTilePresentation.parity.test.js
      ①②③の outerHTML 一致(既存)+ 鏡セルのキー集合 == 契約のキー集合(新規 it 1本)
[3] CSS 3区間の集合照合 src/lib/laneCssSync.parity.test.js ★新規・テスト1ファイル
      popup.html / venueBar.js(SYNC区間) / app/live-view.html の「セレクタ集合・--nl-lane-* トークン名集合・@keyframes 名集合」が一致(値は比較しない)
[4] 描かない経路の一点化 renderStoryUserLaneDom.js に skipStoryUserLanePaint() 1関数 ★既存 sync を包むだけ
      popup-entry.js の 3 return がこれを呼ぶ(直接 sync を呼ぶ箇所をゼロにする)
```

[1] は実装コードが import しない(**テストだけが読む**=出荷バンドルを汚さない)。新しい npm script は作らない(`test:cc` に乗る)。

## C. 具体機構

### Q1 の裁定: 真因
- 「3箇所コピー」=**症状**。3箇所は**同一である必要がない**(会場は `.nlsb-venue-lane-stack` 接頭辞付き・live-view は自分の `--nl-lane-avatar-anon` を参照=`laneContentLod.wiring.test.js:89-111` が仕様として固定済み)。値まで同一化すると既存設計を壊す。
- 「単一正本の欠如」=**半分正しい**が、正本にすべきは CSS の中身ではなく**「輸入1件が触る場所の集合」**。この集合が司令塔の頭の中にしか無く、機械が知らない。
- **裁定: 真因=「輸入契約(1フィールドが触るべき場所の一覧)が機械可読な形で存在しない」。** 処方は「正本を作る」でなく「**契約を宣言し、契約と実装の集合差を赤にする**」。

### C-1. 輸入契約 `src/lib/laneImportContract.js`(新規・30行程度)
```js
export const LANE_IMPORT_CONTRACT = [
  { id: 'stats', mirrorKey: 'stats', selectors: ['.nl-story-userlane-meta[data-stats]::after', '.nl-story-userlane-guide__legend'], tokens: ['--nl-lane-stats'], syncInPlace: true },
  { id: 'pulse', mirrorKey: 'pulse', selectors: ['.nl-story-userlane-cell[data-pulse]::after', '.nl-story-userlane-cell.is-gifted', '.nl-story-userlane-cell.is-hot'], tokens: ['--nl-lane-pulse-gift', '--nl-lane-pulse-hot'], keyframes: ['nl-lane-pulse-pop'], syncInPlace: true },
  { id: 'anon-dashed', selectors: ['.nl-story-userlane-cell[data-thumb="0"] .nl-story-userlane-avatar'], tokens: [], syncInPlace: false }
];
```
- **契約に無いものが実装に現れたら赤 / 契約にあるものが実装に無ければ赤**の双方向。
  - 鏡: fixture 全部載せで `Object.keys(toMirrorCell出力)` が `['displaySrc','title','idLine','nameLine','userId','recentTexts', ...契約のmirrorKey]` と**完全一致**。新キーを足すと赤→契約へ1行→その1行が composeVenueLaneBuckets の引き継ぎ(既存 parity ②)と CSS 照合([3])を自動で要求する。
- 既存 wiring の「3ファイルに toContain」4ブロックは契約をループする1ブロックに**置き換える**(削る行数>足す行数)。

### C-2. CSS 3区間の集合照合 `src/lib/laneCssSync.parity.test.js`(新規)
- popup.html に `/* LANE_CSS_SYNC_SRC_BEGIN */` `/* LANE_CSS_SYNC_SRC_END */` の**コメント2行だけ**足す(カスケード位置は不変)。venueBar.js:1162 の手書き行番号参照はマーカー参照に置き換える。app/live-view.html にも同じ2行。
- 照合するもの(**値は比較しない**): (1)セレクタ集合(会場は先頭の `.nlsb-venue-lane-stack ` を剥がして正規化) (2)`--nl-lane-*` トークン**名**の集合 (3)`@keyframes` 名の集合 (4)`prefers-reduced-motion` 内で `animation: none` が付くクラス集合。
- 差分は「どのファイルに何が無いか」を集合差で列挙して落とす。
- 偽陽性の芽: 会場に意図的に無い規則(LOD の hollow・`laneContentLod.wiring.test.js:75`)→ 契約に `only: ['popup','live-view']` を持たせて除外。除外は**契約に理由コメント付き**(テスト内に if を書かない)。

### C-3. 描かない経路の一点化(小改修・版を分ける)
- `renderStoryUserLaneDom.js` に `export function skipStoryUserLanePaint(els, buckets, reason)`(sync を呼び reason を既存計器と同じ場所に数える)。popup-entry の3箇所はこれを呼ぶ。
- テスト: popup-entry.js に `syncStoryUserLaneStatsInPlace(` が **0 件**+`skipStoryUserLanePaint(` が **3 件**。「足し忘れ」が「呼び忘れ」に変わり grep 1発で見える。popup-entry.js は3行→3行置換で行数不変。

### C-4. 文字列スキャン型テストの処方(観測6)
- 禁止: `indexOf('continue;')` のような位置依存。`laneContentLod.wiring.test.js:54-60` を関数単位切り出し(同:62-71 の型)に直す。
- 共通ヘルパ `sliceFunction(src, name)` を `src/lib/testSrcSlice.js`(10行・テスト専用の葉)に。
- 原則: **実行できるものは実行テストに寄せる**。文字列スキャンは popup-entry.js の経路のように実行環境に載せられないものだけ。

### 機械化する/しない
| 機械化する | しない(人間/別AI) |
|---|---|
| 契約と実装の集合差(鏡キー・CSS セレクタ/トークン/keyframes・経路呼び出し件数) | 何を輸入するか・見え方・アニメ強度・色の意味 |
| 3画面 outerHTML 一致(既存) | 実機の体験評価(ちらつき・座標・性能) |
| 同一人物性の状態遷移テスト(D) | 公式値/自前値の注記文言 |

## D. 検証の型

### D-1. 同一人物性(観測7の穴を再利用可能に)
- テスト名「顔ぶれが入れ替わった瞬間に別人の数字を貼らない」(happy-dom 実行テスト)。
- fixture A=[甲,乙,丙] で paint → B=[乙,丙,丁](index がずれる)で `syncStoryUserLaneStatsInPlace` → 各タイルの `data-stats` が `dataset.userKey` と同じ uid の stats であることを断言。
- 偽陰性潰し: 全員**異なる値**にする(甲12/乙3/丙40)。同値だと取り違えても緑になる。
- 汎用化: 契約に `syncInPlace: true` のあるエントリは自動でこのテストの対象にする。

### D-2. 公開値と自前値の区別
- 値ごとの出どころは持たせず、脚注 legend の文言で区別(両方の語が在ることをテスト)。
- 北極星OFF: `kokenRows`/`nicoadRows` が null/undefined(OFF)と空配列(取得したが0件)を区別して legend の注記を変える(§3.6)。推測: 現在の legend はこの区別をしていない。

### D-3. 0 を捏造しない
- 既存 `positiveOrNull`・`formatCommentRate` が手本。parity の fixture に `commentCount: 0` の人と null を混ぜ、「0 は出ない・null は出ない・正の値だけ出る」を各フィールドに課す。

### D-4. 件数0の緑を許さない
- 集合差テストは「抽出したセレクタ数 > 0」を先に断言(マーカー無し・CRLFで空振り→0件→緑、を防ぐ)。

## E. MVP

**MVP = C-2「CSS 3区間の集合照合テスト」+ popup.html/live-view.html へのマーカー2行。** 3種類の忘れ物のうち鏡と経路は既にテストが捕まえる。CSS だけが手書き toContain の列挙に依存していて、新セレクタを足しても列挙を足さないと黙って通る=今いちばん穴が大きい。挙動不変・バンドル不変・popup-entry 不触で1版で閉じる。

版の分割:
1. **v+1**: マーカー2行+`laneCssSync.parity.test.js`+venueBar.js:1162 の行番号コメントをマーカー参照へ(挙動不変)
2. **v+2**: `laneImportContract.js`+鏡キー集合スナップショット+既存 wiring の toContain 4ブロックを契約ループに置換(行数が減る)
3. **v+3**: C-3 描かない経路の一点化
4. **v+4〜**: H の弱点修正(**実機の状態速報で症状を確認してから**)

## F. 捨てた案と理由

| 案 | 判定 | 理由 |
|---|---|---|
| 会議案「`src/styles/lane-tile.css` 正本→`scripts/sync-lane-assets.mjs` で3ファイルへ注入」 | **却下** | popup.html は13k行インラインCSSでカスケード位置依存(11箇所ずれた前科)/venueBar.js はテンプレ文字列内で接頭辞付き・live-view は自分の変数=3つは**意図して違う**/手動コピーに生成物を混ぜると二重管理/巨大機構 |
| 会議案「3ファイルのCSSハッシュ一致テスト」 | **却下** | 中身は一致しえない(接頭辞・変数)。正規化を足すと結局 C-2 |
| 会議案「`applyLaneStateToDom` 関数」 | **却下** | paintStoryUserLaneDomFilled(作り直し)と syncStoryUserLaneStatsInPlace(属性だけ)が既に役割分担。第3の関数は重複 |
| 新フィールド追加チェックリストの自動生成(Markdown) | **却下** | 文書は読まれない。各項目は C-1/C-2 の赤に変換済み |
| 鏡セルを全スプレッドにする | **却下** | 鏡は純Web公開サイズを絞る設計(1セル≤30B・512KB cap)。個別列挙のまま集合差で守る |
| 増分の橙と熱い人の橙を別色に | **保留** | 単位(pt/件)で区別できる。実機で混同の声が出てから |

## G. 地雷と回避策
1. CRLF: マーカー検索・集合抽出は `\r\n→\n` 正規化後。0件→緑を D-4 で防ぐ。
2. dist の日本語は `\uXXXX`: C-2 はソース3つだけを見る。
3. popup.html のトークン複数定義: C-2 は「名前が定義されているか」だけ。mega の `#c02a2a` は `[data-pulse-tier="mega"]` 内のローカル再定義=重複定義と誤認しない(集合は名前で取る)。
4. venueBar.js のテンプレ文字列内 CSS: `${...}` 補間のある区間を正規表現で切ると壊れる。SYNC 区間に補間が無いことを先に断言(推測: 現在無い)。
5. live-view.html は手動コピー: マーカーの入れ忘れは C-2 が「0件=赤」で止める。
6. popup-entry.js max-lines: C-3 は置換のみ。契約は `src/lib` に置き popup-entry から import しない。
7. 鍵を揺らさない: `syncInPlace: true` のフィールドは bodyKey/描画署名/scene hash に入れない禁止を契約からループさせる。
8. テストが実装の書き方を縛る: 関数単位切り出しに統一。
9. 会場の吹き出し座標: タイル高さが変わる輸入は契約に `changesTileHeight: true` を持たせ、そのときだけ実機確認を必須にする。

## H. 実機検証手順と既知弱点の優先順位

### 未確認点の実害順(`/nicolive-selfcheck` の型: 司令塔が chrome-devtools MCP で storage を太らせて測る)
| 順 | 未確認点 | 確認手順 |
|---|---|---|
| 1 | 鏡フラッシュが stats だけの変化で storage に書かれるか | `chrome.storage.onChanged` を仕込み、コメントだけ増える1分間の `nls_lane_mirror_v2` 書き込み回数を数える。期待: stats 変化で1回/標本、同値では書かれない |
| 2 | 別人の数字(1568修正の実機確認) | 顔ぶれ入れ替わりの瞬間に `data-stats` と `dataset.userKey` の uid が一致するか DOM を読む |
| 3 | 会場の吹き出し座標 | 会場で吹き出しを出し、要素の `getBoundingClientRect` とタイル rect を比較 |
| 4 | 一発アニメの再発火 | pt が増えない状態で鏡が更新される1分間の `animationstart` 数。期待 0 |
| 5 | 熱い人が裏タブで出ない | 裏タブ2分放置→前面。期待: バーストしない・以後の増分は出る。現状推定: 窓超えで全リセットされ続け裏タブ中は出ない |
| 6 | 公式コメ速度の固着 | 実コードで確定。修正+単体テストで固定 |
| 7 | `check-gate-bypass` 赤 | `.artifacts/verify-cc.log` の REPORT 行を読む。意図的なら kit 側の除外宣言(web-ios-android へ手紙)、意図的でなければ workflow を直す |

### 直すべき既知弱点の方針
1. **公式コメ速度の固着**: 逆行(`c < last.count`)が**連続3回**続いたら値源切替とみなし `reset()`。同値は従来どおり捨てる。テスト「過大値1回→正常値3回で null に戻り、その後20秒で再び出る」。
2. **熱い人の窓超えリセット**: 全リセットをやめ、窓を超えたギャップでは events を空にして prev だけ更新(「いま増えた」と見せず、以後の増分は拾う)。liveId 変更時の全リセットは維持。テスト「61秒ギャップ後は heat 0、その10秒後の増分は出る」。
3. **北極星OFFの注記**(D-2)。
4. 橙の同色: 保留。

### 「何を輸入しないか」の基準(体験起点)
- 常時アニメ・タイマー駆動の表示 → 輸入しない(サイドパネル同一スレッド・黒画面)。
- タイル1枚の要素数上限(顔・名前・ID・3行目・バッジ1個が上限。推測: 580px箱で6行×3段が限界)を超えるもの → 既存要素との交換でしか入れない。
- 自前集計の新指標を公式値の隣に並べるもの → 脚注で区別できない限り輸入しない。
- 3画面同一(venue-equals-lane)を破る popup 専用の帯・発光 → 輸入しない。
- 意味が無いもの(ホバーカード・Kick) → 輸入しない。
- 輸入する条件: 利用者の1場面(A)に「読める・誤解しない・待たせない」の3つで効くこと。1つでも欠けたら見送り。

### 標準手順(調査→地図→仕様→実装→独立検証→実機)の機械化範囲
- 機械化: 実装後の契約との集合差(C-1/C-2/C-3)・3画面 outerHTML 一致・同一人物性 fixture(D-1)。`test:cc` に乗る。
- 人間/別AI: 地図の実コード裏取り・何を輸入するかの裁定・reality-checker の独立検証・実機の状態速報読み。
- 輸入1件の完了条件: 「契約に1行ある」「test:cc 緑」「reality-checker の判定」「実機の該当項目が済み、未確認は HANDOFF に『⏳実機待ち』で1行残す」。文書のチェックリストは作らない。

---

## 追記: 更新後の会議ハーネスで再会議(2026-10-06・同じ問い)

> 再会議の素材は `council-answers2.json`(スクラッチ・非保存)。今回は分類が `design`、統括(lead)に `nvidia/nemotron-3-ultra-550b` が入り、1回目(分類 `code`・codestral が同じ文の繰り返し)より素材の質が上がった。判定は司令塔。

**収束は1回目と同じ**: 真因=「手作業の3箇所コピー」は症状で、本質は正本/契約の不在・同期責務の分散。機械化は派生と照合だけ、UI判断・輸入の取捨・実機検証は人間(+別AI)に残す。実装規模の制約と「カプセル化が不完全」を批判役(gpt-oss-120b)が再度指摘。

**採用しなかったもの(理由)**: nemotron 案の「`src/lane/*.ts`+`scripts/build-lane-assets.mjs` で3画面へ注入」と qwen の「`src/styles/lane-core.css` を `esbuild` で注入・`paintStoryUserLaneDomFilled` の引数変更」は **F の却下案と同じ**。会議の6体はリポの事実(popup.html のカスケード位置依存・venueBar.js のテンプレ文字列CSS・live-view.html が手動コピー・3つが意図的に違う)を知らないため、「ビルド注入」へ収束しやすい。Fable の裁定(契約+集合差テスト)を維持する。統合役が「生成スクリプトは新規1-2個・既存改変0なら制約に合う」としたが、注入先の3ファイルが既存の手編集物である点を見落としている。

**新しく拾った有益な点(設計へ反映)**
1. **体験の基準**(nemotron): 内訳バッジ・増分・速度チップの価値は「配信者が『今、誰に声をかけるか』を即決できるか」だけ。判断の遅延・疲労・誤解を増やすものは輸入しない。→ DESIGN H「何を輸入しないか」の基準を補強(「読める・誤解しない・待たせない」と整合)。
2. **既知弱点の優先**: nemotron は「公式コメ速度の固着」「裏タブの熱い人」を最優先とした。Fable の順(1.鏡フラッシュ 2.別人の数字 …5.熱い人 6.速度)は**実害の見え方**の順、nemotron は**直し方が確定している順**。→ 両方を採る: 実機確認は Fable の順、**修正は先に1572(速度の固着)・1573(熱い人)**(単体テストで固定できるので実機待ちにしない)。
3. **表示のON/OFF**(qwen・gpt-oss-20b): 内訳/増分バッジを利用者が切り替えられる設定。既存の型がある(`popup.html` の詳細設定に `venueButtonVisibleToggle` など。推測: 保存は storage のユーザー設定)。ただし**今は作らない**(新しい設定項目は選択肢を増やす=ストレス。実配信で「情報過多」の声が出てから)。DESIGN F「保留」に追加。
4. **キー照合**(qwen): index でなく ID キーで紐づける → 1568 で `dataset.userKey` 照合済み。D-1 の入れ替え fixture テスト(1570)で固定する。

**変更なし**: MVP=1569(CSS 3区間の集合照合テスト+マーカー2行)。版の順は `asset-import-IMPLEMENTATION-HANDOFF.md` の §1(1572〜の弱点修正は速度→熱い人の順で先行してよい)。
