# 設計書 — 追憶のきらめき ランキング(/live/)が X でシェアされる仕組み・第1版(v2・3視点批判反映済み)

- 設計: Fable(claude-fable-5-1 サブエージェント) / 3視点批判(実装者・テスター・利用者)の裁定と v2 改訂: 司令塔(Claude Code) / 日付: 2026-09-14
- 正本の上流: `council/live-ranking-share-SYNTHESIS.md`(§1 決定表 A〜M は**確定**・ここでは蒸し返さない) / お題 `council/live-ranking-share-question.txt` / 承認済み計画 `~/.claude/plans/elegant-crunching-quokka.md`
- 位置づけ: `/council-fable` 3段構えの手順2の産物。実装者はこの1枚だけで着手できる密度で書く。行番号は 2026-09-14 時点の実ファイル(HEAD=9525b87b)で確認済み。
- ★v2 で変わった確定値は §12 に一覧。v1 の値(`𝕏`・「さん」テンプレ・`build/` 下の生成スクリプト・`lv3` のテスト等)は**使わない**。

## 1. 目的
- `/live/` の各配信カードに **JS ゼロの `<a>` 1本(X の Web Intent)** を置き、押した人が X の投稿画面で「配信者名＋番組名＋`?lv=` 付き URL＋#ニコ生」の下書きを得る。
- シェアされた URL(`/live/?lv=lvNNN`)を開くと **その配信が一覧の先頭に固定**される。終了していれば一言添えて一覧をそのまま見せる(摩擦ゼロ・AGENTS §12.3)。
- `/live/` の OG カードを**ランキング専用の静的 1 枚**(新ファイル名)に差し替え、og:title / og:description を確定する。
- privacy §14-2 を同一コミットで整合させる(押した事実を含め何も記録しない)。掲載される側(支援者)が §14-4 の窓口へ `/live/` から辿れるようにする。

## 2. 非目的(却下済み・第1版に入れない)
X API 自動投稿 / ブラウザ自動操作 / URL コピーボタン / UTM・Analytics 等の計器 / 最終スナップショット保存(privacy §14-3 改定なし) / 支援者名の投稿文・画像への自動挿入 / 配信ごとの動的 OG(第2段) / `via` / 重み付き文字数カウンタ / `statusShareUrls.js` 相乗り / `?ref=` 等の閲覧者識別 / `vercel.json` 変更 / api/ 変更 / X ロゴの SVG 化(第2段で実機確認後)。

## 3. 決定事項(SYNTHESIS §1 をそのまま継承)
A 中立文言(誰が押しても成立) / B 単位=配信1本(`?lv=`) / C 静的共通 OG を専用に1回焼く / D 支援者名は載せない / E `https://tsuioku-no-kirameki.com/live/?lv=lvNNN`・vercel.json 不変(rewrite `vercel.json:23-25` はクエリ条件なし=透過。実機で確認) / F 範囲=§4 / G TTL 1h 維持・不在なら elMeta に一言 / H 中立・固定・数値なし・全角60字以内 / I `hashtags=ニコ生`・via なし / J 計器なし / K origin は本番 canonical 定数 / L 第1版で1回焼く / M コピーボタンなし・`<a>` のみ。

