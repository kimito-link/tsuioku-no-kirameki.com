# /live/ 配信詳細モーダル — 設計書

> 設計=Fable(council-fable 3段構えの手順2) / 裏取り=司令塔(Claude Code) / 日付=2026-09-26
> 経緯: ユーザー要望「Chrome拡張でひらくような画面(会場モード)をWEBからでも」
> 「放送みたらこういうかんじででるようにして」。5体マルチLLM会議(design分類)で
> UI詳細(トリガー・レイアウト・開閉・自動更新共存・スマホ幅)を発散させ、Fableが
> 会議の結論を実コード4ファイル(entry.js/liveRankingView.js/live/index.html/
> api/live-ranking.js)の裏取りを経て裁定・訂正した最終設計。
>
> ★司令塔による追加裏取り済み: `renderRows`/`renderCommentCol`/`renderHead`/
> `renderKnown`/`PINNED_LV`/`hideCard`/`createRowChangeTracker`/`elRefreshBtns`/
> `.stats-actions`/`MAX_LIVES=20`/`COMMENT_RANKERS_MAX=10`/vercel.jsonのrewrite
> 条件(`query.key==="lv"`のみ、`detail`は見ない)は実在確認済み。行番号は
> Fable参照時点からの微小なズレがあり得るため、実装時に都度grepし直すこと。

---

## A. 理想の体験フロー

`/live/` の一覧で気になる配信カードの右下「🔍 詳しく見る」を押すと、ページはそのまま暗くなり、
その配信だけを大きく切り出した1枚が中央に開く。上に配信サムネ・配信者・経過時間、その下に
「サムネ付きで応援した人」のアイコン群、さらにギフト／広告／コメントの3列が、カードで見ていた
のと同じ並び・同じ配色で、ただし横幅いっぱいに読める。見出しには「N分前の収集」と正直に書いて
あり、コメント列の下には「当サイトが数えた上位10人まで」と添えてある。60秒ごとに数字が静かに
更新され、増えた行だけがふっと光る。配信が終わって一覧から消えても、モーダルは閉じずに
「この配信はいまの一覧に見当たらないわ。最後に取れた N分前の情報をそのまま出している」と
一言添えて、最後の姿を保つ。Esc・背景クリック・×・スマホの戻るジェスチャーのどれでも閉じ、
閉じると一覧は開く前の位置のまま、押したボタンにフォーカスが戻る。URL は `?lv=lvNNN&detail=1`
に同期しているので、そのまま人に送れば相手も同じ配信のモーダルが開いた状態で着地する
(配信が終わっていれば、既存の「もう放送が終わったみたい」の一覧表示に静かに倒れる)。

---

## B. 統合アーキ(コンポーネント4個・配線)

```
index.html(静的)                    live-ranking-entry.js(DOM)               src/lib/liveDetailView.js(純関数・新規)
┌──────────────────┐   ┌──────────────────────────────────┐   ┌──────────────────────────────┐
│ <main id="list"> │◀──│ [1] render(data)  ←既存・変更最小 │   │ readDetailQuery(search)      │
│   (60秒ごと全置換)│   │   カード右下に <button data-detail>│   │ withDetail(search, lv)       │
├──────────────────┤   │   renderRows(…, tr) 第4引数追加   │   │ withoutDetail(search)        │
│ <dialog id=      │◀──│ [2] detail: open/close/sync       │──▶│ findLive(data, lv)           │
│   "liveDetail">  │   │   既存 renderHead/renderKnown/    │   │ detailBanner(state, nowMs)   │
│   (elList の外・  │   │   renderRows/renderCommentCol を  │   └──────────────────────────────┘
│    body 直下)    │   │   そのまま呼ぶ(HTML 文字列を再利用)│
└──────────────────┘   │ [3] history: pushState/popstate   │   api/live-ranking.js … 変更なし
                       │ [4] load() の then/catch に 1 行ずつ│   liveRankingView.js … 変更なし
                       └──────────────────────────────────┘
```

| # | コンポーネント | 置き場所 | 責務 | 既存との関係 |
|---|---|---|---|---|
| 1 | **トリガー** | `render()` 内 `.stats-actions`(entry.js:288-291) | `<button data-detail="lvNNN">` を毎カードに描く。クリックは `elList` に委譲1本(render が innerHTML を全置換するため・ホバー委譲と同じ理由) | `renderRows` に第4引数 `tr`(追跡器)を追加する以外、既存関数のシグネチャは不変 |
| 2 | **モーダル本体** | `<dialog id="liveDetail">` は index.html に静的配置(`</main>` の後・`#list` の外)。中身の描画は entry.js 新セクション | `openDetail(lv)` / `closeDetail()` / `paintDetail(data, err)`。本文は既存4描画関数の出力を3ブロック(`.ld-head` `.ld-known` `.ld-cols`)に流す | `#list` の外なので 60 秒の `elList.innerHTML=` に**構造的に巻き込まれない** |
| 3 | **履歴同期** | entry.js 新セクション | `pushState`/`popstate`/`replaceState` の3経路を1つの `readDetailQuery(location.search)` で判定 | 既存 `PINNED_LV`(起動時1回読み)は**触らない**。モーダルを開いても一覧の並びは動かない |
| 4 | **純関数** | `src/lib/liveDetailView.js`(新規・テスト同居 `liveDetailView.test.js`) | クエリ判定・URL 組み立て・`find` の正規化・バナー文言の状態遷移 | `check-layer.mjs` の純粋性検査対象。`document/window/fetch/location/history` を一切参照しない(引数は文字列と data) |

