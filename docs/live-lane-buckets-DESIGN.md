# /live/ に拡張の「会場参加者アイコン列」(4段構成)を再現する設計(council-fable手順2・3回目)

> 設計=Fable(claude-fable-5-1) / 素材集め=無料会議3回目(5体) / 裏取り=司令塔(Sonnet 5) / 2026-09-27
>
> council-fableワークフロー3段構えの手順2の成果物(3回目)。1回目
> [`live-comment-motion-DESIGN.md`](live-comment-motion-DESIGN.md)、2回目
> [`live-gift-pulse-DESIGN.md`](live-gift-pulse-DESIGN.md)とは別の設計だが、2回目の
> `giftPulse`(ギフト増分)をそのまま再利用する。

## 背景・経緯

1. 1回目・2回目の設計はいずれも「地味な演出に留める」方針だった。2回目のFable裁定
   (D-5)は「拡張のアイコン列は移植しない(6版がかりのちらつきバグの歴史があるため)」
   と明確に結論していた。
2. ユーザーが拡張の実画面(会場参加者301人・りんく/こん太/ギフト/たぬ姉の4段アイコン列)
   のスクリーンショットを見せ、「chrome拡張をひらいたようにしたいというリクエストに
   こたえてくれたかっとおもった」「この画面をほぼそのまま`/live/`で再現したい」と
   明言し、この決着を覆すことを承認した。
3. 3回目の会議(5体)は「無認証のため個々のユーザー情報は取得できない、4段構造は
   二段に簡素化すべき」と結論したが、これは**事実誤認**だった。司令塔が実コードで
   裏取りした結果、`/live/`には既に`identifiedSupporters`/`identifiedSupportersByName`
   という2段の振り分けロジックが実装済みで、拡張の4段構成のうち半分は既に土台がある
   ことが判明した。この誤りを訂正した上でFableに設計を委任した。

## 確定した制約(変更しない)

- 拡張の「実装」(3秒poll・2段paint・fillLaneTier)は移植しない(2回目裁定を維持)。
  今回変えるのは「表示構造をどこまで拡張に近づけるか」であって、「拡張のコードを
  持ってくるか」ではない。
- サーバー側でNDGRを「常駐」させることはしない。新しいインフラは導入しない。
  ニコニコへの問い合わせ頻度は増やさない。
- コメント本文は一切保存・表示しない(既存方針、継続)。

---

## A. 理想の体験フロー

訪問者が`/live/`を開くと、配信カードの`.stats`行の直下に、拡張のサイドパネルと同じ
**4段のアイコン列**が縦に並ぶ。上から**りんく段**(数値ID＋個人サムネが確定した人)、
**こん太段**(数値IDで名前まで分かる人。ゆっくり顔の点線枠)、**ギフト段**(ギフトを
投げた人だけ。各タイルに「+1,200pt」の増分バッジが付き、60秒ごとの取得で誰かが
投げていれば段の右肩に「🎁 ○○さんが +N pt」のPICK UPチップが灯る)、**たぬ姉段**
(匿名の応援。「匿名123」＋その番組の中だけで一定の似顔絵)。各段の見出しに人数が出る。
たぬ姉段だけは「匿名 42人・上位10人を表示」のように**人数とタイル数が別に**出る——
拡張が「会場参加者 N人・ほか N人」と書くのと同じ流儀で、載せ切れない分を隠さず数で
言う。タイルはサムネ・名前・ID・ニコ生ユーザーページへのリンクのセット(AGENTS §3.5)で、
コメント由来のタイルにマウスを乗せると既存のホバーカードでその人の直近発言が出る
(拡張の会場ホバーカードと同じ手触り)。60秒ごとの再取得で**新しく段に入った人だけ**が
入場アニメで現れ、ポイントが増えた人だけが一瞬光る。何も変わらなければ画面は
1ピクセルも動かない。

**拡張との距離を正直に**: 拡張の「会場参加者301人」は視聴WSから全発言者を拾える本人
環境の数字で、`/live/`の材料(koken上位10・nicoad上位10・コメント集計上位10)では
**1配信あたり最大30タイル前後**にしかならない。今回近づけるのは「4段という構造・段
ごとの意味・タイルの見た目・増分の見せ方」であり、「量」は近づかない。それを見出しの
人数(`commenters`/`anonCommenters`)で補い、タイル数と人数の差を「ほか N人」で明示する。
会議の「二段に簡素化」は採らないが、会議が正しかった部分(材料の**量**が無い)はこの形
で引き受ける。

## B. 統合アーキ(コンポーネント構成・既存との関係)

```
/api/live-ranking (既存・変更なし)
  gift: koken rankers ≤10 / ad: nicoad ranking ≤10 / comment: {rankers ≤10, commenters, anonCommenters, partial}
   └ load() 60秒 → render(data)  (live-ranking-entry.js:260-311)
        ├ tracker.begin() / giftPulse.begin()            (:281-282 既存)
        ├ laneTracker.begin()                            ★新規(隣に1行)
        ├ カードごと:
        │    rows = supporterRows(l); gp = giftPulse.pulseFor(...)   (:284-285 既存)
        │    buckets = laneBuckets(l, { avatarProbe })                ★新規(純関数)
        │    renderLanes(buckets, l.liveId, gp)  ← renderKnown(:301) を置き換える  ★変更
        ├ tracker.end() / giftPulse.end() / laneTracker.end()        (:308-309 + ★1行)
        └ bindImgFallback(elList)                                    (:310 既存。Phase 2 で .tava 分岐を差し替え)
```