## 4. 変更ファイルと差分の要点
| # | ファイル | 差分 |
|---|---|---|
| 1 | `src/lib/xIntentUrl.js`(新規) | `X_INTENT_BASE`・`buildXIntentUrl()`(§5.1)。import は `./htmlText.js` の `safeHttpUrl`(`htmlText.js:37-40`)のみ。★**本体ファイル**のコメントにも `capturedAt`/`persistedAt`/`measuredAt` を書かない(`timeAuthorityRegistry.test.js:11` の `TIME_FIELD_RE` が文字列検査。`.test.js` は `:37` で除外) |
| 2 | `src/lib/xIntentUrl.test.js`(新規) | §9 のケース。型は `statusShareUrls.test.js`(characterization+ネガコン) |
| 3 | `src/lib/liveRankingView.js` | 末尾(`rowKey` 268-270 の後)に `SHARE_NAME_MAX`/`SHARE_TITLE_MAX`/`SHARE_TEXT_MAX`・`pinLiveFirst()`・`liveShareText()` を追加(§5.2-5.3)。`LIVE_ID_RE`(27) を再利用。新 import なし(`timeAuthority.js` import 済み=`timeAuthorityRegistry.test.js:25-26` の免除条件を満たす) |
| 4 | `src/lib/liveRankingView.test.js` | 末尾(149 行・`describe` 閉じの前)に §9 のケースを追加 |
| 5 | `src/extension/live-ranking-entry.js` | import(13-16)に `LIVE_ID_RE, pinLiveFirst, liveShareText` と `buildXIntentUrl` を追加。`STORE_URL`(36) の直後に `SHARE_PAGE_URL`・`SHARE_HASHTAGS`・`liveIdFromQuery()`・`PINNED_LV`・`shareHref()`。`render()`(163-197): 177 の `sortByEstimatedConcurrent(...)` を `pinLiveFirst` で包み、elMeta(172-174)に不在文言、stats(181-188)の `.ext-link`(187) を `.stats-actions` で包んで `.share-x` を隣に(§5.4) |
| 6 | `tsuioku-no-kirameki/live/index.html` | 20-22 の og:title/og:description/og:image を §5.5 の確定値へ、23 の後に `og:site_name`/`twitter:image`/`twitter:image:alt` を追加。127-128 の `.ext-link` 2 行を**その場で** §5.7 の 3 行に差し替え(カスケード位置を動かさない)。108 の後に `.meta .pin-missing`。`.note`(352-357)の末尾に §5.11 の掲載停止への導線 1 行 |
| 7 | `tsuioku-no-kirameki/images/og-live-ranking.png`(新規・1200×630) | §5.6。生成スクリプトは **`tools/gen-og-live-ranking.py`(git 追跡)**。★`build/` は `.gitignore:23` で無視されるため、追跡される PNG の生成手段が clone 先で消える。既存の `tools/render-og.js`(追跡・`og-image.png` を焼く)と同じ置き場にする |
| 8 | `tsuioku-no-kirameki/privacy.html` | 723(§14-2)の段落末尾に §5.8 の1文。403 の「最終更新」を `2026年9月14日` に(681 が「改定時は冒頭の日付を明示」と約束している) |
| 9 | bump 3点+LP | `extension/manifest.json:4`・`package.json:3` → `0.1.1510`。`src/lib/changelog.js:20-29` の先頭に §5.9(★このファイルだけ CRLF・§8-2)。`tsuioku-no-kirameki/index.html` の 4 箇所は **`scripts/verify-bump.mjs:211-221` の正規表現 4 本**が照合する(行番号ではない): meta description の `（v…）`(14)・JSON-LD `softwareVersion`(28)・twitter:description の `（v…）`(45)・`data-part="footer" … data-version`(10274)。一括 `sed` ではなくこの 4 パターンを個別に置換 |
| 10 | `scripts/repo-tree-map.mjs` | `FEATURES`(103〜)に §5.10 の 1 行。`ROLES` は `tools`(83)が既にあるので追加不要 |
| 11 | 生成物 | `app/dist/live-ranking.js`(git 追跡・`scripts/build.mjs:207-208`)、`docs/repo-tree-map.*`・`docs/feature-map/*`・`docs/site-health.md`(各 npm script が再生成)、`src/lib/changelog-archive.js`(split-changelog が 1 版押し出す) |

`api/live-ranking.js` は触らない(name は `:235` で 80 字に切られ、title は `:259` で無制限=lib 側で切る)。`eslint.config.js` の max-lines(398/402/406)は popup-entry/popup/**/content-entry のみで entry 5 に制約なし。`scripts/layer-config.mjs:50` の forbid は `chrome/fetch/localStorage/sessionStorage/indexedDB/document/window`(`location` は含まれない=機械の担保なし。`src/lib/AGENTS.md` の純粋原則どおり `location` の読み取りは entry に置き、目視で守る)。

## 5. 仕様の確定値
### 5.1 `buildXIntentUrl({ text, url, hashtags, via })` → `string`(`src/lib/xIntentUrl.js`)
- `export const X_INTENT_BASE = 'https://x.com/intent/post'`。
- `text`: `String(text ?? '').trim()`。空なら省く。改行は保持(X composer は改行を受ける)。
- `url`: `safeHttpUrl(url)`(`/^https?:\/\//i` のみ通す・`javascript:`/`data:`/相対/空/全角は `''`)。`''` なら **`url` だけ省き text は残す**。理由: href 自体は常に `https://x.com/intent/post?...` なので `javascript:` が href に届く経路は無く、text だけでも投稿は成立する。全体を空にすると「ボタンが消える」=不具合が見えない。
- `hashtags`: `string | string[]`。文字列は `,` で分割。各要素は `trim()` → 先頭の `#` を全部剥がす(`/^#+/`)→ 空を落とす → `,` で連結。1つも残らなければ省く。★連結後の `,` は `encodeURIComponent` で `%2C` になる。第1版は 1 タグなので実害なし。複数タグの X 側解釈は未確認(テストの期待値 `hashtags=a%2Cb` は現仕様の固定であって X の保証ではない)。
- `via`: `trim()` → 先頭の `@` を剥がす。空なら省く。**第1版の呼び出し側は渡さない**。
- text と url が両方空なら `''` を返す(呼び出し側はリンクを描かない)。
- 組み立て: パラメータ順は固定 `text, url, hashtags, via`。値は **`encodeURIComponent`** で `k=v` を `&` 連結(`statusShareUrls.js:19` と同じ流儀。★`URLSearchParams` は空白を `+` にする。X の Web Intent 文書の例は `%20` で、`+` の解釈は未確認=曖昧さの無い方を選ぶ)。
- 引数 `undefined`/`null`/非オブジェクトでも投げない(`= {}` 既定値+各値の `??`)。

