# 実装仕様(to-spec): 会場アイコンのホバープレビューカード

> wayfinder→to-spec方式・手順2。設計=Fable(claude-fable-5) / 地図・裏取り=司令塔(Claude Code) / 2026-07-30。
> 地図(正本): [venue-avatar-hover-preview-MAP.md](venue-avatar-hover-preview-MAP.md)。地図・本仕様の行番号・データ構造は司令塔が実コード(master・v0.1.1190)で裏取り済み(主要な事実: `node.seat.title = displayName`はvenueBar.js:4410で正確、`participant.count/hasGift/giftCount`はvenueSeats.js:125で実在確認、`LaneMirrorCell`は`displaySrc/title/idLine/nameLine/userId`の5フィールドのみでlaneMirror.js:10と一致、renderTopBarのsig-skipはvenueBar.js:4128で確認)。

---

## 1. Problem Statement

会場モード(standalone)の参加者タイルには、現状ブラウザ標準の`title`属性ツールチップしかない。実体は複数箇所に散在している:

- タイル内部: `img.title` / `cell.title` = `${表示名} | ${フルUID}`([personTileDom.js:82-85](src/lib/personTileDom.js))
- 席ラッパー: `node.seat.title = displayName`([venueBar.js:4410](src/extension/venueBar.js))

この限界は3つ:

1. **情報量が固定文字列1行**。表示名とUIDしか出ず、「この人が本登録か匿名か」「発言数」「ランキング順位」等、会場が既に持っているデータが見えない。
2. **診断に使えない**。「サムネイルが実物か・identicon代替か・読み込み失敗(白丸)か」は、タイルの小さな丸(48px級)を目視しても判別しづらく、ネイティブツールチップは画像を一切出せない。白丸バグ調査([[venue-avatar-stale-mirror-design-2026-07-20]]系)のたびに拡大目視の手段がないことが繰り返しコストになっている。
3. **表示制御が不能**。出現遅延・位置・スタイルはブラウザ任せで、500人規模の密集タイルでは隣のタイルに被って読めない。

## 2. Solution

**venueBar.js側に閉じた「委譲リスナー + シングルトンカード」方式**を採用する。タイル正本`buildPersonTileEl`は1バイトも変えず、既存の設計思想「タイル本体は共通・演出は呼び出し側が被せる」([personTileDom.js:16-20](src/lib/personTileDom.js))にホバープレビューも従う。純ロジック(カードの表示モデル・位置計算・サムネ状態判定)は新規lib `src/lib/venueHoverCard.js` に切り出してテスト可能にする。

### 地図「6. 実装前に決める質問」への回答(設計判断)

**Q1. カードに載せる情報(標準搭載)** — 以下の6点。すべて**ホバー時点で手元にあるデータのみ**(新規取得ゼロ):

| 項目 | データ源 | 根拠 |
|---|---|---|
| 大サムネ(96px) | ホバー中タイルの実`img`の状態から導出(後述の安全規則あり) | 診断目的「サムネ有無の目視」の主役。ブラウザキャッシュ済みURLの再利用=追加ネットワークなし |
| 表示名 | 席装飾ループの`displayName`([venueBar.js:4387-4390](src/extension/venueBar.js)) | 既存表示と同一正本 |
| ID + 種別ラベル(「本登録」/「匿名(184)」) | `isNumericNicoUserId(uid)`のみで判定 | 唯一の判定基準を厳守([personTileDom.js:56-59](src/lib/personTileDom.js)) |
| 発言数 | `entry.participant.count` | participantに実在(venueSeats.js:125裏取り済み: `count/hasGift/giftCount`) |
| ギフト(有無+件数) | `entry.participant.hasGift` / `giftCount` | 同上 |
| ランキング順位(1〜3位のみ🥇🥈🥉) | `entry.venueRank`(= `seating.supporterRank`由来、席バッジ`dataset.venueRank`と同源・[venueBar.js:4415](src/extension/venueBar.js)) | `stabilizeVenueSupporterOrder`の安定化済み値と同一データ=drift しない |
| サムネ状態診断行 | ホバー時にタイル実`img`を読む: 「実サムネ」/「代替顔(identicon)」/「公式デフォルト(tv)」/「読み込み中」/「読み込み失敗(白丸)」 | 実DOMが唯一の真実(下記Q1補足) |

