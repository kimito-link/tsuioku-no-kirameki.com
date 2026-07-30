# 会場ホバーカード表示項目再設計 — 設計書

> council-fable 3段構えの手順2の産物。設計=Fable(claude-fable-5) / 素材収集・裏取り・保存=司令塔(Claude Code) / 2026-07-30。
> 前提: v0.1.1191で実装済みの会場ホバープレビューカード(正本 [venue-avatar-hover-preview-DESIGN系](venue-avatar-hover-preview-MAP.md))に対する「表示項目の再設計」。実装ファイルは`src/lib/venueHoverCard.js`/`src/extension/venueBar.js`。

対象: `src/lib/venueHoverCard.js` / `src/extension/venueBar.js`(v0.1.1191 実装済みカードの項目再設計)
方針: 作り直しゼロ。純関数モデル+WeakMap相乗り+委譲リスナーの現構造をそのまま使い、**入力3フィールド追加・出力の意味変更2点・CSS/DOM順の微修正**だけで完結させる。

---

## 発端(会議素材・司令塔統合)

council-fable手順1の会議(groq/gpt-oss-120b・groq/llama-3.3-70b・groq/qwen3.6-27b の3体成功)で、v0.1.1191の6項目(表示名/ID種別/発言数/ギフト件数/ランキング順位/サムネ診断)を再検討した。収束点: (1)ID種別は必須(削除不可)、(2)技術診断情報は一般ユーザー向け体験から分離すべき。対立点: 生の定量指標(発言数・ギフト件数)を残すか、定性表現(参加アーキタイプ)へ変換するか。

司令塔の追加裏取りで、`src/lib/venueSeats.js`の`collectVenueParticipants`が返すparticipantオブジェクトに既に`lastAt`(最終発言時刻)・`firstAt`(初回発言時刻)・`lastText`(最終発言テキスト)が含まれることを確認(新規API取得なしで「最後にコメントした時刻」が実現可能)。

---

## A. 理想の体験フロー

**一般ユーザー(通常時)**
1. タイルにポインタを乗せる → 120ms後にカードが開く(現行どおり)。
2. 目に入る順: **①大きな表示名 → ②活動の1行(発言数・最新発言の新しさ・ギフト・順位) → ③淡く小さなID行**。
3. 技術用語(identicon/読み込み失敗等)は**一切見えない**。カードは「この人は誰で、いまどれくらい参加しているか」だけを語る。
4. 匿名ユーザーも同じカードが同じ体裁で開く(全員主役)。ID行で「さっきの匿名さんと同一人物か」を照合できる。

**QA/診断時(ユーザー=配信者本人・reality-checker)**
1. 既存の「🩺 状態」ボタンで診断パネルを開く(=診断の意図を明示的に表明した状態)。
2. その状態でタイルをホバーすると、カード最下段に**サムネ診断行**(実サムネ/identicon/白丸失敗…)が追加表示される。
3. パネルを閉じれば診断行は次のホバーから消える。機械可読の `data-thumb-kind/load` は**モードに関わらず常時**カードに刻まれる(census・実機突合は通常モードでも可能なまま)。

---

## B. 統合アーキ — 項目リスト・優先順位・レイヤー分離方式

### 表示項目の最終リスト(優先順位順)

| 層 | 優先度 | 項目 | 表示 | 出所 |
|---|---|---|---|---|
| 体験層 | 1(大・太字15px) | 表示名 | 常時 | 既存 `displayName` |
| 体験層 | 2(中・太字13px) | statLine =「発言 12(3分前) ・ 🎁2 ・ 🥇1位」 | 常時 | 既存 `count/giftCount/venueRank` + **新規 `lastAt`** |
| 体験層 | 3(小・淡・11px) | ID行「ID:xxxx(本登録)」/「匿名(184xx…)」 | 常時 | 既存 `idLine`(文言変更なし) |
| 診断層 | 4(小・淡12px) | サムネ診断ラベル | **診断パネル開時のみ** | 既存 `thumbStatusLabel` |
| 機械層 | 不可視 | `data-thumb-kind` / `data-thumb-load` | 常時 | 既存 dataset(変更なし) |

### レイヤー分離方式: 「1カード・1モデル・入力フラグ1個」