### 5.2 `pinLiveFirst(lives, lv)` → `{ lives: T[], found: boolean }`(`liveRankingView.js`)
- `arr = Array.isArray(lives) ? lives.slice() : []`(**元配列を壊さない**・非配列は空)。
- `id = String(lv ?? '').trim().toLowerCase()`。`LIVE_ID_RE.test(id)` が偽(空・`lv1`・`javascript:` 等)なら `{ lives: arr, found: false }`=**恒等(コピー)**。★`LIVE_ID_RE` は `/^lv\d{6,15}$/i`(**6〜15 桁**)。テストの lv は必ず 6 桁以上で書く(`lv3` は不合格=恒等パスに落ちて先頭固定を検証できない)。
- 一致判定は `String(l?.liveId ?? '').trim().toLowerCase() === id`。最初の一致 1 件を `splice` で抜いて `unshift`。他の順序は保つ。既に先頭なら並びそのまま `found: true`。不在なら `{ lives: arr, found: false }`。
- **状態を持たない**(呼ぶたびに判定。メモ化しない)。60 秒ごとの再描画で対象が消えれば次の呼び出しで `found:false` になる。

### 5.3 `liveShareText(live)` → `string`(`liveRankingView.js`)・テンプレ確定(v2)
- 材料は `live.streamer.name` と `live.title` だけ。**時刻・経過時間・人数・pt は入れない**(投稿した瞬間に古くなる)。
- 正規化: `String(x ?? '').replace(/\s+/g, ' ').trim()`。切り詰めは **コードポイント単位**(`Array.from`)で `max` 超なら `max-1` 文字+`…`(U+2026)。サロゲートペア(絵文字)は割れない。NFD の結合文字は分割されうるが実害は境界 1 文字の見た目のみで許容。
- 定数: `SHARE_NAME_MAX = 18` / `SHARE_TITLE_MAX = 24` / `SHARE_TEXT_MAX = 60`。
- ★v2: 「さん」を付けない**見出し体**にする(配信者本人が押しても「自分を〇〇さん」と呼ぶ文にならない。第三者が押しても見出しとして自然)。
  - name あり・title あり: `{name}の配信「{title}」を、いま支えている人`(固定部 15 字: `の配信「」を、いま支えている人`)
  - name 空・title あり: `この配信「{title}」を、いま支えている人`(固定部 16 字)
  - name あり・title 空: `{name}の配信を、いま支えている人`(固定部 13 字)
  - 両方空: `この配信を、いま支えている人`(14 字)
- 最大長(実測・`Array.from` で数える): 18+15+24=**57** / 16+24=**40** / 18+13=**31** / **14**。全部 ≦ 60 で**構造的に**収まる。X の重み(CJK=2・URL=23・`#ニコ生`)を足しても 280 に遠く、カウンタは不要。

### 5.4 entry 側(`src/extension/live-ranking-entry.js`)
```js
const SHARE_PAGE_URL = 'https://tsuioku-no-kirameki.com/live/';   // ★本番 canonical に固定(プレビュー/app. から押しても本番 URL)
const SHARE_HASHTAGS = ['ニコ生'];
/** 起動時に 1 回だけ ?lv= を読む(live-view-entry.js:46-55 の型。正規表現は lib の LIVE_ID_RE を使う)。不正なら ''。 */
function liveIdFromQuery() {
  try { const lv = String(new URLSearchParams(location.search).get('lv') || '').trim().toLowerCase(); return LIVE_ID_RE.test(lv) ? lv : ''; }
  catch { return ''; }
}
const PINNED_LV = liveIdFromQuery();
/** @param {any} l */
function shareHref(l) {
  const id = String(l && l.liveId || '').trim().toLowerCase();
  const url = LIVE_ID_RE.test(id) ? `${SHARE_PAGE_URL}?lv=${id}` : SHARE_PAGE_URL;
  return buildXIntentUrl({ text: liveShareText(l), url, hashtags: SHARE_HASHTAGS });
}
```
- `render()` 177: `const { lives: ordered, found } = pinLiveFirst(sortByEstimatedConcurrent(lives, nowMs), PINNED_LV); const missing = !!PINNED_LV && !found;` → `elList.innerHTML = ordered.map(...)`。合成順序は **賑わい順を作ってから 1 件を先頭へ**(逆だと sort が pin を壊す)。
- elMeta(172-174)の顔: `f.stale ? FACE.tanuNormal : (missing ? FACE.tanuHalf : FACE.kontaSmile)`。末尾に `missing` のときだけ `・<span class="pin-missing">その配信はもう放送が終わったみたい。いま支えている人の一覧は、そのまま見られるわ</span>`(★v2 確定文字列・たぬ姉の声・SYNTHESIS G)。lv 指定かつ found のときの文言は変えない。lives が空の早期 return(165-169)は変えない(=一覧が空なら pin 不在文言は出ない・§6)。
- stats 行 187: `.ext-link` を `<span class="stats-actions">` で包み、その中で `.ext-link` の直後に、`const sx = shareHref(l);` が空でなければ:
  `<a class="share-x" href="${esc(sx)}" target="_blank" rel="noopener noreferrer" title="X（旧 Twitter）の投稿画面が新しいタブで開くだけよ。押したことも含めて、当サイトは何も記録しないわ">X でシェア</a>`
  ★v2: ラベルは素の `X`(U+1D54F `𝕏` はリポで初出・Meiryo/Hiragino に無く豆腐化しうる・未確認のため使わない)。title 属性はスマホでは出ないので、説明の正本は privacy §14-2(§5.8)。