**Q1補足: `profileTier`/`thumbScore`の生値は載せない(明確な設計判断・裏取り済み)**。理由: 鏡供給モードのアイテムは`LaneMirrorCell = {displaySrc, title, idLine, nameLine, userId}`のみで`profileTier`/`thumbScore`を持たない(laneMirror.js:10に実在確認済み)。つまり鏡モードとfallbackモードでカードの中身が変わる=モード間driftの新源になる。診断目的「サムネがちゃんと出ているか」には、**paint後の実`img`の状態(src種別 + `complete`/`naturalWidth`)を読む方が事前スコアより正確**であり、モード非依存で常に取得可能。

**Q2. ネイティブtitleの扱い** — **属性は残し、カード表示中だけ退避する併用方式**。`buildPersonTileEl`は不変(=popup応援レーンのtitleも不変)。カードを開く瞬間に、ホバー中の席サブツリーの3つのtitle(seat/cell/img)をWeakMapへ退避して属性を空にし、カードを閉じるとき復元する。これで(a) 二重ツールチップの見苦しさを回避、(b) ホバーしていない全タイルでは従来のtitleがそのまま生きる(アクセシビリティ・フォールバック維持)、(c) DOM構造・characterization testは無傷。

**Q3. 実装場所** — **venueBar.jsに閉じる**(+純ロジックは`src/lib/venueHoverCard.js`新設)。`buildPersonTileEl`・`buildVenuePersonTile`・`venueSeatEntryToLaneItem`は**一切変更しない**。popup応援レーンには波及させない。データの受け渡しは、既存の席装飾ループ(venueBar.js:4370-4434。ここは`node.seat`と`entry`(participant実体)と`item`の3点が既に揃っている唯一の場所・裏取り済み)と`renderTopBar`(venueBar.js:4119-4137・裏取り済み)で**WeakMapに登録するだけ**(DOM属性書き込みなし=RANKバッジちらつき教訓[venueBar.js:4416-4422]を踏まない)。

**Q4. パフォーマンス方針** — 500人規模で成立する構成:
- イベントリスナーは**委譲2個のみ**(`seatsHost`と`topBarList`に`pointerover`/`pointerout`)。タイル個別リスナーは作らない。
- カードDOMは**シングルトン1個を再利用**(`stage`直下に常設・表示/非表示と中身差し替えのみ)。
- ホバーデータは**paint時にWeakMap登録**(既存ループへの相乗り・新規計算ゼロ・新規タイマーゼロ)。
- **開延120ms**(`VENUE_HOVER_CARD_OPEN_DELAY_MS = 120`): タイル群を素早く横切るだけではカードを組まない。
- ホバー1回の実コスト = WeakMap lookup 1回 + テキスト/src差し替え〜10ノード + `getBoundingClientRect` 1〜2回。APIコール・storage read・ネットワークは**ゼロ**。

**Q5. タッチデバイス** — **MVP対象外**。委譲リスナーで`e.pointerType === 'touch'`は無視し、タップの既存挙動(数値IDタイル=ユーザーページへのリンク遷移)を一切邪魔しない。タッチ向けUI(長押し表示等)は将来の別patch。

## 3. User Stories