- カードDOMは**シングルトン1個のまま**。診断用の別カード・別パネルは作らない(2個目のシングルトンは中身driftの温床)。
- 分離は `buildVenueHoverCardModel(input)` への入力 `diagMode: boolean` 1個で行う。`diagMode` が偽なら `thumbStatusLabel` を空文字で返し、レンダラは空文字の行を `hidden` にする。**モデル関数が唯一の分岐点**(呼び出し側やCSSに分岐を散らさない)。
- 機械層(dataset)は `diagMode` に**依存させない**。診断の見た目を消しても検証可能性は落とさない。

### 必答論点への裁定

**必答1: ID種別の塩梅 — 「文言そのまま・体裁だけ格下げ」**
- `idLine` の文字列(`ID:xxxx(本登録)` / `匿名(xxxx)`)は**1文字も変えない**。UID全文を出す理由がそもそも「匿名の同一人物照合」であり、短縮・マスクはその目的を殺す。
- 格下げは2点のみ: ① CSS `.nlsb-hover-card__id`(venueBar.js 1631行に実在確認済み)に `font-size: 11px;` を追加(現行は13px継承+opacity 0.7)。② `createVenueHoverCardEl` の append 順(venueHoverCard.js 176行に実在確認済み)を `nameEl, idEl, statsEl` → **`nameEl, statsEl, idEl`** に入れ替え、「名前→活動→(補足として)ID」の情報序列を構造でも表現する。ロジック変更ゼロ・判定基準は引き続き `isNumericNicoUserId` 一択。

**必答2: 診断情報の分離トリガー — 「既存 🩺 状態パネルの開閉状態に連動」**
- トリガーは `!diagPanel.hidden`(venueBar.js 2318行で定義済み・2358行`openHoverCardFor`と同一クロージャ内=**配線1式で到達可能**、いずれも司令塔裏取り済み)。
- 採用理由: (a) 新規UI・新規storage・新規リスナーが**ゼロ**。(b) 🩺 ボタンは既に「診断の入口」としてユーザーに認知されている。(c) QAの実手順が「状態パネルを開く→ホバーで各タイルを個別精査」という自然な流れになる。(d) reality-checker がテキストで再現手順を書ける(「🩺を押してからホバー」)。

**必答3: 生カウント vs 定性表現 — 「生カウントを維持。アーキタイプ変換は不採用」(単一結論)**
根拠4点:
1. **決定論とチラつきの実績**: アーキタイプは閾値でラベルが飛び変わる(発言9→10で「観察型」→「盛り上げ役」)。このプロジェクトは閾値跨ぎの表示チャーンと繰り返し戦ってきた(v0.1.1190 のバンド量子化ヒステリシス[[venue-supporter-rank-churn-wayfinder-2026-07-30]]まで要した)。ホバーのたびにラベルが変わる不安定表示を新設するのは歴史への逆行。
2. **「全員主役」哲学との整合**: 数字は中立だが、ペルソナラベルは人物評(「観察型」=「あまり喋らない人」という箱詰め)。マウント抑止のつもりのラベルの方がむしろ強いレッテルになる。
3. **突合文化**: この製品の検証は「実描画値を①と突合して初めて本物」([[parity-check-must-compare-values-not-just-ack]])。生カウントは①レーンの表示値と突き合わせられるが、定性ラベルには照合先の正解が無い=嘘の緑を検出できない。
4. **競争心リスクの実態**: ホバーカードは一度に1人分・数秒の過渡表示で、並べて比較する画面ではない。競争の主因になり得る順位バッジ(🥇🥈🥉)はタイル本体に既に常時表示されており、カードから数字を消しても煽り抑止効果はほぼ無い。

**必答4: 「最後にコメントした時刻」— 採用。相対時刻・粗い粒度・statLine内に埋め込み**
- `lastAt` は `collectVenueParticipants` の participant に既在(venueSeats.js 125行)。seat側(`entry.participant`)/topbar側(`seating.topSupporters[].participant`)とも同一オブジェクトが届いており、**WeakMap登録に1フィールド足すだけ**で新規取得ゼロ。
- 表示形式: **相対時刻**(「たった今」「3分前」「2時間前」「3日前」)。絶対時刻(HH:MM)は「さっきまで居た人か」という実際の問いに答えず、タイムゾーン/書式の決め事だけ増える。
- 視覚的優先度: **専用行を作らず** statLine の発言数に括弧で付ける — `発言 12(3分前)`。新規DOMノード0・新規CSS0で、活動情報と同じ中優先度に自然に収まる。`lastAt` 欠損時は括弧ごと省略(現行出力と完全一致=後方互換恒等)。
- 更新はカードを開いた瞬間の1回のみ(タイマー追加禁止の制約どおり)。カード寿命は数秒なので tick 更新は不要。