- listener は付けない(60 秒ごとの innerHTML 全再構築で消えるため。`AUTO_REFRESH_MS`=213)。

### 5.5 `live/index.html` head(20-23)の確定値(v2)
- 20 `og:title`: `いま配信を支えている人 ― ニコニコ生放送（追憶のきらめき ランキング）`(36 字。★意味を前に・固有名を後ろに。末尾が切れても「ニコ生の・いま支えている人」が残る。X のカード上の title 表示字数は未確認)
- 21 `og:description`: `いまこの瞬間、誰が配信を支えているか。ギフト・広告で応援した人を配信ごとに、配信サムネ・配信者・経過時間つきで。主役は配信者ではなく「応援した人」。`
- 22 `og:image`: `https://tsuioku-no-kirameki.com/images/og-live-ranking.png`
- 23 の後に追加: `<meta property="og:site_name" content="追憶のきらめき ランキング">`・`<meta name="twitter:image" content="https://tsuioku-no-kirameki.com/images/og-live-ranking.png">`・`<meta name="twitter:image:alt" content="追憶のきらめき ランキング ― ニコニコ生放送で、いま配信を支えている人（ギフト・広告）をリアルタイムに表彰するページ">`(LP `index.html:40,46-47` と同じ流儀)。`twitter:title/description` は足さない(X は無ければ og:* を読む)。canonical(17)/og:url(19) は `/live/` のまま。

### 5.6 OG 画像(1200×630・`tsuioku-no-kirameki/images/og-live-ranking.png`)
- 生成: **`tools/gen-og-live-ranking.py`**(git 追跡)。`build/store-listing/_gen_x_header_live_ranking.py` の `bg()`/`logo_card()`/`char()`/`pill()` と配色定数(`NAVY_*`/`CREAM`/`ORANGE`/`GOLD`/`INK`・9-32 行)・フォント(`C:\Windows\Fonts\BIZ-UDGothicB/R.ttc`・Windows ローカルで 1 回焼く前提でよい)・素材(ロゴ `extension/images/logo/kimito-link-ginga-color.png`、キャラ `…/link/link-yukkuri-smile-mouth-open.png`・`…/konta/kitsune-yukkuri-smile-mouth-open.png`・`…/tanunee/tanuki-yukkuri-smile-mouth-open.png`)を**コピーして**(build/ は gitignore 下で import できない)`W,H=1200,630` に置き換える。出力先 `tsuioku-no-kirameki/images/`、確認用 `_guide.png` は `build/store-listing/`。末尾で `print(im.size, os.path.getsize(out))` を出す。
- セーフ枠: 上下左右 8% 内側(x 96〜1104・y 50〜580)。要素は全部この内側。
- 載せる要素と優先順位: ①ロゴ(主役・クリームのカードに載せる・LOGO-RULES「明るい地」) ②見出し「追憶のきらめき」(CREAM 64px)+「ランキング」(GOLD 54px・2行目) ③副題「いま配信を支えている人が、リアルタイムで見える」(28px)+「ニコニコ生放送 ／ ギフト・広告で応援した人を配信ごとに」(22px) ④3キャラ(笑顔) ⑤ピル 2 つ: URL「tsuioku-no-kirameki.com/live/」(ORANGE)と **`⚡ リアルタイム`**(CREAM 地・INK 文字・ページの `.realtime-badge`(live/index.html:302)と同語・数字なし)。**数字は載せない**(ヘッダー画像の「60秒ごと」ピルは載せない)。
- 配置の初期値(目安。焼いた `_guide.png` で重なりを目視し調整してよい。**確定した座標はスクリプトに残す**): ロゴカード (110,150,300×236) / 見出し tx=450 y=150・228 / 副題 y=310・352 / ピル y=392(URL)・同行右隣(⚡) / キャラは**ロゴの下・左下**に たぬ姉(96,440,h140)・りんく(216,415,h165)・こん太(336,440,h140)(右側は文字列と重ねない)。
- 制約: PNG は 5MB 以下(X の上限・お題 B)かつ `check-large-tracked-files` の 5MB 閾値(AGENTS §13)。**焼いた直後に §8-1 の機械チェック**。参考: 既存 `og-image.png` は 2400×1260・1,059,481 bytes(`ls -la` 実測)。