| # | コンポーネント | ファイル | 役割 |
|---|---|---|---|
| 1 | **`liveLaneBuckets.js`(純ロジック・新規)** | `src/lib/liveLaneBuckets.js` + `.test.js` | 既存の`identifiedSupporters`/`identifiedSupportersByName`/`commentRows`/`supporterRows`を**呼ぶだけ**で4段に振り分ける。DOMを触らない。段の判定基準はここ1箇所。 |
| 2 | **配線(既存ファイルの置き換え・約+30行)** | `src/extension/live-ranking-entry.js` | `renderKnown`(:85-117)→`renderLanes`。タイル1枚のHTMLは`tileHtml`1関数に共通化(現在は第1段/第2段で2回書かれている)。`laneTracker`(第2の`createRowChangeTracker`インスタンス)。 |
| 3 | **見た目(既存`<style>`へ追記・約25行)** | `tsuioku-no-kirameki/live/index.html` | `.known`(:220-240)のクラス群は**そのまま使う**(`.tiles/.tile/.tava/.tname/.tid/.tpt/.tile-identicon/.tava-identicon`)。足すのは段ごとの見出し色・`.tiles li.is-new/.is-bumped`・`.lane-pick`・`.lane-more`。 |
| 4 | **開示文(1文)** | `live/index.html` たぬ姉の吹き出し(:382)・`.note`(:397-405) | 「4段はニコ生が公開している順位表と当サイトのコメント集計を**種類で分けただけ**。上位10人ずつしか載らない」。`privacy.html`は**変更不要**(取得する情報・頻度・保存が1つも変わらない。§14-1 :724の範囲内)。 |

**新しいAPI・ライブラリ・インフラ・エンドポイントは0本。`api/`・`scripts/`は1行も
触らない。ニコ生への問い合わせは1本も増えない。**

**`renderKnown`との関係(★明示)**: `renderKnown`は「りんく段＋こん太段」の描画体
そのもの。これを捨てず**4段のうち2段として`renderLanes`に吸収**する。第1段の`<li>`
マークアップ(:91-93)と第2段(:110-112)は`tileHtml`に統合し、`img.tava`(本物サムネ・
`bindImgFallback`の対象)と`img.tava-identicon`(識別絵・対象外)の区別(:106-109の
コメントの契約)は維持する。

**既存部品との関係(混ぜない・司令塔が実在確認済み)**
- `identifiedSupporters`(`liveRankingView.js:300-315`)＝りんく段、
  `identifiedSupportersByName`(:348-393)＝こん太段。**MVPではこの2関数を1文字も
  変えない**(`impact-check`の波及ゼロ)。
- `commentRows`(:225-274)の`anon:true`行＝たぬ姉段の材料。「匿名NNN ·d8Ky」の衝突
  解消(:250-272)も識別絵(`anonymousIdenticonDataUrl`)も**そのまま流用**。
- `supporterRows(l).gift`(:180-197)＝ギフト段の材料。`giftPulse`
  (`liveGiftPulse.js:66-100`)の`byKey`を`pulseRowKey`(:23-26)で引いてタイルに
  「+Npt」を載せる(ギフト列の行と**同じresult**を読むので二重計算なし)。
- `createRowChangeTracker`(:403-431)は**再利用する**(新インスタンス`laneTracker`、
  キーは`lv|段|uid`)。詳細はC-4。
- 拡張側の段の正本`src/domain/lane/tier.js:42-52`(tanu→link→kontaの順で評価・
  司令塔が実在確認済み。匿名は必ずたぬ姉)は`/live/`でも**評価順だけ借りる**(匿名
  判定を最初に通す)。`linkPolicy.js`/`kontaPolicy.js`自体はimportしない(拡張の
  `avatarObserved`等の観測フィールドは`/live/`の手元に無い。形だけ合わせても常に
  falseで嘘になる)。

## C. 具体機構

### C-1. 4段のうち何段が既存データで作れるか(★先に確定)

| 段 | 拡張の基準(`tier.js`/policies) | `/live/`の基準(既存データで機械判定できる形) | 材料・上限 | 鮮度 | 判定 |
|---|---|---|---|---|---|
| **りんく** | 非匿名 ∧ (観測サムネ ∨ 非合成URL ∨ 強い表示名) | 数値uid ∧ 公式APIのサムネURLが非blank(`identifiedSupporters`) | koken/nicoad 各≤10 → ≤20 | 60秒 | **既存のまま作れる**(拡張より厳しい基準=「確定サムネのみ」。Phase 2でコメント由来を昇格) |
| **こん太** | 非匿名 ∧ りんく不成立 | 数値uid ∧ りんくに居ない(gift/adのアイコン未設定＋コメント上位の強い表示名)(`identifiedSupportersByName`) | ≤30 | 60秒/約10分 | **既存のまま作れる**。★弱い表示名(`user12ABCd`等)の数値uidは`:376`の`isStrongNickname`で**捨てられ、今はどの段にも載らない**。拡張はこん太に入れる。→Phase 2で`opts.weakNames`として拾う |
| **ギフト** | ギフトを投げた人(`venueLaneMirrorSupply.js:21-22`の`gift`段・りんく等と両在籍) | `supporterRows(l).gift`のuid有り行。uid無し「名無し」(koken匿名)は**人数だけ** | ≤10 | 60秒 | **既存のまま作れる**(新規はタイル化だけ) |
| **たぬ姉** | 匿名(`a:`)は最優先でここ | `commentRows(l)`の`anon:true`行。見出しの人数は`comment.anonCommenters` | タイル≤10・人数は全数 | 約10分 | **既存のまま作れる**。★ギフト/広告の匿名は koken/nicoad が uid を返さないので**識別できない**=タイル化不可・人数のみ |

