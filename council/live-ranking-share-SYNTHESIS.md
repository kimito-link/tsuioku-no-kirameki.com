# 統合(司令塔・実コード裏取り済み): 追憶のきらめき ランキングが X でシェアされる仕組み

> COUNCIL live-ranking-share(2026-09-14)。会議=design分類・召集4体・成功3/4(統括 nvidia/nemotron-3-ultra は HTTP 503 で無回答)。
> 元ログ=council/live-ranking-share-meeting.log / 生回答=council/live-ranking-share-answers.json / お題=council/live-ranking-share-question.txt
> 会議は素材。司令塔が実コード(live-ranking-entry.js / liveRankingView.js / api/live-ranking.js / vercel.json / privacy.html §14)で裏取りして1案に収束。
> 計画=`~/.claude/plans/elegant-crunching-quokka.md`(承認済み)。ユーザー決定(2026-09-14):「自動投稿はしない。OGP の見せ方とかそういう風に」。

## 0. 会議の信頼度(先に書く・統合表を鵜呑みにしない理由)

- **統括役が落ちた**。`[統合]` は批判役 groq/gpt-oss-120b が代行し、A〜M 全13項目で自分の案を採用した(頭脳1種類問題・commit 9525b87b が防ごうとした状態)。統合表は「批判役の意見」として読む。
- **批判役の数字は出典未確認=不採用**。「ニコニコ生放送利用者調査(2025-12-01・ニコニコインフォ 312045)で支援者の 71% が匿名で支援したい」は、お題の観測にも世界調査にも無い。お題の制約「数字を出典なしに書かない」に反するので**根拠から外す**。方向性(ギフター型を第一にしない)だけは世界調査の「ギフター側シェア実例ゼロ」で独立に支持されるため結論は残す。
- **批判役の E は誤読**。「静的 URL にクエリを付けない(キャッシュ問題回避)」は、`?lv=` の目的を取り違えている。`?lv=` は OG を配信ごとに変えるためではなく、**シェアされた配信を一覧の先頭に固定する**ため。OG カードは共通(静的)のままなので、クエリの有無でキャッシュ問題は発生しない。
- **発散役(qwen3.8-27b)の「1人の応援者単位＋動的 OG に名前と顔」**は、実例ゼロの領域に第1版から踏み込む案。「実例が無いのはツールが無いから」は検証不能の推測。**第2段以降の候補として保留**(反応を見てから)。
- **ローカル(qwen3.5:9b)の `?ref=unique_id`** は閲覧者の識別=privacy §7/§14-2 に反するので却下。「最終スナップショット保存」は §14-3(最新1件・1時間で消える)の改定が要るので第1版では却下。

## 1. 結論(1案・第1版の形)

| 問い | 決定 | 根拠(裏取り) |
|---|---|---|
| A 誰のシェア | **配信者のサンクス型を第一**。ただしボタンは誰が押しても成立する**中立文言** | 世界調査 A-1/A-2(順位言及・三段感謝の文化)。ギフター側実例ゼロ。ボタンは配信者・視聴者・ギフターの誰が押すか分からない=一人称は使えない |
| B 単位 | **配信 1 本**(`?lv=` 付き URL) | 会議2/3。保存形が配信単位(api/live-ranking.js の lives[])。ページ全体のシェアは既存の X 固定ポスト・記事で足りている |
| C OG の見せ方 | **第1版は静的共通 OG をランキング専用に 1 回焼く**(新ファイル名)。配信ごとの動的 OG は第2段 | 会議2/3。キャッシュがパージ不可(観測 B)=文言・絵を確定してから一発。★主題が「OGP の見せ方」なので、**静的でも絵柄と og:title/og:description は第1版で確定する** |
| D 支援者名 | **第1版は画像にもテキストにも載せない**。名前はリンク先(ページ)で見せる | 上位は時間で入れ替わる・X の投稿は編集不可(ouen-post 実測)・押した人が第三者の名前を自分の投稿に入れる形になる。ページ側は AGENTS §3.5 どおり主役のまま。第2段で「上位3名を text に」を反応を見て検討 |
| E URL 設計 | `https://tsuioku-no-kirameki.com/live/?lv=lvNNN`。**vercel.json の変更なし** | rewrite `/:path((?!…).*)` にクエリ条件なし=透過(push 後 curl で実測する)。`api/` で HTML を返す形は第2段 |
| F 第1版の範囲 | 下記 §2 | 小さく出す(制約) |
| G 終了配信 | **TTL 1h 維持・スナップショット無し**。lv 不在なら「この配信は終了したか、いま表示できません。いま支えている人の一覧を表示しています」を elMeta に出し、一覧はそのまま見せる | privacy §14-3 不変(改定なし)。摩擦ゼロ(「見つかりません」で止めない・§12.3) |
| H 文言 | **中立・固定テンプレ・数値なし**。配信者名＋番組名(切り詰め)。X の composer で編集可なので配信者は「ありがとう」を自分で足せる | 数値は投稿した瞬間に古くなる。CJK 2 重み+URL 23 → 本文は全角 60 字以内で構造的に収める(カウンタ不要)。title は api 側で無制限(name は 80 字)→ lib で切る |
| I hashtags / via | `hashtags=ニコ生` のみ。`via` なし | 慣習ゼロ・#ニコ生 の実績のみ。公式アカウント名が未確認のため via は付けない(確認できたら足す) |
| J 計器 | **持たない** | privacy §7。反応は X 検索で人が見る |
| K シェア URL の origin | **本番 canonical に定数固定**(`https://tsuioku-no-kirameki.com/live/`) | プレビュー(port 3781)・`app.` ホストから押しても本番 URL になる |
| L 静的 OG の焼き時 | **第1版で 1 回**(文言確定と同時・og:image は新ファイル名) | 画像 URL 自体が変わるので画像側のキャッシュは無関係。ページ URL のカードは X 側の期限で入れ替わる(期間は未確認) |
| M コピーボタン | **無し**。`<a>` の intent リンクだけ(JS ゼロ) | render() は 60 秒ごとに innerHTML 全再構築=listener が消える。`<a>` なら問題ゼロ |