**データの流れ(会議の"独立fetch"案を訂正)**: モーダルは**独立した fetch ループを持たない**。
既存 `load()` の `.then` で `render(data)` の直後に `safeDetailSync(data)`、`.catch` で
`safeDetailSyncError(msg)` を呼ぶだけ。会議が恐れたのは「elList 全置換に巻き込まれてモーダルが
消える」ことで、その真因は DOM の置き場であって fetch の本数ではない。fetch を2本にすると
サーバ側 throttle(`PUBLIC_REFRESH_MIN_MS`)を同じデータで2回叩き、`inFlight`/`throttled` の
分岐まで2系統で扱う羽目になる。

---

## C. 具体機構

### C-1. `src/lib/liveDetailView.js`(純関数・全部で60行程度)

```js
import { LIVE_ID_RE, freshness } from './liveRankingView.js';

/** `?lv=…&detail=1` を読む。lv が形に合わなければ lv:'' detail:false(エラーにしない)。 */
export function readDetailQuery(search) { /* { lv: string, detail: boolean } */ }
//  - new URLSearchParams(search) … Node にもある(check-layer の毒語に該当しない)
//  - lv は trim().toLowerCase() → LIVE_ID_RE.test
//  - detail は get('detail') === '1' && lv !== ''(lv が無いのに detail=1 は false)

/** 現在の search に lv と detail=1 を上書きした search 文字列('?'付き)。他のパラメータは保つ。 */
export function withDetail(search, lv) { /* string */ }
//  - lv が LIVE_ID_RE 不合格なら search をそのまま返す(呼び出し側は pushState しない)

/** detail を除いた search('?'付き。空なら ''). lv は残す(先頭固定は生かす)。 */
export function withoutDetail(search) { /* string */ }

/** data.lives から lv を探す。★大小文字・空白を正規化(pinLiveFirst と同じ比較)。無ければ null。 */
export function findLive(data, lv) { /* object | null */ }
//  - data.lives が配列でない/lv 不正 → null。例外を投げない

/**
 * バナー(モーダル上部の1行)の状態と文言。★表示判断をここに集める(entry 側は kind で class を付けるだけ)。
 * @param s { found:boolean, snapshotAt:number|0, fetchError:string }
 */
export function detailBanner(s, nowMs) { /* { kind: 'ok'|'missing'|'missing-empty'|'error', text: string } */ }
//  ok            : found
//  missing       : !found && snapshotAt>0  → 'この配信はいまの一覧に見当たらないわ（放送が終わったか、上位から外れたみたい）。最後に取れた{N分前}の情報をそのまま出しているわ'
//  missing-empty : !found && !snapshotAt   → 'この配信の情報はいま取れていないわ。放送が終わったか、まだ一覧に載っていないみたい'
//  error         : fetchError && snapshotAt>0 → '最新の取得に失敗したわ（{fetchError}）。{N分前}の情報を表示中'
//  ★found のときは fetchError を無視(古いエラーを引きずらない)
```

`freshness` の文言 `"12分前 更新"` から `" 更新"` を落とす加工は既存 render() と同じ正規表現を
この関数内で行う。「上位20件」の 20 は `api/live-ranking.js` の `MAX_LIVES=20`(実在確認済み)
由来だが api 側の定数は import できない(Vercel 側)。数字を文言に焼くと腐るので「**上位から
外れた**」と書く。

### C-2. `index.html` の骨格追加(`</main>` と `.fab-refresh` の間)