1. **正常系(本登録・実サムネ)**: 数値IDユーザーのタイルに120ms以上ホバー → タイル上方にカードが出る。96pxサムネ・表示名・「ID:12345678(本登録)」・発言数・(該当なら)🥇順位・「サムネ: 実サムネ」。カーソルを離すと即閉じ、退避したtitleが復元される。
2. **白丸(読み込み失敗)ユーザー**: タイルのimgが`complete && naturalWidth === 0`→ カードのサムネ枠は**灰色プレースホルダ+「読み込み失敗(白丸)」の診断行**。失敗したhttp URLをカード側imgに再セットしない(negative-cache/バックオフ(v0.1.1188 `venueAvatarLoadGuard`)を迂回する野良再プローブを作らない)。
3. **読み込み中**: `!img.complete` → プレースホルダ+「読み込み中」。カードは開く(情報行は出る)。
4. **匿名ユーザー(a:系)**: カードは全項目表示(identicon顔+「匿名(184)」ラベル+発言数)。リンク言及なし。除外しない=「全員主役」哲学(venueLaneBuckets.js)。
5. **画面端**: カード位置は`resolveVenueHoverCardPlacement`が viewport 内へクランプ(左右margin 8px)。席が画面上端に近く上に置けない場合は席の**下**へフリップ。stageは`position:fixed; inset:0`([venueBar.js:501-503](src/extension/venueBar.js))なのでviewport座標=レイヤー座標。
6. **素早いホバー移動**: 別タイルへの`pointerover`で保留タイマーをキャンセルし張り直す。カードが既に開いていれば閉じ→新タイルで開延なし即差し替え(シングルトン再利用)。
7. **500人規模**: リスナー数・カードDOM数は人数に非依存(委譲2+カード1)。paint時の追加コストはWeakMap set×表示席数のみ。
8. **ドラッグスクロール中**: `seatsHost`の`pointerdown`でカードを即閉じ、`pointerup`まで開かない。`seatsHost`の`scroll`イベントでも即閉じ(カードは席から浮遊したまま残らない)。
9. **カード自体はマウスを奪わない**: カードは`pointer-events: none`。カード越しのクリック・ドラッグ・下のタイルへのホバーは素通し。

## 4. Implementation Decisions

### 4.1 新規ファイル `src/lib/venueHoverCard.js`(純ロジック+DOMビルダー・テスト正本)

```js
// 依存: isNumericNicoUserId (src/domain/user/identity.js), nicoUserPageUrl (src/lib/nicoUserPage.js) のみ。
// 新しい判定ロジックは作らない(地図4章の制約)。

/** タイル実DOMからサムネ状態を読む(観測のみ・1ノードも変更しない)。
 * @param {HTMLElement|null} cellEl .nl-story-userlane-cell(席内タイル)
 * @returns {{ src: string, kind: 'real-http'|'identicon'|'tv-fallback'|'none',
 *             load: 'ok'|'loading'|'failed' }} */
export function readVenueTileThumbState(cellEl)
// kind判定: img.classList.contains('nl-avatar--tv-fallback') → 'tv-fallback'
//          src.startsWith('data:image/svg+xml') → 'identicon'
//          /^https?:/ → 'real-http' / それ以外 → 'none'
// load判定: !img.complete → 'loading' / complete && naturalWidth===0 → 'failed' / それ以外 'ok'

/** カード表示モデル(純関数)。
 * @param {{ uid: string, displayName: string, count: number, hasGift: boolean,
 *           giftCount: number, venueRank: number,
 *           thumb: ReturnType<typeof readVenueTileThumbState> }} input
 * @returns {{ displayName: string, idLine: string,
 *             idKind: 'registered'|'anonymous'|'none',
 *             avatarSrc: string,            // load!=='ok' の http は '' に落とす(野良再プローブ禁止)
 *             statLine: string,             // 例 '発言 12 ・ 🎁3 ・ 🥇1位'
 *             thumbStatusLabel: string }} */
export function buildVenueHoverCardModel(input)

/** シングルトンカード要素を生成(初回1回だけ呼ぶ)。 */
export function createVenueHoverCardEl(doc)
/** モデルをカードに反映(テキスト/クラス差し替えのみ・ノード再生成しない)。 */
export function renderVenueHoverCard(cardEl, model)

/** 位置計算(純関数)。上配置優先・入らなければ下へフリップ・左右クランプ。
 * @param {{ anchor: {left:number,top:number,width:number,height:number},
 *           card: {width:number,height:number},
 *           viewport: {width:number,height:number}, margin?: number, gap?: number }} a
 * @returns {{ left: number, top: number, placement: 'above'|'below' }} */
export function resolveVenueHoverCardPlacement(a)
```

### 4.2 カードのDOM構造とCSS(venueBar.jsの`VENUE_CSS`に追記)