**結論: 4段すべて既存データで作れる。作れないのは「量」(上位10人ずつの壁:
`TALLY_DEFAULT_LIMIT=10`・`liveCommentTally.js:35`(司令塔が実在確認済み)、
`COMMENT_RANKERS_MAX=10`・`api/live-ranking.js:49`)と「ギフト/広告の匿名の個体識別」
の2点。** 前者は見出しの人数(`commenters`/`anonCommenters`)と「ほか N人」で、後者は
「名無し N人」で代替する(発明しない・隠さない)。

### C-2. `src/lib/liveLaneBuckets.js`(純ロジック)

```js
import {
  supporterRows, identifiedSupporters, identifiedSupportersByName, commentRows, isBlankIcon
} from './liveRankingView.js';
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';

/** 段の並び(拡張の会場と同じ順: venueLaneMirrorSupply.js:21 から ad を除いた4段)。 */
export const LANES = /** @type {const} */ (['link', 'konta', 'gift', 'tanu']);

/**
 * @typedef {{ uid: string, name: string, avatar: string, url: string, pts: string, point: number,
 *   identicon: boolean, hover: boolean }} LaneTile
 *   - identicon: true なら <img class="tava-identicon">(bindImgFallback 対象外)。false なら <img class="tava">。
 *   - hover: true ならコメント集計に居る人(li に data-uid/data-lv を付けてホバーカードの対象にする)。
 * @typedef {{ link: LaneTile[], konta: LaneTile[], gift: LaneTile[], tanu: LaneTile[],
 *   counts: { link: number, konta: number, gift: number, giftNameless: number,
 *             tanu: number, tanuTiles: number, commenters: number, partial: boolean } }} LaneBuckets
 */

/**
 * 1 配信 → 4 段。★純関数: 同じ payload(と同じ probe)からは deep-equal な結果が出る。
 *   これが「同じ capturedAt の再送で HTML が byte 同一 → 画面が動かない」の根拠(D-5c と同じ地平)。
 * @param {any} live
 * @param {{ avatarProbe?: ReadonlyMap<string, 'ok'|'missing'> }} [opts]  Phase 2 で使う(MVP は渡さない)
 * @returns {LaneBuckets}
 */
export function laneBuckets(live, opts = {}) {
  const c = live && live.comment && typeof live.comment === 'object' ? live.comment : null;
  const commentUids = new Set(commentRows(live).map((r) => r.uid));

  // りんく: 既存の第1段そのまま(gift/ad の確定サムネ)。
  const link = identifiedSupporters(live).map((p) => ({
    uid: p.uid, name: p.name, avatar: p.avatar, url: p.url, point: p.total,
    pts: ptsText(p.giftPt, p.adPt, 0), identicon: false, hover: commentUids.has(p.uid)
  }));
  // こん太: 既存の第2段そのまま(識別絵・点線枠)。
  const konta = identifiedSupportersByName(live).map((p) => ({
    uid: p.uid, name: p.name, avatar: p.avatar, url: p.url, point: p.count,
    pts: ptsText(p.giftPt, p.adPt, p.commentCount), identicon: true, hover: p.commentCount > 0
  }));
  // ギフト: koken 上位10のうち uid がある人(りんく/こん太との両在籍を許す=拡張と同じ)。
  const giftRows = supporterRows(live).gift;
  const gift = giftRows.filter((r) => r.uid).map((r) => {
    const real = !!r.avatar && !isBlankIcon(r.avatar);
    return {
      uid: r.uid, name: r.name, url: r.url, point: r.point,
      avatar: real ? r.avatar : anonymousIdenticonDataUrl(r.uid, 64), identicon: !real,
      pts: `🎁${fmt(r.point)}`, hover: commentUids.has(r.uid)
    };
  });
  const giftNameless = giftRows.length - gift.length;
  // たぬ姉: コメント集計の匿名行(commentRows が既に「匿名NNN(·断片)」と識別絵を付けている)。
  const tanu = commentRows(live).filter((r) => r.anon).map((r) => ({
    uid: r.uid, name: r.name, avatar: r.avatar, url: '', point: r.point,
    pts: `💬${fmt(r.point)}`, identicon: true, hover: true
  }));

  return {
    link, konta, gift, tanu,
    counts: {
      link: link.length, konta: konta.length, gift: gift.length, giftNameless,
      tanu: c ? Number(c.anonCommenters) || 0 : 0, tanuTiles: tanu.length,
      commenters: c ? Number(c.commenters) || 0 : 0, partial: !!(c && c.partial)
    }
  };
}

/** タイルの追跡キー(段×uid)。★匿名 uid(a:…)はその番組の中で一定(privacy §14-1)なので鍵に使える。 */
export function laneTileKey(liveId, lane, tile) {
  return `${liveId}|${lane}|${tile.uid}`;
}

/** 「匿名 42人・上位10人を表示」/「名無し 3人」の文言。載せ切れない分を数で言う(venueBar.js:5084 の「ほか N人」と同じ流儀)。 */
export function laneMoreText(lane, counts) { /* tanu: counts.tanu > counts.tanuTiles → `ほか ${diff}人`; gift: giftNameless>0 → `名無し ${n}人` */ }
```

`ptsText`は`renderKnown`(:90, :103-105)にある「🎁 📣 💬」連結を関数化したもの(entry
から移す。**同じ書式**)。

**テスト(`liveLaneBuckets.test.js`)で固定する契約**
1. **純粋性**: 同じ`live`を2回渡すと`deep-equal`(順序含む)。★これが「再送で画面が
   動かない」の機械保証。
2. **排他**: 1つのuidは`link/konta/tanu`の**高々1つ**にしか居ない(`gift`との重複は許す)。
3. **匿名の隔離**: `a:`uidは`link/konta/gift`に**絶対に出ない**(`tier.js`の
   「tanu最優先」契約の`/live/`版)。koken匿名(uid'')は`gift`に載らず`giftNameless`に
   数えられる。