```html
<dialog id="liveDetail" class="ld" aria-labelledby="ldTitle">
  <div class="ld-panel">
    <div class="ld-bar">
      <button type="button" class="ld-close" data-ld-close aria-label="閉じる">✕</button>
      <h2 id="ldTitle" class="ld-title">配信の詳しい様子</h2>
      <span class="ld-fresh" id="ldFresh"></span>
      <button type="button" class="btn btn--refresh ld-refresh" data-refresh aria-label="ランキングをいま更新する">🔄 いま更新</button>
    </div>
    <p class="ld-banner" id="ldBanner" role="status" hidden></p>
    <div class="ld-body" id="ldBody">
      <section class="live ld-live">
        <div class="ld-head"></div>
        <div class="ld-known"></div>
        <div class="cols ld-cols"></div>
      </section>
      <p class="ld-note">ギフト・広告はニコ生が公開している順位そのまま。コメントは当サイトが数えた<b>上位10人まで</b>（本文は保存していません）。配信中の応援を1秒単位で残すなら <a href="https://chromewebstore.google.com/detail/cjbabignmmodaickpeckiojjabnlogdb" target="_blank" rel="noopener noreferrer">Chrome 拡張</a>。</p>
    </div>
  </div>
</dialog>
```

- `data-refresh` を付けるだけで既存 `elRefreshBtns`(起動時 querySelectorAll)に自動で入り、
  `setBusy` の disabled/is-busy が効く(新しい配線不要)。
- 閉じるボタンを **DOM 順で最初**に置く=`showModal()` の初期フォーカスが×に来る。
- `.ld-note` は「統計スナップショットであることの誠実な明示」の実装(会議の指摘の反映)。

### C-3. CSS 要点(index.html の inline `<style>` 末尾に追加・約40行)

```css
.ld { width: min(960px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); padding: 0; border: 0;
      border-radius: 18px; background: var(--bg); color: var(--ink); box-shadow: 0 24px 60px rgba(20,55,92,.35); }
.ld::backdrop { background: rgba(20,55,92,.45); }
.ld-panel { display: flex; flex-direction: column; max-height: calc(100dvh - 24px); }
.ld-bar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--line); background: var(--card); }
.ld-title { margin: 0; font-size: 1rem; flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--navy-deep); }
.ld-fresh { font-size: .78rem; color: var(--ink-sub); white-space: nowrap; }
.ld-close { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--line); background: #fff; cursor: pointer; font-size: 1rem; }
.ld-banner { margin: 0; padding: 8px 14px; font-size: .84rem; background: #fff1e6; color: #a13d0a; border-bottom: 1px solid rgba(200,114,28,.35); }
.ld-banner.is-error { background: #fdeeee; color: #8a1f1f; }
.ld-body { overflow: auto; padding: 12px; -webkit-overflow-scrolling: touch; }
.ld-live { box-shadow: none; }
.ld-note { margin: 12px 2px 0; font-size: .78rem; color: var(--ink-sub); }
.ld ol.rank li[data-uid] { cursor: default; }            /* MVP はモーダル内ホバー無し。help カーソルの嘘を消す */
html.has-modal { overflow: hidden; }                    /* 背面スクロール止め */
@media (max-width: 640px) { .ld { width: 100vw; max-height: 100dvh; margin: 0; border-radius: 0; } .ld-panel { max-height: 100dvh; } }
.detail-btn { display: inline-flex; align-items: center; gap: 4px; font-size: .78rem; color: var(--navy); padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); background: #fff; cursor: pointer; }
.detail-btn:hover { border-color: var(--orange); color: var(--orange); }
```

- `padding:0` は **背景クリック判定の前提**(§C-5)。dialog 自身に padding があると余白クリックが
  `e.target === dialog` になり誤閉じする。
- `.live` `.known` `.cols` `.col` `ol.rank` 等の既存クラスをそのまま使う=カードと**同じ配色・
  同じ並び**が自動で成立する。
- `.cols` の3列化は既存の `@media (min-width:720px)` = ビューポート基準。960px のモーダルなら
  3列(各約300px)で収まる。
- **スマホ幅の裁定**: `.tiles` は既存の `flex-wrap` のまま横スクロールにしない・上限も付けない。
  根拠: `identifiedSupporters` は gift 上位10＋ad 上位10 の合流で**構造上 ≤20 人**、
  `identifiedSupportersByName` は残り＋comment 上位10 で**合計 ≤30 人**(api の `rank=10`/
  `limit=10`/`COMMENT_RANKERS_MAX=10`、実在確認済み)。375px 幅なら 84px タイル×4列で最大8行=
  縦スクロールで全員見える。横スクロールは「見えない人がいる」を生み、キーボード操作もしづらい。

### C-4. entry.js の変更点(既存部分)

1. `renderRows(rows, liveId, kind, tr = tracker)`: `tracker.classFor` → `tr.classFor`。
   `renderCommentCol(l, tr = tracker)`も同様に受け渡し。既存呼び出しは無変更。
2. `render()` の `.stats-actions` 先頭に
   `elDialog ? `<button type="button" class="detail-btn" data-detail="${esc(l.liveId)}" aria-haspopup="dialog">🔍 詳しく見る</button>` : ''`
   ★`elDialog` が null(古い index.html がキャッシュされ新 JS だけ届いた場合)ならボタンを
   **描かない**(§G-1)。