```
div.nlsb-hover-card                      ← stage直下・.nlsb-bubble-layerの兄弟
  div.nlsb-hover-card__avatar-box        ← 96×96・灰色プレースホルダ背景
    img.nlsb-hover-card__avatar          ← avatarSrc==='' なら hidden
  div.nlsb-hover-card__body
    div.nlsb-hover-card__name
    div.nlsb-hover-card__id              ← 'ID:xxxx ・ 本登録' / '匿名(184)'
    div.nlsb-hover-card__stats           ← statLine
    div.nlsb-hover-card__thumb-status    ← 診断行(data-thumb-kind / data-thumb-load 属性付与=将来の census/実機確認用フック)
```

CSS要点: `position:absolute`・`pointer-events:none`・`display:none`⇄表示はクラス`nlsb-hover-card--open`のトグルのみ(アニメーションなし=最小構成)。z-indexは実装時に`VENUE_CSS`内の全z値(1338/1468/1552/1565=z:5/6、765=z:7投げ物最前面)を確認し、吹き出しレイヤー(z:5)より上・投げ物演出(z:7)より下になるよう選定する(**未確定・実装時に確認**、地図の未確認事項2参照)。`.nlsb-seats`はoverflowを持つため**seatsHost内には置かない**(吹き出しレイヤーと同じ理由)。

### 4.3 venueBar.js側の配線(変更点は4箇所+リスナー)

1. **モジュールレベル**: `const _hoverCardDataByEl = new WeakMap();` と `let _hoverCardTimer = 0; let _hoverCardOpenFor = null;`
2. **席装飾ループ内**(venueBar.js:4410`node.seat.title = displayName`の直後・裏取り済みの実位置): 
   ```js
   _hoverCardDataByEl.set(node.seat, {
     uid, displayName,
     count: Number(participant.count) || 0,
     hasGift: participant.hasGift === true,
     giftCount: Number(participant.giftCount) || 0,
     venueRank
   });
   ```
   DOM書き込みなし(WeakMapのみ)=diff-skip不要・ちらつき源にならない。
3. **renderTopBar内**(venueBar.js:4131-4137の`cell`に対し同形で登録。`venueRank: item.rank`、countは`item.participant.count`)。
4. **stage組み立て時**: `const hoverCardEl = createVenueHoverCardEl(document); stage.appendChild(hoverCardEl);`
5. **委譲リスナー**(`seatsHost`と`topBarList`の2つに同一ハンドラ):
   - `pointerover`: `e.pointerType==='touch'`なら return。`e.target.closest('.nlsb-seat, .nlsb-topbar-cell')`→WeakMap lookup。**データ無しなら何もしない(fail-closed=ネイティブtitleがそのまま生きる)**。120msタイマーで開く。開く処理 = title退避(seat/cell/imgの3点をWeakMapへ)→`readVenueTileThumbState`→`buildVenueHoverCardModel`→`renderVenueHoverCard`→`offsetWidth/Height`計測→`resolveVenueHoverCardPlacement`→left/top適用→`--open`付与。
   - `pointerout`: 移動先(`relatedTarget`)が同じ席内なら無視。それ以外はタイマー解除+閉じる(title復元)。
   - `pointerdown`(既存ドラッグハンドラに1行相乗りでも独立でも可)と`seatsHost`の`scroll`: 即閉じ。

### 4.4 変更しないもの(退化ガード)

- `buildPersonTileEl` / `personTileDom.js` — **0バイト変更**。characterization test不変。
- `buildVenuePersonTile` / `venueSeatEntryToLaneItem` / `laneMirror.js` — 不変(鏡ペイロードにフィールドを足さない)。
- `isNumericNicoUserId`以外のID判定を新設しない。
- 席なしアイテム(`_venueSeatIndex === -1`の鏡由来広告セル等・venueBar.js:4351-4354裏取り済み)はWeakMap未登録=カード非対象=ネイティブtitleのまま(fail-closedの規則に自然に乗る)。

### 4.5 リリース手順

1変更=patch 1つ(AGENTS.md §12.5)。manifest/package/changelog同期+`npm run verify:bump`。**新規lib追加なのでtree-map/feature-map再生成をコミットに含める**([[verify-cc-lint-catches-unwired-import-2026-07-07]])。出荷ゲートは`npm run verify:cc`一本。反映3手順(pull→拡張リロード→watchタブF5)を報告に併記。