4. **既存2段の恒等**: `buckets.link`のuid列＝`identifiedSupporters(live)`のuid列、
   `buckets.konta`のuid列＝`identifiedSupportersByName(live)`のuid列(**既存の顔ぶれを
   1人も変えない**=回帰面ゼロ)。
5. `counts.tanu`は`anonCommenters`、`counts.tanuTiles`は匿名タイル数。`comment:null`
   なら両方0・`partial:false`。
6. `hover`はコメント集計に居るuidだけtrue(ギフトだけの人にホバーを付けて「発言なし」の
   空カードを出さない)。

### C-3. `live-ranking-entry.js`の配線(追記箇所を名指し)

```js
// import(:13-20 付近)
import { laneBuckets, laneTileKey, laneMoreText, LANES } from '../lib/liveLaneBuckets.js';
const laneTracker = createRowChangeTracker();   // ★:37 の tracker とは別インスタンス。キーは段×uid。名前も別。

// タイル1枚(renderKnown :91-93 と :110-112 を統合)
/** @param {LaneTile} t @param {string} cls tracker のクラス @param {string} hoverAttr */
function tileHtml(t, cls, hoverAttr) {
  const img = t.identicon
    ? `<img class="tava-identicon" src="${esc(t.avatar)}" alt="" loading="lazy" decoding="async">`
    : `<img class="tava" src="${esc(t.avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  const body = `${img}<span class="tname">${esc(t.name)}</span><span class="tid">${esc(t.url ? t.uid : '')}</span><span class="tpt">${esc(t.pts)}</span>`;
  const a = t.url
    ? `<a class="tile${t.identicon ? ' tile-identicon' : ''}" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer" title="${esc(t.name)}（ID ${esc(t.uid)}）">${body}</a>`
    : `<span class="tile tile-identicon tile-anon" title="${esc(t.name)}">${body}</span>`;   // 匿名はリンク先が無い(renderRows :155-157 と同じ扱い)
  return `<li${cls ? ` class="${cls}"` : ''}${hoverAttr}>${a}</li>`;
}

// 4段(renderKnown を置き換える)
const LANE_HEAD = {
  link:  { face: FACE.linkSmile,  label: 'サムネ付きで応援した人', hint: '数値ID＋個人サムネが揃った人' },
  konta: { face: FACE.kontaSmile, label: '名前で応援した人',       hint: 'サムネ未確定・名前は分かる人' },
  gift:  { face: FACE.kontaHalf,  label: 'ギフトを投げた人',       hint: 'ニコ生公開の上位10人' },
  tanu:  { face: FACE.tanuNormal, label: '匿名で応援した人',       hint: '匿名（184）のコメント。番組内だけの番号と似顔絵' }
};
/** @param {LaneBuckets} b @param {string} liveId @param {PulseResult} gp */
function renderLanes(b, liveId, gp) {
  const pick = renderGiftPick(gp);   // Phase 3。MVP は '' を返す stub でよい
  return `<div class="lanes">${LANES.map((lane) => {
    const tiles = b[lane];
    const h = LANE_HEAD[lane];
    const cnt = lane === 'tanu' ? `${num(b.counts.tanu)}人` : `${num(tiles.length)}人`;
    const more = laneMoreText(lane, b.counts);
    const head = `<h3 class="lane-${lane}"><img src="${esc(h.face)}" alt="" loading="lazy" decoding="async">${esc(h.label)} `
      + `<span class="cnt">${cnt}</span>${more ? `<span class="lane-more">${esc(more)}</span>` : ''}<span class="hint">${esc(h.hint)}</span>`
      + (lane === 'gift' ? pick : '') + `</h3>`;
    if (!tiles.length) return head;   // ★空の段は見出しだけ残す(構造を固定=段が現れても下が跳ねない)
    return head + `<ul class="tiles">${tiles.map((t) => {
      const rp = lane === 'gift' && gp ? gp.byKey.get(`u:${t.uid}`) : undefined;   // pulseRowKey と同じ形
      const cls = [laneTracker.classFor(laneTileKey(liveId, lane, t), t.point), rp ? `is-gifted tier-${rp.tier}` : ''].filter(Boolean).join(' ');
      const hoverAttr = t.hover ? ` data-uid="${esc(t.uid)}" data-lv="${esc(liveId)}"` : '';
      const tile = tileHtml({ ...t, pts: rp ? `${t.pts} ${formatPtDelta(rp.delta)}` : t.pts }, cls, hoverAttr);
      return tile;
    }).join('')}</ul>`;
  }).join('')}</div>`;
}

// render()(:260-311)
tracker.begin(); giftPulse.begin();
laneTracker.begin();                                                  // ★:282 の隣
...
  + renderLanes(laneBuckets(l), l.liveId, gp)                          // ★:301 の renderKnown(...) を置き換え