---

## C. 具体機構

### C-1. `buildVenueHoverCardModel` シグネチャ変更(追加のみ・破壊なし)

```js
/**
 * @param {{
 *   uid?, displayName?, count?, hasGift?, giftCount?, venueRank?,
 *   lastAt?: unknown,   // 新規: participant.lastAt(epoch ms)。無効値→相対時刻を出さない
 *   nowMs?: unknown,    // 新規: カードを開いた瞬間の Date.now()。純関数維持のため必ず注入
 *   diagMode?: unknown, // 新規: true のときだけ thumbStatusLabel を非空で返す
 *   thumb?: Partial<VenueTileThumbState>
 * }} input
 * @returns {VenueHoverCardModel}  // 型形状は不変。意味変更は statLine と thumbStatusLabel の2点のみ
 */
```

出力の意味変更:
- `statLine`: `lastAt`/`nowMs` が両方有効なら `発言 ${count}(${rel})`、どちらか欠損なら現行どおり `発言 ${count}`。
- `thumbStatusLabel`: `diagMode === true` のときだけ `resolveThumbStatusLabel(...)`、それ以外は `''`。
- `thumbKind`/`thumbLoad`: **無条件で従来どおり**返す(dataset刻印=機械層はモード非依存)。

### C-2. 相対時刻ヘルパー(venueHoverCard.js 内に追加する純関数)

```js
/** @param {number} lastAt @param {number} nowMs @returns {string} 空文字=出さない */
export function formatVenueHoverRelativeTime(lastAt, nowMs) {
  const a = Number(lastAt), n = Number(nowMs);
  if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(n) || n <= 0) return '';
  const d = n - a;
  if (d < 60_000) return 'たった今';            // 負値(時計ズレ)もここに丸める
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}分前`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}時間前`;
  if (d < 30 * 86_400_000) return `${Math.floor(d / 86_400_000)}日前`;
  return ''; // 30日超は単位/クロック異常とみなし出さない(v1044「56年前」事故の再発防止・fail-closed)
}
```

判定ロジックはこの表が全て(分岐5本・ランダム性なし・入力が同じなら出力は同じ)。

### C-3. 呼び出し側の差分(venueBar.js・3箇所・行番号は司令塔裏取り済み)

1. **openHoverCardFor(2358行)内、`buildVenueHoverCardModel`呼び出し** — 注入1式:
```js
const model = buildVenueHoverCardModel({
  ...data, thumb,
  nowMs: Date.now(),
  diagMode: !diagPanel.hidden   // 開いた瞬間の状態を都度読む(wire時にbooleanを固めない)
});
```
2. **topbar側 WeakMap登録(4343行)** — `lastAt: Number(p.lastAt) || 0` を1行追加。
3. **seat側 WeakMap登録(4642行)** — `lastAt: Number(participant.lastAt) || 0` を1行追加。

### C-4. レンダラ・DOM・CSSの差分(venueHoverCard.js / venueBar.js)

- `renderVenueHoverCard`: `thumbStatusEl.textContent = text;` の直後に `thumbStatusEl.hidden = !text;` を1行追加(空行の隙間を残さない)。dataset刻印は現行のまま。
- `createVenueHoverCardEl`(venueHoverCard.js 176行): `body.append(nameEl, idEl, statsEl, thumbStatusEl)` → `body.append(nameEl, statsEl, idEl, thumbStatusEl)`(順序入替のみ)。
- CSS(venueBar.js 1631行 `.nlsb-hover-card__id`): `font-size: 11px;` を1行追加。

---

## E. MVP — 段階的な進め方

**MVP-1(先): 診断分離+ID格下げ** — 「一般ユーザーに見せてはいけないものを引っ込める」引き算が最優先。
- `diagMode` 入力+`thumbStatusLabel` のゲート+`hidden` 1行+CSS 11px+DOM順入替+`openHoverCardFor` の注入。
- テスト: `venueHoverCard.test.js` に「diagMode無し→thumbStatusLabel空」「diagMode:true→現行ラベル」「thumbKind/thumbLoadはモード非依存」を追加。