## 5. Testing Decisions

### 5.1 `src/lib/venueHoverCard.test.js`(happy-dom・personTileDom.test.jsと同型)

- `describe('buildVenueHoverCardModel')`
  - `it('数値ID(5〜14桁)は idKind=registered になり「本登録」ラベルが付く')`
  - `it('本登録の境界: 4桁以下/15桁以上は registered にしない')` — personTileDom.test.jsと同じ境界でdrift検知
  - `it('匿名(a:xxx)は idKind=anonymous でカード情報自体は全部出る(全員主役)')`
  - `it('load!==ok の http サムネは avatarSrc を空にする(失敗URLの野良再プローブ禁止)')`
  - `it('venueRank 1〜3 だけ statLine に順位が入り、0/4以上では入らない')`
- `describe('readVenueTileThumbState')`
  - `it('data:image/svg+xml は identicon、nl-avatar--tv-fallback クラスは tv-fallback と判定する')`
  - `it('complete かつ naturalWidth=0 は failed(白丸)、未complete は loading')`
  - `it('img の無いセル/nullでも落ちず kind=none を返す(観測のみ・例外を投げない)')`
- `describe('resolveVenueHoverCardPlacement')`
  - `it('上に入らないとき placement=below にフリップする')`
  - `it('左右端で viewport 内にクランプされる(margin 8px)')`
- `describe('renderVenueHoverCard')`
  - `it('カードDOM構造(クラス・子順序)のcharacterization')`
  - `it('2回目のrenderでノードを再生成しない(同一要素の中身差し替え)')`

### 5.2 `src/lib/venueHoverCard.wiring.test.js`(配線忘れ=CI赤)

venueBar.jsはcontent scriptでvitestからimport不可のため、既存のwiring.test.js群(例: venueLaneParity.wiring.test.js)と同型の**ソース文字列スキャン**で断言:

- `it('venueBar が venueHoverCard を import し stage にカードを append している')`
- `it('席装飾ループと renderTopBar の両方で _hoverCardDataByEl.set がある')`
- `it('pointerover 委譲と pointerType===touch ガードがある')`
- `it('pointerdown/scroll でカードを閉じる配線がある')`

### 5.3 実機検証(reality-checkerに委任)

実配信で: (a) 本登録/匿名/白丸の3種でカード内容目視 (b) 500人規模でホバー中のフレーム落ち・ドラッグスクロール阻害がないこと (c) タイルクリックのリンク遷移が従来通り。**Claude-in-Chromeは自作拡張ページを操作不可**([[claude-cannot-drive-own-extension-pages]])のため会場standaloneの実機確認はユーザー手動+状態速報コピペで裁定。

## 6. Out of Scope(今回やらない)

- **ニコニコAPIからの追加データ取得**(フォロワー数・ユーザーレベル等)。カードは手元データのみ。
- **タッチデバイスの完全対応**(長押し表示UI等)。touchはガードして無視するのみ。
- **popup応援レーンへの波及** — **対象外と明言**。会場(venueBar.js)専用。popupに同機能を出すのは将来の別設計。
- `profileTier`/`thumbScore`生値のカード表示(§2 Q1補足の理由により不採用。将来diag専用トグルで検討可)。
- 席なし鏡アイテム(広告主セル等)へのカード表示。
- `lastText`(最後の発言)のカード表示。
- カード内のインタラクティブ要素(ボタン・リンク)。カードは`pointer-events:none`の純表示。
- ホバー回数等の新規診断カウンタ(足すなら`statusFastDiagLite`のpassthrough必須([[fastdiag-lite-is-the-printer-subset]])になるため、MVPでは足さない)。

## 7. Further Notes(実装時の注意・地雷)