...
tracker.end(); giftPulse.end();
laneTracker.end();                                                    // ★:309 の隣
bindImgFallback(elList);
```

ホバーカードの委譲(:542-559)は`li[data-uid]`を拾うので、`hover:true`のタイルには
**コードを足さずに**直近発言カードが付く(X0・既に受容済み)。

### C-4. 「消す側に計器を置く」の4段への適用

**`createRowChangeTracker`は再利用できる(新インスタンス)。4段専用の追跡器は要らない。**
理由: 追跡器のAPIは`classFor(key, point)`で鍵と値に意味を持たない。`rowKey`(:439-441)が
**名前**を鍵にしているのは匿名でIDが欠ける順位表の事情であり、タイルはuid(匿名も
`a:`uidが番組内で一定)を鍵にできるので`laneTileKey`を使う。`begin/end`の対・初回全''・
`end()`で未touchを捨てる、の3性質はそのまま効く。

ただし`/live/`の「消す側」は拡張と形が違う。拡張の真因(`fillLaneTier`の無条件
`innerHTML=''`・毎poll`Object.freeze([])`リセット)は**描画コードの中に消す経路が
あった**。`/live/`は`render()`が`innerHTML`を1回同期で全置換する(:283)ので、消す経路は
**データ側**(前回に居たuidが今回のbucketsに居ない)と、**`bindImgFallback`の`.tava`
削除分岐(:174-177)**の2つだけ。計器はこの2つに置く:

1. **データ側=テストと純粋性で封じる**(2回目設計D-5cの規律4「消す側の計器はテストの
   形で置く」を踏襲)。C-2契約1〜4に加え、`liveLaneBuckets.wiring.test.js`
   (`liveGiftPulse.wiring.test.js`と同じ流儀=ソース文字列を読む)で固定:
   (a)`createRowChangeTracker()`の呼び出しが**ちょうど2回**でどちらもトップレベル
   (brace depth 0)、(b)`laneTracker.begin()`/`laneTracker.end()`が各1回、
   (c)`laneTracker =`の再代入0回、(d)`renderKnown(`が**0回**(置き換え漏れで2段が
   二重に出るのを機械で止める)、(e)`laneBuckets(`の呼び出しが`elList.innerHTML =`の
   **map内**にあり、`renderLanes`の前(2段paintにしない)。
2. **`.tava`削除分岐=Phase 2で無くす**(C-5)。MVPでは既存挙動のまま(サムネ404の人は
   60秒ごとに出て消える・D-5b#1)。この地雷はMVPでは**直さない**が、4段が主役になると
   目立つのでPhase 2の第一の理由になる。
3. **ランタイム計器は足さない**(MEMORY「計器を足して満足し直さない」)。代わりに
   reality-checkerの手順を1本: 同じ`capturedAt`の応答(throttled)を3回`render()`に
   流し、`elList.innerHTML`が**byte同一**であること、`.tiles li`の総数と`data-uid`
   集合が不変であることを確認する。これが「churn≡0」の判定で、拡張が6版かけて追った
   「repaint≈0なのに出入りする」を構造で排除していることの証拠になる。

### C-5. Phase 2: サムネ確認の負/正キャッシュとこん太→りんく昇格(★MVPには含めない)

コメント由来の数値uid(拡張なら強い名前でりんく)を`/live/`でもりんくに上げるには、
`deriveAvatarUrlFromUid`の**推測URLが本当に読めたか**が要る(`thumbnailConfirmed:false`
の契約を守る)。設計:

- module scopeに`const avatarProbe = new Map()` (`uid → 'ok'|'missing'`)。**単調**:
  一度入った値は上書きしない(最初の結果が勝つ)。これでuidの段移動は**ページ寿命で
  高々1回**(data変化を除く)。
- `bindImgFallback`(:168-190)の`.tava`分岐を「`<li>`削除」から
  「`avatarProbe.set(uid,'missing')`＋その場で`img.src`を識別絵に差し替え・
  `tile-identicon`を付ける」へ変更。`load`成功で`'ok'`。★`removeChild`を消す=
  wiring testで`removeChild`の出現0回を固定。
- こん太タイルのうちコメント由来の数値uidは、probe未確定なら
  `<img class="tava" src=導出URL>`で描き(識別絵ではなく推測サムネを**こん太段の中で**
  試す=段名が「サムネ未確定」なので嘘にならない)、次の`render()`で`'ok'`ならりんくへ、
  `'missing'`なら識別絵のままこん太に留まる。
- `laneBuckets(live, { avatarProbe })`が段判定にprobeを使う。
  `identifiedSupportersByName`に`opts.weakNames`を足して弱い表示名の数値uidも拾う
  (こん太の拡張)。**ここで初めて`liveRankingView.js`を触る**→`impact-check`が
  波及先(Xシェア・ギフト増分バッジ等)を列挙するので各featureの動作確認をする。
- テスト契約: probeの単調性(`'missing'`→`'ok'`にも逆にも変わらない)、`avatarProbe`を
  渡しても契約2(排他)・3(匿名隔離)は不変、probe空のときはMVPと**deep-equal**
  (後方互換恒等)。

### C-6. CSS(`live/index.html`の`.known`ブロック(:220-240)の隣に追記)

```css
.lanes { padding: 10px 14px 12px; border-bottom: 1px solid var(--line); background: linear-gradient(180deg, #fffdf9, #fff7ec); }
.lanes h3 { margin: 0 0 8px; min-height: 30px; font-size: .84rem; color: var(--navy-deep); font-weight: 700; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.lanes h3 + h3 { margin-top: 6px; }            /* 空の段(見出しだけ)が続くときの間隔 */
.lanes .tiles + h3 { margin-top: 10px; }
.lanes h3 img { width: 30px; height: 30px; object-fit: contain; }
.lanes h3 .cnt { color: var(--orange); font-variant-numeric: tabular-nums; }
.lanes h3 .hint, .lanes h3 .lane-more { font-size: .72rem; font-weight: 500; color: var(--ink-sub); }
.lanes h3.lane-gift .cnt { color: #c02a2a; }
.tile.tile-anon { cursor: help; }
/* 入場・増分は順位表と同じ控えめな動き(ol.rank li.is-* :300-305 の keyframes を再利用) */
.tiles li.is-new { animation: nl-live-enter 420ms ease-out; }
.tiles li.is-bumped .tile { animation: nl-live-pop 900ms ease-out; }
.tiles li.is-gifted .tile { background: linear-gradient(180deg, #fff, #fff2df); border-color: var(--orange); }
.tiles li.is-gifted.tier-mega .tile { border-color: #c02a2a; }
.lane-pick { margin-left: auto; font-size: .76rem; font-weight: 800; color: var(--orange); }   /* Phase 3 */
@media (prefers-reduced-motion: reduce) { .tiles li.is-new, .tiles li.is-bumped .tile { animation: none; } }
```

`.tiles`は**`flex-wrap: wrap`のまま**(横スクロール化しない。理由はG-3)。
`contain: size`/`content-visibility`は使わない(MEMORY・可変高さ)。

## D. 会場参加者数・PICK UPバナーの裁定(★必須)

### D-1. 「会場参加者 N人」

**拡張の数字の正体**: 視聴WSの発言を本人のブラウザで受け、**最終発言から4分以内**
(`VENUE_ROSTER_WINDOW_MS = 4*60_000`・`venueLiveRoster.js:30`)の発言者数(uid有り)。
載せ切れない分を「会場参加者 N人 ・ ほか N人」と書く(`venueBar.js:5084`)。つまり
**「いま(4分窓)しゃべっている人数」**。

**`/live/`にある候補と判定**

| 候補 | 正体 | 判定 |
|---|---|---|
| `estimateConcurrentForLive`(`liveRankingView.js:117-123`) | 累計来場×滞留率=**視聴者**の推定 | **参加者と呼ばない**。意味が違う(見ている人≠発言した人)。既存の「約N人 推定同時視聴」のまま据え置き。ラベルの流用は嘘になる |
| `comment.commenters`(集計・約10分) | 放送開始(または`partial`なら直近ぶん)からの**発言者の実数**(uid単位・匿名含む) | **採用**。ただし名称は「コメントした人 N人」(既に`renderCommentCol` :202が出している値)。**「会場参加者」「同時」の語は使わない**(窓が4分ではなく放送全体) |
| `comment.anonCommenters` | うち匿名の実数 | **採用**(たぬ姉段の見出し人数) |
| `l.commentCount`(番組合計・60秒) | のべ件数 | 人数ではない。1回目設計の脈拍の材料であり、ここでは使わない |
| 4分窓の発言者数を新設 | tallyのstateに`uid→lastAt`が要る(`STATE_MAX_BYTES`1MB・uids≤5000の中で増える)+cronは約10分なので「4分窓」の意味が薄い | **今回はやらない**(サーバ側・別設計)。★確定制約(新インフラ/問い合わせ増)には当たらないが、10分間隔のデータで「いま」を語る値になり、「実測点で語る」原則から外れやすい |

**結論**: 単一の「会場参加者 N人」は**再現しない**。代わりに(a)4段それぞれの見出しに
人数(りんく/こん太/ギフトはタイル数=実数、たぬ姉は`anonCommenters`)、(b)たぬ姉と
ギフトには「ほか N人」「名無し N人」で載せ切れない分、(c)ブロック全体の総数は書かない
(gift/ad上位10とcommentersは重複除去できない=足すと嘘)。`partial:true`のときはたぬ姉の
見出しに「直近ぶん」を添える(`renderCommentCol` :207の`col-note`と同じ正直さ)。

### D-2. 「PICK UP」バナー

**拡張の正体**(`venuePickupBanner.js`・`pickTickerHighlight.js`): 直近の**コメント
本文**(または「○○さんがギフトを贈りました」)を1件、常設の1枠に留める。選定はギフト
最優先(score 100・:195)、本文の長さで加点。**DOMは一度作ったら消さず中身だけ差し替え・
高さを先に確保**(:14-17)・同内容ならDOMを触らない(:100-110)。

**`/live/`での裁定(3つに分ける)**

| 形 | 判定 | 根拠 |
|---|---|---|
| **コメント本文のPICK UP** | **不可(蒸し返さない)** | 確定制約「本文を保存・表示しない」。ホバー(X0・能動操作)だけが例外 |
| **「○○さんがいまコメントした」(本文なし・人だけ)** | **不可** | 集計は約10分・時刻を保存していない(privacy §14-1 :724)。「いま」を言えば**時刻の発明**=1回目D-3②の禁止対象そのもの |
| **ギフトのPICK UP「🎁 ○○さんが +N pt(直近62秒)」** | **可。これが`/live/`のPICK UP** | 60秒ごとの**2実測の差**を次の実測まで静止表示=「個人単位の値は実測点でだけ変える」統一原則(2回目D-3)の**内側**。実体は2回目設計C-2の`renderGiftPulseStrip`(第2歩として保留中)。今回は置き場を**ギフト段の見出し右端(`.lane-pick`)**に定め、拡張と同じく**枠(見出し行)は常設・`min-height`固定・中身だけ変わる**にする。`EMPTY_PULSE`なら空文字(見出しの高さは変わらない)。同じ`capturedAt`では`giftPulse`が同一resultを返すので**byte同一**(diff-skipはデータ層で済んでいる) |
| **会議案「集計値のスパイク検知」バナー** | **不採用** | (1)「スパイク」の判定にはベースラインとしきい値が要り、それは**発明した数字**(MEMORY「数字を発明しない」)。(2)合計値の変化率は1回目設計の`formatRatePerMin`「+42/分」が**既に実測値として**表す設計になっており、バナー化は重複。(3)合計値を大きく見せる形は前々回の却下「大きく見せただけ」と同型。→ 個人の秒刻みには抵触しないが、価値が無い |

**1回目設計D-3②との整合の検証**: D-3②が禁じるのは「実測点の**間**を個人単位で
補間・脈打たせる・時刻を発明する」こと。ギフトPICK UPは(a)実測点でだけ変わる、
(b)値は差分(実測−実測)、(c)「直近 N 秒」と実測間隔を書き「いま」と言わない
(`spanText`)、(d)次の実測まで静止。4点すべて内側。**整合する**。会議案(スパイク)も
合計値なので原則上は許されるが、上記の理由で捨てる。

## E. MVP(最初に何を足すか)

**第1歩(このバンプ)**: `liveLaneBuckets.js`(+test+wiring test) ＋ `renderKnown`→
`renderLanes`置き換え ＋ **たぬ姉段・ギフト段の追加** ＋ 段の見出し(人数・ほかN人・
名無しN人) ＋ ギフト段タイルの`+Npt`(既存`giftPulse`の結果を読むだけ) ＋
`laneTracker` ＋ CSS ＋ たぬ姉吹き出し1文。**`liveRankingView.js`は無変更・`api/`
無変更。**

理由: (1) 拡張の4段構造が**この1歩で揃う**(りんく/こん太は既存、足りない2段を足す)。
(2) 既存2段の顔ぶれをC-2契約4で恒等に固定するので回帰面ゼロ。(3) ギフト段の`+Npt`は
`gp.byKey`を引くだけ(登録済みの`liveGiftPulse`をそのまま活かす)。(4) 純ロジック
1ファイル(~120行)+entry差し替え(+30行・560行→約590行、ラチェット無し)+CSS約20行。

**第2歩(効果を見てから・別バンプ)**: C-5(サムネprobe負/正キャッシュ・`.tava`削除
分岐の撤去・コメント由来のりんく昇格・弱い名前のこん太受け入れ)。★
`liveRankingView.js`を触るので`impact-check`の波及確認込み。
**第3歩**: ギフトPICK UPチップ(`renderGiftPulseStrip`の縮約版を`.lane-pick`へ・
約15行)。
**第4歩(候補・サーバ側)**: `COMMENT_RANKERS_MAX`/`TALLY_DEFAULT_LIMIT`を10→30へ
(ニコ生への問い合わせは増えない・Redis payload +数十KB)。こん太/たぬ姉のタイル数の
天井が上がる。★2回目D-4の「Z'(koken /histories で品名)」とは別件。

## F. 捨てた案と理由

| 案 | 判定・理由 |
|---|---|
| **会議の「二段(匿名/非匿名)に簡素化」** | **不採用**。前提「サムネ有無・匿名判定を無認証で取れない」が誤り: koken/nicoadは`thumbnailUrl`/`hasNoIcon`を返し(`supporterRows` :180-211)、集計は`anon`と`a:`uidを運ぶ(`sanitizeCommentEntry` :404-410)。4段すべて既存データで判定できる(C-1)。会議が正しかったのは「量が無い」点だけで、それは人数表示で引き受ける(D-1) |
| 拡張のアイコン列の**実装**を持ち込む(3秒poll・2段paint・`fillLaneTier`) | 2回目D-5の裁定を**維持**。持ち込むのは「4段という構造と見せ方」だけ。判定基準も`linkPolicy`等をimportせず`/live/`の手元の材料で書く(拡張の観測フィールドは無い=形だけ合わせると常にfalse) |
| 段を**横スクロール**の1行アイコン列にする(拡張の見た目に一番近い) | `innerHTML`全置換(60秒ごと)で`scrollLeft`が0に戻る=**60秒ごとに横位置が跳ぶ**新しいchurnを作る。`flex-wrap`のまま |
| りんく段を拡張と同じ「強い表示名だけでも入る」に広げる(MVPで) | 推測URLを本物のサムネとして出す=`thumbnailConfirmed`契約違反(AGENTS §3.6)。Phase 2のprobe(読めたことを確認してから)で上げる |
| ギフト段を「りんく/こん太に居ない人だけ」に絞る(重複排除) | 拡張は段では両在籍(`venueLaneMirrorSupply.js:69-70`は**席**を畳むだけで段は畳まない)。ユーザーの言葉「ギフトを投げた人だけが並ぶ」=独立した段 |
| 「会場参加者 N人」を`estimateConcurrentForLive`で出す | 視聴者の推定を参加者と呼ぶ嘘(D-1) |
| gift上位10+ad上位10+commentersを**足して**総人数 | 重複除去不能(commentersは人数のみでuid列が無い)。足せば必ず過大 |
| コメントPICK UP(本文/「いまコメント」) | 確定制約・時刻の発明(D-2) |
| 集計値スパイク検知バナー | しきい値の発明・1回目設計の速度表示と重複(D-2) |
| 4段専用の新しい追跡器 | `createRowChangeTracker`のAPIは鍵に意味を持たない。新インスタンス+`laneTileKey`で足りる(C-4) |
| ランタイムのchurn計器(出入り回数を画面/consoleに) | 「計器を足して満足し直さない」。純粋性テスト+byte同一の実機手順で判定(C-4) |
| 5段目「広告」を足す(拡張内部は5段) | nicoad上位10は`hasNoIcon`でなければほぼりんく段に既に居る。ユーザーのスクショは4段。増やさない |
| 空の段の見出しも消す | 段の出現で下が跳ねる。見出し行だけ残す(拡張の`paintStoryUserLaneDomEmptyGuides`と同じ「空でも枠は残す」) |
| ギフト/広告の匿名(「名無し」)をタイル化 | uidが無い→識別絵の鍵が無い→複数人が同じ顔になる嘘。「名無し N人」の数だけ |

## G. 地雷と回避策

1. **同じ`capturedAt`の再送(throttled/inFlight・初回`load().finally(load({refresh:true}))` :418)**: `laneBuckets`は純関数、`giftPulse`は同一result、`laneTracker.classFor`は`prev`と同値で''→HTMLがbyte同一。**この3つのどれかに`Date.now()`や乱数が混ざった瞬間に60秒churnが生まれる**。C-2契約1とwiring testで封じる。
2. **`.tava`の404で`<li>`削除(:174-177)は残る(MVP)**: そのuidは60秒ごとに出て消える(D-5b#1)。4段が主役になると目立つ。Phase 2で撤去。MVPの`tileHtml`でも`img.tava`クラス名を変えない(`bindImgFallback`のセレクタ`img.tava` :169が拾う前提を崩さない)。識別絵は必ず`tava-identicon`(対象外)。
3. **横スクロール禁止**(F参照)。`.tiles`は`flex-wrap: wrap`のまま。
4. **匿名タイルに`<a>`を作らない**: `nicoUserPageUrl`が''(`nicoUserPage.js:13-17`)。`renderRows` :155-157と同じく素の`<span class="tile">`。`.tid`も空(uidの断片は名前側「·d8Ky」が担う)。
5. **koken匿名行はuid''**(`uidFromUserPageUrl` :163-167)。`gift`段に載せず`giftNameless`へ。`pulseRowKey`も''(差分なし)=一貫。
6. **`hover:true`はコメント集計に居る人だけ**。ギフトだけの人に`data-uid`を付けると`/api/live-recent-comments`へ無駄なPOST+空カード。C-2契約6。
7. **`#list`は`aria-live="polite"`**: タイルはrender単位の静的テキスト(毎秒書換なし)なので洪水にならない。**タイルをJSで後から書き換えない**(1回目設計のrAF対象外)。
8. **段の評価順**: 匿名判定を**最初に**(`tier.js:45-48`の契約、司令塔が実在確認済み)。`commentRows`の`anon`は「申告 or リンクを作れないuid」(:239)なので`a:`以外のハッシュ風uidも匿名側に落ちる=りんく/こん太に混入しない。契約3で固定。
9. **並びの決定性**: `identifiedSupporters`/`ByName`のsortは同点時に入力順(Map挿入順=gift→ad→comment)に依存する。同じpayloadなら同じ順なので純粋性は保たれるが、**payload側でgift/adの並びが入れ替わると同点者の位置が変わる**(60秒に1回・稀)。気になるなら`laneBuckets`側で`uid`のtie-breakを足す(`liveRankingView.js`は触らない)。
10. **たぬ姉の人数とタイル数の乖離**: `anonCommenters`は全数、タイルは上位10のうちの匿名(0〜10)。見出しは必ず「匿名 N人」+「ほか M人」の2値で書き、タイル数を人数と呼ばない。`partial`なら「直近ぶん」を添える。
11. **鮮度が段で違う**(gift/りんく/こん太のgift・ad由来=60秒、コメント由来・たぬ姉=約10分)。段の見出しには書かず、既存の`elMeta`(:275-279)の「コメント集計 N分前」に任せる(2つの時計を段ごとに書くと読めない)。
12. **`renderKnown`の消し忘れ**: wiring testで`renderKnown(`の出現0回を固定(4段と旧2段が二重に出る事故)。
13. **verify:ccの4つの罠**: 新ファイル`src/lib/liveLaneBuckets.js`・`.test.js`・`.wiring.test.js`は**`git add`を明示列挙**。`scripts/repo-tree-map.mjs`の`FEATURES`に1行(feature「ランキング(/live/)4段アイコン列」・paths: `src/lib/liveLaneBuckets.js`, `src/extension/live-ranking-entry.js`, `tsuioku-no-kirameki/live/index.html`)→`npm run tree-map`(**`git add`の後**)→`npm run feature-map`。bump3点セット(summary35字以内、例「/live/ 応援者を4段のアイコン列で表示」)。`npm run impact-check`はMVPでは`liveRankingView.js`無変更なので波及なし(**Phase 2で発動**)。`npm run site-health`は文言追加のみ。
14. **`timeAuthorityRegistry`の祖父条項**: 新ファイルは時点を扱わない(`capturedAt`を引数にもコメントにも書かない)。書くなら`toEpochMs`経由。
15. **`live/index.html`はページ内JS禁止**(eslint.config.js)。CSSだけ。
16. **1回目設計(脈拍レーン)・2回目第2歩(リボン)と同時に実装しない**: 同じ`render()`と`.stats`直下を触る(AGENTS §12.5版混在)。今回のMVPを先に着地→第3歩(PICK UPチップ)は`.lane-pick`に置くのでリボンの置き場問題は消える(2回目C-2の「`.stats`と`.known`の間」は**この設計で置き換わる**)。
17. **文書の更新は司令塔専用**: `live-gift-pulse-DESIGN.md` D-5「推奨しない」・E「第2歩=リボン」に、本設計で**覆した点(構造は4段へ)と維持した点(実装は移植しない)**の1行注記を司令塔が追記する。実装担当に触らせない。
18. **「リアルタイム」「会場参加者」「同時」を書かない**。見出し・hint・吹き出しは「上位10人」「約10分ごとの集計」「前回取得との差」の語で。
19. **Phase 2のprobeは単調**(`'ok'`/`'missing'`は上書きしない)。CDNの一過性エラーで`'missing'`に固定される可能性は受け入れる(段が往復するより、識別絵で止まる方が安い)。ページ再読込でリセットされる。
20. **実機判定の手順(reality-checkerへ)**: (a)同一`capturedAt`の応答を3回`render()`に流し`elList.innerHTML`がbyte同一、(b)`.tiles li[data-uid]`集合が不変、(c)`a:`uidが`.lane-link`/`.lane-konta`/`.lane-gift`配下に**0件**、(d)`prefers-reduced-motion`でアニメ無し、(e)`npm run test:cc`でC-2契約1〜6とwiring test(a)〜(e)が緑。