**MVP-2(後): lastAt相対時刻** — 足し算は引き算が済んでから。
- `formatVenueHoverRelativeTime` 追加+statLine組み立て変更+WeakMap登録2箇所に `lastAt`。
- テスト: 境界値(59秒/60秒/59分/24時間/30日/負値/0/NaN)+**後方互換恒等**(lastAt/nowMs未指定の入力→現行と同一のstatLine)。wiringテストに「登録データにlastAtが乗る」ことの断言を追加(モデルに計器を足しても配線しなければ永久に出ない、の同型地雷 [[fastdiag-lite-is-the-printer-subset]] 対策)。

各段とも patch 1つ・verify:cc 一本・反映3手順(pull→拡張リロード→watchタブF5)。

**非スコープ(今回やらない)**: `lastText` 表示(SPECでOut of Scope済み・プライバシー)/`firstAt`(滞在時間)/アーキタイプ/タッチ対応/カード表示中のライブ更新。

---

## F. 捨てた案と理由

| 案 | 捨てた理由 |
|---|---|
| 参加アーキタイプ(qwen案) | 必答3の裁定どおり: 閾値チャーン・レッテル化・突合先の正解が無い・煽り抑止効果が薄い |
| Altキー押下ホバーで診断表示 | 発見不能・キーボード状態の配線が新規に要る・OS/ブラウザのAlt競合。既存パネル連動なら配線1式 |
| 拡張設定トグルで診断表示 | 設定UI+storage read の新設=過剰設計。診断の意図表明は🩺ボタンが既に担っている |
| URLパラメータ | 会場barはcontent script注入でURLを所有していない。手段として不自然 |
| 診断専用の2枚目カード | シングルトン2個=位置計算・開閉経路・中身の二重管理。driftの温床 |
| 絶対時刻(HH:MM)表示 | 「さっきまで居たか」に答えない・TZ/書式の決め事だけ増える |
| 相対時刻のtick更新(タイマー) | 新規タイマー禁止の制約違反。カード寿命数秒に対して無意味 |
| UIDの短縮・マスク表示 | 匿名の同一人物照合というID行の存在理由を殺す。格下げはCSSで足りる |
| ホバー時にrosterを再読して鮮度保証 | 500人規模のホバー毎コスト増。staleはsig-skip設計が既に許容した性質 |

---

## G. 地雷と回避策

1. **純関数に `Date.now()` を入れない**。`nowMs` は必ず呼び出し側注入。テストは固定 `nowMs` で書く(プロジェクトの決定論方針。表示用now参照は注入点=`openHoverCardFor` の1箇所に閉じ込める)。
2. **クロック/単位異常**: performance.now(相対)とDate.now(epoch)の取り違えで「56年前」を出した前科(v1044)。30日超で `''` を返す上限ガードが保険。秒単位のlastAtが混入しても「◯万分前」を出さずに黙る。
3. **diagModeは開時に都度評価**: `wireHoverCardDelegation` 時にbooleanを閉じ込めると、パネル開閉がカードへ永久に反映されない。`!diagPanel.hidden` を `openHoverCardFor` 内で読む。カード表示中のパネル開閉は次のホバーから反映(ライブ更新はしない=許容)。
4. **dataset刻印をdiagModeでゲートしない**: 見た目の診断行だけを消す。`data-thumb-kind/load` まで消すと通常モードでのcensus・実機突合が死ぬ。
5. **sig-skipによるstale**(既知): 再構築されないセルのWeakMapデータは古く、「3分前」が実際より古い/新しいことがある。countのstaleと同格として許容し、鮮度保証のための再計算を足さない(足すと制約違反)。
6. **後方互換恒等をテストで固定**: `lastAt`/`nowMs`/`diagMode` 未指定の入力に対する出力が現行と完全一致することを断言する(既存呼び出し・既存テストを壊していない証明が1本で済む)。
7. **wiringテストの実import**: 相対時刻ロジックをテスト内に手書きコピーしない([[integration-test-must-import-real-code]]・v0.1.1185の偽装テスト事故)。`formatVenueHoverRelativeTime` をexportして実importで検証。
8. **title退避/復元機構(venueBar.js 2333-2355行)には触らない**。今回の差分はモデル入力・カード中身・CSSのみで、開閉経路の単一関数原則(closeHoverCard一本)を崩さない。
9. **反映漏れ**: dist再生成(`copy:ext`)・`verify:bump`・tree-map再生成をコミットに含める。pushだけではChromeに届かない(反映3手順)。