### 5.7 CSS(`live/index.html`・v2)
127-128 の 2 行を**その場で**次の 3 行に差し替える(前後の `.cta-band .cta-row`(126)と `.cta-foot`(129)の間から動かさない):
```css
.stats-actions { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }
.ext-link, .share-x { display: inline-flex; align-items: center; gap: 4px; font-size: .78rem; color: var(--navy); text-decoration: none; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); background: #fff; }
.ext-link:hover, .share-x:hover { border-color: var(--orange); color: var(--orange); }
```
`margin-left:auto` は `.ext-link` から `.stats-actions` へ移す(2 つのリンクが**一塊で**右端に寄り、`flex-wrap: wrap`(`.stats` 212)で折り返しても離ればなれにならない)。並びは 🧩 → X。108 の後に `.meta .pin-missing { color: #a13d0a; font-weight: 600; }`(`.stale` と同じ見た目・意味は別なので別クラス)。

### 5.8 privacy §14-2(723)に足す1文(確定・v2)
`ページ内の「X でシェア」は、X（旧 Twitter）の投稿画面を新しいタブで開くだけのリンクです。押したことを含め、当サイトは何も記録・送信しません（投稿するかどうか、投稿の内容は、X の画面でご自身が決めます）。`

### 5.9 changelog エントリ(`src/lib/changelog.js` 先頭・`CHANGELOG_SUMMARY_MAX=35`・v2)
```js
Object.freeze({
  version: '0.1.1510', date: '2026-09-14',
  summary: 'ランキングを X でシェアできるようにしました',   // 23 字
  items: Object.freeze([
    '★追憶のきらめき ランキング(/live/)の各配信に「X でシェア」を付けました。押すと X の投稿画面が開き、配信者名・番組名・その配信へのリンク・#ニコ生 が下書きに入ります(投稿するかどうかはご自身で決めます)。',
    'シェアされたリンク(?lv=付き)を開くと、その配信が一覧の先頭に出ます。終了している場合はその旨を添えて、いま支えている人の一覧をそのまま表示します。',
    'X などに貼ったときのカード画像と説明文を、ランキング専用のものにしました。当サイトはシェアを押した事実を含め何も記録しません(プライバシーポリシー §14-2 に明記)。'
  ])
}),
```
★`changelog.js` は現在ちょうど 20 版(`grep -c "version: '" src/lib/changelog.js`=20)で**CRLF**(`git ls-files --eol` 実測・他の対象ファイルは全部 LF)。エントリは CRLF を保って挿入し(`git diff --stat` が +10 行程度=全行差分でない)、追加後 `node scripts/split-changelog.mjs` を **1 回だけ**実行。検算 2 本: changelog が 20 に戻る/`src/lib/changelog-archive.js` の版数が実行前より **1 増**(実行前に控える)。

### 5.10 tree-map の `FEATURES`(`scripts/repo-tree-map.mjs:103〜`)に1行
`{ feature: 'ランキング(/live/)の X シェア', desc: '各配信の stats 行に <a class="share-x">(X Web Intent・JS ゼロ)。?lv= で該当配信を先頭固定(pinLiveFirst)。本文は liveShareText(中立・数値なし・60字以内)、URL は buildXIntentUrl(safeHttpUrl 検疫)。OG 画像は tools/gen-og-live-ranking.py。計器なし(privacy §14-2)(v0.1.1510)', paths: ['src/lib/xIntentUrl.js', 'src/lib/liveRankingView.js', 'src/extension/live-ranking-entry.js', 'tsuioku-no-kirameki/live/index.html', 'tools/gen-og-live-ranking.py'], tags: ['LP', '公開', 'ランキング'] }`

### 5.11 `/live/` から掲載停止窓口への導線(v2・支援者=シェアされる側のため)
`.note`(352-357)の最後の `<p>` の直後に 1 行:
`<p>掲載されているご本人で、表示の停止をご希望の方は <a href="../privacy.html#s14">プライバシーポリシー 14-4</a> をご覧ください。</p>`
(`#s14` は `privacy.html` に実在する id。共有フッタの privacy リンクはアンカー無しで §14-4 まで自力で辿る必要があったため)