3. `load()`:
   `.then((data) => { _lastCapturedAt=…; _lastData = data; render(data); prewarmRecent(data); safeDetailSync(data); })`
   `.catch((e) => { const msg = …; showState(msg); safeDetailSyncError(msg); })`
   `safeDetailSync` は try/catch で包む(モーダルの例外を `.catch → showState` に漏らして
   **ページ全体にエラーを出さない**)。
4. `_lastData` をモジュール変数に追加。順位番号は `detailRank(data, lv)` として
   `pinLiveFirst(sortByEstimatedConcurrent(lives, nowMs), PINNED_LV)` を再計算して
   `findIndex+1`(≤20件・純関数の再呼び出しなので安い)。

### C-5. entry.js 新セクション「配信詳細モーダル」(entry.js 末尾・約150行)

```js
const elDialog  = document.getElementById('liveDetail');
const elLdTitle = document.getElementById('ldTitle'), elLdFresh = document.getElementById('ldFresh'), elLdBanner = document.getElementById('ldBanner');
const elLdHead  = elDialog?.querySelector('.ld-head'), elLdKnown = elDialog?.querySelector('.ld-known'), elLdCols = elDialog?.querySelector('.ld-cols');

let _lastData = null;                 // 直近に render した応答(開くときの材料)
let _detailLv = '';                   // 開いている配信。'' = 閉じている
let _detailSnapshot = null;           // 最後に見つかった姿 { live, capturedAt }
let _detailTracker = createRowChangeTracker();
let _detailPushed = false;            // この履歴エントリは自分が pushState したか
let _closingFromHistory = false;      // popstate 起点の close(URL 同期を二重にしない)
let _pendingDetailFromUrl = '';       // 初回 load 成功まで待つ ?detail=1

function openDetail(lv, { fromHistory = false } = {}) {
  if (!elDialog) return;
  if (!LIVE_ID_RE.test(lv)) return;
  if (elDialog.open && _detailLv === lv) return;   // showModal は open 中に呼ぶと InvalidStateError
  _detailLv = lv; _detailSnapshot = null; _detailTracker = createRowChangeTracker();
  paintDetail(_lastData, '');            // 材料は直近の応答。無ければ missing-empty バナー
  if (!elDialog.open) elDialog.showModal();
  document.documentElement.classList.add('has-modal');
  if (!fromHistory) {
    try { history.pushState({ liveDetail: lv }, '', withDetail(location.search, lv)); _detailPushed = true; }
    catch { _detailPushed = false; }
  } else {
    _detailPushed = !!(history.state && history.state.liveDetail);
  }
}

function paintDetail(data, fetchError) {
  const live = findLive(data, _detailLv);
  if (live) _detailSnapshot = { live, capturedAt: Number(data.capturedAt) || Date.now() };
  const b = detailBanner({ found: !!live, snapshotAt: _detailSnapshot?.capturedAt || 0, fetchError }, Date.now());
  elLdBanner.hidden = (b.kind === 'ok');
  elLdBanner.textContent = b.text;
  elLdBanner.classList.toggle('is-error', b.kind === 'error');
  if (!live) { /* !_detailSnapshot なら 3ブロック空・title 既定・fresh 空 */ return; }  // ★snapshot があれば本文はそのまま(凍結)
  const l = live, nowMs = Date.now(), rankNo = detailRank(data, _detailLv);
  elLdTitle.textContent = `${(l.streamer?.name || '配信者')} ― ${l.title || l.liveId}`;
  elLdFresh.textContent = freshness(data.capturedAt, nowMs).text;
  hideCard();                                            // 差し替え前に旧 li を指すホバーを消す
  _detailTracker.begin();
  elLdHead.innerHTML  = renderHead(l, rankNo, data.capturedAt, nowMs);
  elLdKnown.innerHTML = renderKnown(identifiedSupporters(l), identifiedSupportersByName(l));
  const rows = supporterRows(l);
  elLdCols.innerHTML  = `<div class="col">…ギフト…${renderRows(rows.gift, l.liveId, 'gift', _detailTracker)}</div>`
                      + `<div class="col">…広告…${renderRows(rows.ad, l.liveId, 'ad', _detailTracker)}</div>`
                      + renderCommentCol(l, _detailTracker);
  _detailTracker.end();
  bindImgFallback(elDialog);
}

function safeDetailSync(data)      { if (!elDialog?.open) return; try { paintDetail(data, ''); } catch { showDetailPaintError(); } }
function safeDetailSyncError(msg)  { if (!elDialog?.open) return; try { paintDetail(_lastData, msg); } catch { showDetailPaintError(); } }
//  ★catch 側で paintDetail に渡すのは「直近の良い応答」。findLive が当たれば見た目は変わらず、バナーだけ error になる。
function showDetailPaintError()    { /* バナー is-error「表示に失敗したわ。「いま更新」で取り直せるわ」・本文は触らない・閉じない */ }

function closeDetail({ fromHistory = false } = {}) {
  if (!elDialog?.open) return;
  _closingFromHistory = fromHistory;
  try { elDialog.close(); } finally { _closingFromHistory = false; }
}

elDialog?.addEventListener('close', () => {              // ★Esc/背景/×/close() 全経路がここへ収束(cancel は使わない §G-3)
  document.documentElement.classList.remove('has-modal'); hideCard();
  const lv = _detailLv; _detailLv = ''; _detailSnapshot = null;
  if (!_closingFromHistory) {
    if (_detailPushed) { _detailPushed = false; try { history.back(); } catch {} }
    else { try { history.replaceState(history.state, '', withoutDetail(location.search) || location.pathname); } catch {} }
  }
  const btn = elList.querySelector(`[data-detail="${lv}"]`); if (btn) btn.focus();   // 60秒置換後でも lv で再発見
});
elDialog?.addEventListener('click', (e) => { if (e.target === elDialog) closeDetail(); });          // 背景クリック(padding:0 が前提)
elDialog?.querySelector('[data-ld-close]')?.addEventListener('click', () => closeDetail());
elList.addEventListener('click', (e) => { const b = e.target.closest?.('[data-detail]'); if (b) { e.preventDefault(); openDetail(b.getAttribute('data-detail') || ''); } });

window.addEventListener('popstate', () => {              // ★URL を読んで状態を合わせる(イベント回数に依存しない=冪等)
  const q = readDetailQuery(location.search);
  if (q.detail) openDetail(q.lv, { fromHistory: true }); else closeDetail({ fromHistory: true });
});

// 初回: ?detail=1 は「最初に lives が取れた render の直後」に開く(404/エラーのうちは待つ)
{ const q = readDetailQuery(location.search); if (q.detail) _pendingDetailFromUrl = q.lv; }
//  load の then(safeDetailSync の前段)で:
//  if (_pendingDetailFromUrl) { const lv = _pendingDetailFromUrl; _pendingDetailFromUrl = '';
//    if (findLive(data, lv)) openDetail(lv, { fromHistory: true });          // 見つかった→開く(push しない・state 無し→ _detailPushed=false)
//    else try { history.replaceState(null, '', withoutDetail(location.search)); } catch {} }  // 見つからない→開かず、既存 pin-missing に任せる
```