## 2. 第1版の変更ファイル(計画の第1段+会議で足した OG 差し替え)

1. `src/lib/xIntentUrl.js`(新規・純関数)+ `xIntentUrl.test.js`: `buildXIntentUrl({ text, url, hashtags?, via? })`。`URLSearchParams`・空値は載せない・`#` は剥がす・`url` は `htmlText.js` の `safeHttpUrl` で検疫。★`capturedAt`/`persistedAt`/`measuredAt` の語を**コメントにも**書かない(`timeAuthorityRegistry.test.js:11` は文字列検査)。
2. `src/lib/liveRankingView.js` に `pinLiveFirst(lives, lv)` と `liveShareText(live)` を追加(+テスト)。`LIVE_ID_RE`(27) を再利用。`timeAuthority.js` import 済みで registry 免除。
3. `src/extension/live-ranking-entry.js`: 起動時に `location.search` の `lv` を 1 回だけ読む(★`check:layer` が `src/lib` の `window.*` を禁止 → パースは entry・判定は lib。`live-view-entry.js:46-56` の型)。`render()`(163〜) で `sortByEstimatedConcurrent` の後に `pinLiveFirst`。stats 行(187 の 🧩 リンク隣)に `<a class="share-x" href="<intent>" target="_blank" rel="noopener noreferrer">𝕏 でシェア</a>`。lv 指定かつ不在なら elMeta に一言。
4. `tsuioku-no-kirameki/live/index.html`: `.share-x` CSS(`.ext-link`(127) と同じ形)+ og:image を新ファイル `images/og-live-ranking.png` へ + og:description の文言確定。
5. `tsuioku-no-kirameki/images/og-live-ranking.png`(新規・1200×630・5MB 以下・数字なし): `build/store-listing/_gen_x_header_live_ranking.py` の配色・ロゴ規約・キャラを流用して**Windows ローカルで 1 回焼く**(CI 不要=`C:\Windows\Fonts` 依存のままでよい)。生成スクリプトは `build/store-listing/_gen_og_live_ranking.py`(再生成可能に保つ・§4)。
6. `tsuioku-no-kirameki/privacy.html` §14-2 に 1 文(同一コミット): 「𝕏 でシェア」は X の投稿画面を開くリンクであり、当サイトは押した事実を含め何も記録しない。
7. bump 3点+LP `data-version`(manifest / package / changelog 先頭 summary ≤35字)。

## 3. 反論・リスク(残すもの)

- **静的 OG では「どの配信か」がカードに出ない**。text(配信者名・番組名)がその役を担う。反応が薄ければ第2段(配信ごと OG=Actions+Pillow、URL は `api/` HTML か `/live/lv<id>/` 静的焼き、privacy §14 追記とセット)。
- **`?lv=` 付き URL は数時間で対象が消える**(G)。「終了しました」表示で受け止める。永続化は §14-3 の改定が前提=第1版ではやらない。
- **X のカードキャッシュの期間は未確認**(7 日は非公式)。/live/ は既に固定ポストで共有済みなので、差し替え後しばらく旧カードが出ることがある。
- **支援者名を text に入れない判断**は §3.5「応援者は主役」を後退させて見える。ページ(リンク先)では主役のまま、投稿文だけ第三者名を自動挿入しない、という線引き。第2段で見直す。

## 4. やってはいけない(会議+司令塔一致・却下済みの再掲)

X API 自動投稿 / ブラウザ自動操作 / Playwright on Vercel / 動画カード / 同一 URL で OG 画像だけ差し替え(配信ごと) / `optedIn` 緩和 / `statusShareUrls.js` 相乗り / `?ref=` 等の閲覧者識別 / スナップショット保存(§14-3 改定なしに) / 出典なしの数字 / 重み付き文字数カウンタ(テンプレを短くして構造で収める)。