## 6. 状態遷移(閲覧者から見た `/live/`)
| 入口 | lv の妥当性 | 一覧に該当 | 表示 |
|---|---|---|---|
| `/live/` | なし(`PINNED_LV=''`) | — | 既存どおり(賑わい順) |
| `/live/?lv=lvNNNNNN` | `LIVE_ID_RE` 合格 | あり | 該当を先頭固定・他は賑わい順・elMeta は既存文言 |
| 同上 | 合格 | なし(終了・TTL 切れ・未収集) | 賑わい順のまま・elMeta 末尾に「その配信はもう放送が終わったみたい…」・顔=たぬ姉 half |
| 同上 | 合格 | **一覧そのものが空** | 既存の「いま表示できる配信がありません。」のみ。**pin 不在文言は出さない**(二重に不在を言わない・早期 return 165-169 を変えない) |
| `/live/?lv=xxx` | 不合格 | — | `PINNED_LV=''` として `/live/` と同じ(エラーを出さない) |
| 60 秒ごとの再描画 | 起動時の値を保持 | 再判定 | 再描画のたびに `pinLiveFirst` を通す(状態を持たない。途中で終了すれば次の描画で文言が出る。`.share-x` の href は各カードの liveId から毎回組む) |
シェア側: 「X でシェア」押下 → 新タブで `x.com/intent/post?text=…&url=…&hashtags=…` → X 側で編集・投稿・取消は本人。当サイトの状態は変わらない(計器なし)。

## 7. rollback
- 変更は **1 コミット**にまとめる(§4 の 1〜11 全部)。戻すのは `git revert <sha>` 1 回。dist・生成物(tree-map/feature-map/site-health/changelog-archive)も同じコミット内なので revert で整合する。生成スクリプト `tools/gen-og-live-ranking.py` も追跡下なので revert で消える(=PNG と生成手段が常に対になる)。
- ★og:image は revert すると `og-image.png` に戻るが、**X 側に一度取り込まれたカードキャッシュは当方から消せない**(お題 B: validator 廃止・パージ手段なし)。期間は未確認。絵柄を差し替え直すときは「画像 URL(ファイル名)を変える」以外に手が無い。

## 8. 検証手順(v2・順序どおり)
1. **OG 画像を焼いた直後(git add の前)**: `python tools/gen-og-live-ranking.py` の標準出力が `(1200, 630)` と 5,242,880 未満のバイト数であること。目視: `build/store-listing/og-live-ranking_guide.png` でセーフ枠内に全要素・数字ゼロ・ロゴが潰れていない。
2. 単体: `npm run test:cc`(§9 の全ケース緑・既存 `liveRankingView.test.js` の 12 ケースが不変)。
3. ゲート順序(`scripts/run-verify-cc.mjs:61-86` の順で赤にならないため):
   `git add src/lib/xIntentUrl.js src/lib/xIntentUrl.test.js tools/gen-og-live-ranking.py tsuioku-no-kirameki/images/og-live-ranking.png docs/handoff/live-ranking-share-DESIGN.md council/live-ranking-share-*.md council/live-ranking-share-*.txt council/live-ranking-share-*.json council/live-ranking-share-*.log`(新規は明示列挙・AGENTS §12.5)→ `npm run tree-map && npm run feature-map && npm run site-health` → bump 3 点+LP 4 パターン(§4-9)+`split-changelog` 検算 2 本(§5.9)→ `npm run verify:cc`(失敗時は `.artifacts/verify-cc.log` を Read)→ `git add -A` → commit(`feat(live): 各配信にXシェアと?lv=先頭固定・ランキング専用OGへ`)→ push。