### C-6. イベントフロー(時系列)

```
[クリック] .detail-btn ──委譲(elList)──▶ openDetail(lv)
   ├─ paintDetail(_lastData)  … 既存4描画関数 → .ld-head/.ld-known/.ld-cols
   ├─ showModal()             … top layer・背面 inert・フォーカスは×へ
   └─ pushState(?lv=lv&detail=1)  _detailPushed=true

[60秒/手動] load() ── render(data) … elList 全置換(モーダルは #list の外=無関係)
                 └── safeDetailSync(data) ── findLive ─┬─ 当たり: 3ブロック差し替え・バナー hidden
                                                       └─ 外れ: 本文凍結・バナー missing(閉じない)
             ── catch(msg) ── showState(msg) ＋ safeDetailSyncError(msg) → バナー error・本文凍結

[Esc / 背景 / ×] ── dialog.close() ── 'close' イベント ── _detailPushed ? history.back() : replaceState(detail 除去)
                                                       └─ popstate → readDetailQuery → detail 無し → closeDetail(fromHistory)=既に閉・no-op

[戻るボタン(モーダル開)] ── popstate ── detail 無し ── closeDetail({fromHistory:true}) ── 'close' ── _closingFromHistory=true なので URL は触らない
[進むボタン]            ── popstate ── detail 有り ── openDetail(lv,{fromHistory:true}) ── push しない・_detailPushed = !!history.state.liveDetail
[直リンク ?lv=X&detail=1] ── 初回 load 成功 ── findLive ─┬─ 有: openDetail(fromHistory) ・ _detailPushed=false → 閉じたら replaceState
                                                         └─ 無: replaceState(detail 除去)・一覧の pin-missing 文言が出る
```

---

## D. データ欠損時のフェイルセーフ(★最重要)

原則: **`find` の外れは異常ではなく通常状態**(配信は60秒ごとに終わる・`MAX_LIVES=20` から
押し出される・`zero lives` で保存が更新されない)。したがって「例外を捕まえる」設計ではなく
「外れを第一級の状態として描く」設計にする。