1. **title退避の復元漏れ**: pointerupやscrollで閉じる経路が複数あるため、閉じ処理は単一関数`closeHoverCard()`に集約し、全経路(タイマーキャンセル・title復元・`--open`除去)を必ず通す。「消す側」に経路漏れを作らない([[story-userlane-churn-filllanetier-v1039]]の鉄則の同型)。
2. **paintとの競合**: カード表示中に`renderSeats`が走ると席のtitleが`node.seat.title = displayName`(venueBar.js:4410)で**再セットされ退避が無効化**される。対策: 開いているカードの対象席をpaint側で特別扱いしない代わりに、閉じ処理での復元は「退避時の値」でなく「現在値が空のときだけ復元」にする(上書きされていたらそのまま=正しい最新値)。
3. **ドラッグスクロールのclick swallow**との共存: カードは`pointer-events:none`なのでイベント経路に一切入らない=既存ドラッグ判定を変更しない。
4. **CSS 3D変形段**: 席tierはtranslateZ/scaleで変形するが`getBoundingClientRect`は変形後の実表示矩形を返すため位置計算はそのまま成立する。lazy-loading撤回の教訓(personTileDom.js:87-90)と同根の環境なので、**IntersectionObserverや可視判定をカードに持ち込まない**(rect直読みのみ)。
5. **カードimgのerror**: `img.addEventListener('error', () => { img.hidden = true; })`。プレースホルダ背景が診断表示を兼ねるので白丸化しない。
6. **検証エージェント実行中にcommitしない**([[reality-checker-stash-detaches-head-2026-07-07]])。

---

## 未解決の質問(実装前にユーザー/司令塔の確認が要るもの)

1. **カードの発言数・ギフト件数のデータ鮮度**: 席装飾ループでWeakMapに積む`participant.count`はそのpaint時点のスナップショット。ホバー中に新コメントが来ても次paintまで古い値が出る(最大でpaint間隔ぶん)。MVPはこれで良いか(リアルタイム更新は過剰設計と判断したが、ユーザーの体感基準は未確認)。
2. **順位表示の範囲**: バッジと同じ1〜3位のみとしたが、ユーザーが「全員の順位(例: 17位)」を見たいなら`seating.supporterRank.orderKeys`から席キー→順位の逆引きが必要(データは同源で可能・表示だけの追加)。どちらを望むか未確認。
3. **開延120ms・カード上配置優先**などのUXパラメータはユーザー未確認(実機で調整前提の初期値)。
4. **診断行の文言**(「読み込み失敗(白丸)」等)を状態速報の語彙と揃えるべきか(現状の状態速報にサムネ状態の対応語彙があるか未調査)。

## 仕様に根拠がない断定(実装時に検証すること)

1. **「タイルと同じURLをカードimgに再セットしてもブラウザキャッシュで追加リクエストは実質発生しない」** — 一般的なブラウザ挙動からの推定。`referrerPolicy`等の差でキャッシュキーが割れる可能性は未検証(割れても実害は小さいが、気になるなら実装時にNetworkタブで確認)。
2. **z-indexの具体値** — 司令塔裏取りでVENUE_CSS内に`z-index:5`(venueBar.js:1552・吹き出しレイヤー)・`z-index:6`(venueBar.js:1338/1468/1565)・`z-index:7`(venueBar.js:765・投げ物演出「吹き出し(z5)・常駐(z6)より前」とコメントあり)が実在することを確認。カードはz:6付近(常駐レイヤーと同格)が妥当と推測されるが、**具体的にどの要素がz:6かは実装時に個々の役割を確認してから決めること**(このSPEC作成時点では各z値の対象要素までは特定していない)。
3. **「pointerover/outの委譲がtopBarListでも席と同一実装で動く」** — トップバーのDOM(`.nlsb-topbar-cell`)は席と構造が違う(seatラッパーなし・title退避対象はcell/imgの2点のみ)。ハンドラの`closest`とtitle退避を両対応にする必要がある。トップバー側のhover CSS(既存`:hover`装飾があれば)との干渉は未検証。
4. **`renderTopBar`のsig-skip(venueBar.js:4128・裏取り済み)によりWeakMap登録もスキップされる** — sig無変化時は既存cellが残りWeakMapデータも残るため実害なしと判断したが、rank同一でcount だけ増えた場合にトップバー側カードのcountが古いまま固定される(sigはrank+keyのみ)。未解決質問1と同根で、MVPでは許容とした。