4. ローカル実機(`.claude/launch.json` の `live-preview`・port 3781。★サーバ本体はセッションのスクラッチパッド `…/scratchpad/live-preview-server.mjs` にあり**リポには置かない**。無ければ同等品を置き直す: ①`/live/` → `tsuioku-no-kirameki/live/index.html` ②`/extension/*` `/app/*` は直配信 ③`/api/live-ranking` は `api/live-ranking.js` の `collect()` を 1 回 ④クエリは `split('?')[0]` で捨てる=ブラウザの `location.search` にだけ残る): `http://localhost:3781/live/?lv=<一覧にある lv>` で該当が先頭・`?lv=lv999999999` で不在文言・`?lv=abc` で通常表示。Claude-in-Chrome の `read_page` で `<a class="share-x">` の `href` が `https://x.com/intent/post?text=…&url=https%3A%2F%2Ftsuioku-no-kirameki.com%2Flive%2F%3Flv%3D…&hashtags=%E3%83%8B%E3%82%B3%E7%94%9F` であること(★プレビューから押しても本番 URL)。リンクを開いて composer に本文・URL・#ニコ生 が入ることを目視。**投稿はしない**(閉じる)。
5. 本番(push 後・反映後):
   - `curl -sS 'https://tsuioku-no-kirameki.com/live/?lv=lv999999999' -o /dev/null -w '%{http_code}\n'` → `200`(クエリ付きでも rewrite が 404 にしない)。★`grep og:url` は透過の証拠にならない(静的 HTML に埋まっているので何を返しても出る)。
   - `diff <(curl -sS 'https://tsuioku-no-kirameki.com/live/') <(curl -sS 'https://tsuioku-no-kirameki.com/live/?lv=lv999999999')` が空(HTML は同一・クエリは JS 側でしか効かない)。
   - **クエリが `location.search` に届く唯一の証拠は実機**: Claude-in-Chrome で `https://tsuioku-no-kirameki.com/live/?lv=<一覧にある lv>` を開き、先頭固定を `read_page` で確認。
   - `curl -sSI https://tsuioku-no-kirameki.com/images/og-live-ranking.png | grep -i 'content-type\|content-length'` → `image/png`・5MB 未満。
   - `curl -sS https://tsuioku-no-kirameki.com/privacy.html | grep -c 'でシェア'` → 1 以上(審査・利用者が見るのはライブ URL)。

## 9. テスト一覧(v2)
`src/lib/xIntentUrl.test.js`(`describe('buildXIntentUrl')`):
| ケース名 | 入力 → 期待 |
|---|---|
| text/url/hashtags を intent URL に載せる(characterization) | `{text:'Aの配信「B」を、いま支えている人', url:'https://tsuioku-no-kirameki.com/live/?lv=lv1234567', hashtags:['ニコ生']}` → `toBe(\`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=https%3A%2F%2Ftsuioku-no-kirameki.com%2Flive%2F%3Flv%3Dlv1234567&hashtags=%E3%83%8B%E3%82%B3%E7%94%9F\`)`(全体一致) |
| 空白は %20(+ にしない) | `text:'a b'` → `text=a%20b` を含み `+` を含まない |
| hashtags の # を剥がし空を落とす | `['#ニコ生',' ','']` → `hashtags=%E3%83%8B%E3%82%B3%E7%94%9F`。`'#a,#b'` → `hashtags=a%2Cb` |
| hashtags が空なら省略 | `[]`/`''`/`undefined` → `hashtags=` を含まない |
| via の @ を剥がし空なら省略 | `via:'@x'` → `via=x`; `via:''` → 含まない |
| `javascript:` の url は url だけ落とす | `{text:'t', url:'javascript:alert(1)'}` → `url=` を含まず `text=t` を含む。`data:`/相対/空も同じ |
| text も url も空なら '' | `{}`・`undefined`・`{hashtags:['a']}` → `''`(投げない) |
| ネガコン: text が違えば URL が違う | `{text:'a',url:U}` vs `{text:'b',url:U}` → not.toBe |
| ネガコン: url が違えば URL が違う | `?lv=lv1234567` vs `?lv=lv1234568` → not.toBe |

`src/lib/liveRankingView.test.js` に追加(`a={liveId:'lv100001'}, b={liveId:'lv100002'}, c={liveId:'lv100003'}`・★全部 6 桁以上):
| ケース名 | 期待 |
|---|---|
| pinLiveFirst: 該当を先頭へ・他の順序は保つ | `pinLiveFirst([a,b,c],'lv100003')` → `toEqual({lives:[c,a,b], found:true})` |
| pinLiveFirst: 既に先頭ならそのまま | `[a,b]`+`'lv100001'` → `[a,b]`, found true |
| pinLiveFirst: 大文字・前後空白を許す | `' LV100003 '` → `[c,a,b]`, true |
| pinLiveFirst: 不在なら found=false・並び不変 | `'lv999999999'` → `[a,b,c]`, false |
| pinLiveFirst: 不正 lv は恒等 | `''`/`null`/`'lv1'`(5桁以下)/`'javascript:'` → 並び不変・false |
| pinLiveFirst: 元配列を壊さない | 入力の `JSON.stringify` が前後で同一・戻り値 `lives !== 入力` |
| pinLiveFirst: 非配列は空 | `null` → `{lives:[], found:false}` |
| pinLiveFirst: 状態を持たない(2 回目に対象が消えれば false) | `pinLiveFirst([a,b,c],'lv100003')` → true の直後に `pinLiveFirst([a,b],'lv100003')` → `{lives:[a,b], found:false}` |
| liveShareText: 通常 | `{streamer:{name:'りんく'}, title:'雑談'}` → `りんくの配信「雑談」を、いま支えている人` |
| liveShareText: name 空 | → `この配信「雑談」を、いま支えている人` |
| liveShareText: title 空 | → `りんくの配信を、いま支えている人` |
| liveShareText: 両方空・null | `{}`/`null` → `この配信を、いま支えている人` |
| liveShareText: name 18 字超は 17 字+… | 30 字の name → 先頭 17 字+`…` |
| liveShareText: title 24 字超は 23 字+… | 40 字の title → 先頭 23 字+`…` |
| liveShareText: 4 分岐の最大長を固定 | name 80 字+title 200 字 → `Array.from(t).length` が `toBe(57)`; name 空 → `toBe(40)`; title 空 → `toBe(31)`; 両空 → `toBe(14)`。加えて `expect(SHARE_NAME_MAX + 15 + SHARE_TITLE_MAX).toBeLessThanOrEqual(SHARE_TEXT_MAX)` |
| liveShareText: 絵文字は割れない | title に `🎉` を含む 30 字 → 出力に `\uFFFD` や孤立サロゲートを含まない |
| liveShareText: 空白・改行の正規化 | `'a\n\n b'` → `a b` |
| ネガコン: 数値・時間を含まない | `watchCount:12345, beginTime:…, giftTotal:999` を持つ live でも本文がテンプレと完全一致 |