| # | 状況 | 検出箇所 | 画面 | 閉じるか | 次の一手 |
|---|---|---|---|---|---|
| 1 | 開いた瞬間 `_lastData` に lv が無い(render と click の数ms競合・古いボタン) | `openDetail → paintDetail` | 本文空・バナー `missing-empty` | **閉じない** | ×／「いま更新」。60秒後の sync で見つかれば自動で本文が入る |
| 2 | 60秒更新で lv が消えた(配信終了・圏外) | `safeDetailSync` | 本文は**最後の姿を凍結**・バナー `missing`「最後に取れた N分前の情報」 | 閉じない | 以後の sync でも見つからない限り本文を触らない(経過時間も止まる=「止まった時計」を正直に見せる)。再び見つかれば通常へ戻る |
| 3 | fetch 失敗(オフライン・5xx・404 not collected) | `load().catch → safeDetailSyncError` | 本文凍結・バナー `error`「最新の取得に失敗（{msg}）。N分前の情報を表示中」 | 閉じない | 「いま更新」=既存 `load({refresh:true})`。成功したら sync がバナーを消す |
| 4 | `data.lives` が空 | `safeDetailSync`(findLive→null) | #2 と同じ | 閉じない | 同上 |
| 5 | 描画関数が例外(壊れた1件・想定外の形) | `safeDetailSync` の try/catch | バナー `error`「表示に失敗」・本文はその時点のまま | 閉じない | 例外は `load()` の Promise 連鎖に**漏らさない**(漏れると `.catch→showState` でページ全体に偽の障害表示が出る) |
| 6 | 直リンク `?lv=X&detail=1` で X が既に無い | 初回 load 成功時 | モーダルを**開かない**。`detail` を replaceState で落とし、既存 `pin-missing`(「その配信はもう放送が終わったみたい」)に任せる | — | 一覧の方が有用。空のモーダルで一覧を隠すのは摩擦 |
| 7 | 直リンクだが初回 load が 404/失敗 | `_pendingDetailFromUrl` 保留 | ページ既存の `showState` のみ | — | 最初に lives が取れた render まで待つ |
| 8 | `#liveDetail` が DOM に無い(HTMLとJSのキャッシュずれ) | 起動時 `elDialog===null` | `.detail-btn` を描かない・popstate/初回判定も no-op | — | 次回リロードで揃う。壊れた画面を出さない |

**「勝手に閉じる」を構造的に不可能にしている点**: モーダルを閉じる呼び出しは `closeDetail()`
(UI3経路と popstate)だけ。`safeDetailSync`/`safeDetailSyncError`/`paintDetail` のどこにも
`close()` が無い。`render()` は `#list` の子しか触らない。

**「嘘をつかない」文言の規律**(AGENTS §12.7): バナーは「放送が終わった」と**断定しない**
(圏外の可能性が実在する: `.slice(0, MAX_LIVES)`)。「放送が終わったか、上位から外れたみたい」と
両論で書く。

---

## E. MVP(1つだけ作るなら)

**「開く・閉じる・60秒更新に耐える」の3点セット**(§C-4 + §C-5 の openDetail / paintDetail /
safeDetailSync / safeDetailSyncError / close イベント + §D の表)。既存4描画関数の再利用なので
新しい見た目は作らない。

含めるもの: トリガーボタン・`<dialog>` 骨格・3ブロック描画・バナー3状態・×／Esc／背景クリック・
`has-modal` スクロール止め・フォーカス復帰。

**履歴同期(pushState/popstate)は MVP に含める**。理由: スマホの「戻る」でモーダルが閉じることは
Web モーダルの期待動作であり、途中で切ると「pushState だけしてしまう」事故が起きやすい。
**切るなら pushState ごと切る**(URL を一切触らなければ戻るボタンは普通に前ページへ行き、
壊れない)。半分だけ入れるのが最悪。

後回し(順): ①モーダル内のホバー発言カード(§G-7) ②モーダル内の X シェア
③`closedby="any"` 等の新属性への置き換え。

---

## F. 捨てた案と理由

1. **カード全体クリック(+リンク除外)**: `.live` 内には `.shot`・`.sname`・`h2 a`・`.url`・
   `.rank-link`・`.tile`・`.ext-link`・`.share-x` と **8種のリンク**が既にある(実在確認済み)。
   除外リストは必ず漏れる。加えて comment 行は `cursor:help` でホバー発言を出す領域で、
   クリック意図が三重になる。専用ボタン1つの方が意図が一義。
2. **拡張の会場モードの移植(コメントが流れる画面)**: サーバに本文は無い(privacy §14・api は
   `count` だけ保存、`COMMENT_RANKERS_MAX=10`)。流れる演出を作るには本文をサーバ経由で配る
   必要があり「新データ・新API を作らない」制約と privacy 文言に反する。動的に見せかけて
   止まっているコメント欄は不信感の源。**静的スナップショットとして誠実に見せる**
   (`.ld-note` に上位10人・本文非保存を明記)。