## 10. 3視点の自己批判への予備回答(v1)と v2 での裁定は §12

## 11. 未確認事項(実装・実機で確定させる。断定しない)
- X の Web Intent が `hashtags` の日本語(percent-encoded)を `#ニコ生` として composer に入れるか(実機 8-4 で目視)。
- X が `+` を空白と解釈するか(未確認のため `%20` を選んだ)。`%2C` 区切りの複数タグの解釈(第1版は 1 タグ)。
- X の summary_large_image で og:title が何字で切れるか・og:description が表示されるか・カードキャッシュの期間(7 日は非公式)。
- `?lv=` が本番で `location.search` に届くこと(実機で確認するまで未確認)。
- 生成した PNG の実バイト数(5MB 以下の見込みだが焼くまで不明)。
- 公式 X アカウント名(確認できたら第2段で `via` を足す)。
- U+1D54F `𝕏` の各 OS 既定フォントでの表示(第1版は使わないので保留)。

## 12. 3視点批判の裁定(司令塔・2026-09-14・18 件)
| 視点 | # | 裁定 | 反映先 |
|---|---|---|---|
| 実装者 | 1 registry 注記の宛先が曖昧 | 採用 | §4-1/§4-3 |
| 実装者 | 2 `.share-x` CSS のカスケード位置と wrap 時の離散 | 採用(`.stats-actions` で一塊に・その場で差し替え) | §5.7・§5.4 |
| 実装者 | 3 verify-bump は行番号でなく正規表現 4 本 | 採用 | §4-9 |
| 実装者 | 4 split-changelog の検算は archive 側も | 採用 | §5.9 |
| 実装者 | 5 gitignore 下の生成スクリプトでは PNG を再生成できない | 採用(`tools/gen-og-live-ranking.py`・追跡) | §4-7・§5.6・§7 |
| 実装者 | 6 changelog.js だけ CRLF | 採用 | §5.9 |
| テスター | 1 `lv3` は `LIVE_ID_RE` 不合格=恒真テスト | 採用(重大・6 桁以上に) | §5.2・§9 |
| テスター | 2 live-preview はスクラッチパッド | 採用(要件を明記) | §8-4 |
| テスター | 3 `grep og:url` は透過の証拠にならない・`lv1` 不合格 | 採用(200 + diff + 実機) | §8-5 |
| テスター | 4 一覧が空の行が無い・状態を持たないテストが無い | 採用 | §6・§9 |
| テスター | 5 上限テストは `toBe` で 4 分岐固定+定数不変条件 | 採用(値は v2 テンプレで再計算: 57/40/31/14) | §9 |
| テスター | 6 PNG のサイズ・寸法を機械で | 採用 | §8-1 |
| 利用者 | 1 「さん」テンプレは本人が押すと自称になる | 採用(ただし提案の丸括弧形は「支えている人(名前)」と読めて誤解を生むため不採用。「さん」を外した見出し体 `{name}の配信「{title}」を、いま支えている人` に) | §5.3 |
| 利用者 | 2 og:title は意味を前・固有名を後ろ | 採用 | §5.5 |
| 利用者 | 3 OG 画像に「⚡ リアルタイム」ピル(数字なし) | 採用 | §5.6 |
| 利用者 | 4 `/live/` に掲載停止窓口への導線が無い | 採用 | §5.11 |
| 利用者 | 5 不在文言・title 属性をたぬ姉の声に | 採用 | §5.4 |
| 利用者 | 6 `𝕏` は豆腐化しうる | 採用(素の `X`) | §5.4・§5.8・§5.9 |