3. **別ページ `/live/<lv>/`**: vercel.json の OGP rewrite・`liveOgHtml` の `og:url`・
   site-health が「/live/ は1ファイル」前提。ルーティング追加は3箇所を同時に壊す。既存の
   `?lv=` に `&detail=1` を足すだけなら rewrite 条件(`query key lv` のみ、実在確認済み)を
   素通りし、OGP カードもそのまま出る。
4. **モーダル内の独立 fetch ループ(会議の提案)**: §B のとおり訂正。真因は DOM の置き場。
   fetch を2本にすると throttle/inFlight/404 の分岐を二重に持ち、`setBusy` の状態も割れる。
5. **参加者アイコンの横スクロール+表示上限**: データが API 上限で ≤30人に構造的に縛られている
   (§C-3)。上限値の議論は不要で、横スクロールは「見えない人がいる」を作る。既存 `.tiles` の
   折り返しを再利用。
6. **`dialog.show()`(非モーダル)**: Esc の自動クローズ・`::backdrop`・背面 inert が失われ、
   60秒更新中の背面と操作が混ざる。`showModal()` 一択。
7. **`cancel` イベントで URL 同期**: Chrome は連続 Esc で `cancel` を飛ばして直接閉じることが
   ある(close watcher の乱用防止)。`close` イベントに収束させる(§C-5)。
8. **直リンクで配信が無いときに空モーダルを開く**: 一覧を隠して情報量ゼロ。既存 `pin-missing`
   の方が親切(§D-6)。
9. **`renderRows` を tracker 共有のまま呼ぶ**: 共有 `tracker` の `prev` をモーダルが先に更新
   すると一覧側の `is-bumped` を奪う。第4引数で追跡器を差し替え、モーダルは自分の追跡器を持つ
   (§G-6)。

---

## G. 地雷と回避策

1. **HTML と JS バンドルのキャッシュずれ**: `index.html` は Vercel 静的・
   `app/dist/live-ranking.js` は別ファイル。片方だけ新しい状態が実在する。→ `elDialog` null
   ガードでボタンを描かない・全ハンドラを `?.` で no-op(§D-8)。逆(新HTML+旧JS)は空の
   `<dialog>` が DOM にあるだけで無害。
2. **`showModal()` の InvalidStateError**: 既に open・DOM 未接続で投げる。→
   `if (!elDialog.open)` ガード。二重クリック・popstate 連打で必ず踏む。
3. **Esc の `cancel` スキップ(Chrome close watcher)**: `cancel` に処理を置くと URL が同期
   されない回がある。→ `close` イベントのみに置く(§C-5)。
4. **背景クリックの誤判定**: `<dialog>` に padding があると余白クリックで
   `e.target === dialog` になり閉じる。→ `.ld { padding:0 }` + 内側 `.ld-panel` が全面を埋める
   (§C-3)。
5. **`history.back()` の二重処理**: UI close → `history.back()` → popstate →
   `closeDetail(fromHistory)` → 既に閉じているので no-op、の順序を守る。`_closingFromHistory`
   フラグで popstate 起点の close は URL を触らない。フラグは `try/finally` で必ず戻す。
6. **`tracker` の横取り**: 共有追跡器を通すと `prev[key]` がモーダル側で先に更新され、一覧の
   `is-bumped` が消える。→ 第4引数 `tr`。さらにモーダル用追跡器は **open ごとに作り直す**
   (`end()` が `seen` を今回キーだけにリセットするため、別配信を開くと全行 `is-new` で光る・
   初回描画は `firstPaint` で光らない=作り直しが正解)。
7. **ホバー発言カードが top layer の裏に隠れる**: `.recent-card` は `body` 直下
   `position:fixed; z-index:50` だが、`showModal()` の dialog は top layer=z-index 無関係に
   最前面。しかも委譲は `elList` 限定なのでモーダル内ではそもそも発火しない。MVP では
   **モーダル内ホバー無し**と明記(`.ld ol.rank li[data-uid] { cursor: default; }` で help
   カーソルの嘘を消す)。Phase 2 で: 委譲先を `document` に・`showCardFor` で
   `elDialog.open ? elDialog : document.body` に `_card` を appendChild(移動)・`paintDetail`
   先頭で `hideCard()`(差し替えで `_hoverLi` が孤児になる)。
8. **`pushState` が投げる環境**: `file://` で開いた場合や埋め込み iframe で SecurityError。→
   すべて try/catch・失敗時は `_detailPushed=false` で URL 同期なしのモーダルとして動く。
9. **`?detail=1` を `PINNED_LV` に混ぜない**: `liveIdFromQuery()` は `lv` だけ読む。`detail`
   は新関数 `readDetailQuery` が読む。`PINNED_LV` は起動時 const のまま(モーダルを開いても
   一覧を並べ替えない=背面がガタつかない)。
10. **`.catch` への例外漏れ**: `safeDetailSync` を try/catch で包み忘れると、モーダル描画の
    TypeError が `showState` に流れてページ全体が「読み込みに失敗」表示になる。テストで
    「paintDetail が throw しても load の resolve 値が変わらない」を固定。
11. **`src/lib` の純粋性検査**(`scripts/check-layer.mjs` の毒語 `document|window|fetch|chrome.`):
    `liveDetailView.js` に `location`/`history` も書かない(規約上は毒語外だが趣旨に反する)。
    引数は `search` 文字列と `data`。
12. **tree-map / feature-map の赤**: 新ファイル追加で `npm run tree-map` の差分が出る。
    `scripts/repo-tree-map.mjs` の `FEATURES` に「ランキング(/live/)の配信詳細モーダル」1行
    (paths: `src/lib/liveDetailView.js`, `src/extension/live-ranking-entry.js`,
    `tsuioku-no-kirameki/live/index.html`)を足す。順序は既存メモリどおり
    `git add -A → tree-map → git add -A → verify:cc`。
13. **dist の同梱と指紋**: esbuild は import を辿るので `scripts/build.mjs` の entryPoints
    変更は不要。ただし `app/dist/live-ranking.js` は追跡ファイル(`.dist-fingerprint.json`)
    なので `npm run build` してから commit(pre-push の指紋ゲートで止まる)。
14. **bump 3点セット**: `extension/manifest.json`・`package.json`・`src/lib/changelog.js`
    先頭(summary 35字以内・例「/live/ の配信を大きく開く詳細表示」)。changelog 20版上限に
    近ければ `split-changelog.mjs`。
15. **CRLF**: このリポの一部ファイルは CRLF。Edit の置換が空振りしたら改行を疑う。
16. **`aria-live="polite"` の `#list` と inert**: `showModal` 中は背面が inert になり AT から
    隠れるので、60秒更新の読み上げ二重化は起きない。逆にモーダル側は `#ldBanner role="status"`
    だけを live 領域にし、3ブロックの差し替えを読み上げさせない(60秒ごとに全文読み上げは害)。
17. **スマホ全画面時の `100dvh`**: `.ld-panel` にも `max-height` を明示しないと `.ld-body` の
    `overflow:auto` が効かず下端が切れる(§C-3 で両方に書いてある)。
18. **`.fab-refresh`(z-index 30)がバックドロップの下に沈む**: 仕様どおり。モーダル内に
    `data-refresh` ボタンがあるので機能欠落は無い。

---

## 実装・検証の手順(実装者向け・順序固定)

1. `src/lib/liveDetailView.js` + `liveDetailView.test.js`(下記ケース)→ `npm run test:cc`
2. `index.html` に `<dialog>` と CSS → `npm run site-health`
3. `entry.js`: `renderRows/renderCommentCol` の第4引数 → `.stats-actions` にボタン →
   `load()` の2行 → 新セクション
4. `npm run build` → `npm run verify:cc`(`tree-map:check` が赤なら §G-12)
5. 実機(Claude Browser・`/nicolive-selfcheck` の流儀で司令塔が自分で):
   (a) 開く→60秒待つ→閉じない
   (b) 開いたまま Network を Offline にして「いま更新」→ error バナー・本文凍結
   (c) 戻るボタンで閉じる・進むで開く
   (d) `?lv=<終了済み>&detail=1` 直リンクでモーダルが開かず pin-missing が出る
   (e) 375px幅で全画面・縦スクロール・× が届く

## テストケース(`liveDetailView.test.js`)

- `readDetailQuery`: `'?lv=lv100001&detail=1'`→`{lv:'lv100001',detail:true}` /
  `'?detail=1'`→`detail:false` / `'?lv=LV100001 &detail=1'`→小文字化 /
  `'?lv=javascript:&detail=1'`→`lv:''` / `''`・`null`→安全
- `withDetail`: 他パラメータ保持・lv 上書き・不正 lv は恒等 /
  `withoutDetail`: `detail` だけ除去・lv 残る・空なら `''`
- `findLive`: 正規化一致・不在 null・`data` が null/配列でない/`lives` 非配列でも
  null(throw しない)
- `detailBanner`: 4状態の kind と文言・`found:true` で `fetchError` 無視・`snapshotAt`
  未来値でも落ちない(`freshness` の時計ずれ分岐を踏む)
- 配線テスト(既存流儀 `*.wiring.test.js`): `live-ranking-entry.js` の文面に
  `safeDetailSync(` が `render(` の後に現れる・`elList.innerHTML` 代入が `paintDetail` 内に
  **無い**・`close()` 呼び出しが `closeDetail` 内にしか無い
