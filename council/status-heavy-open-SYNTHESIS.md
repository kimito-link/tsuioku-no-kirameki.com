# SYNTHESIS: 診断ページ status.html が重い — 原因と対処

会議4体(批判 qwen3-32b / 統括 gemma / 発散 qwen3.5-122b / 爆速 llama)+ 司令塔の実コード裏取りで確定。

## 投票
- **案1(fastDiag を status 用に軽量ダイジェスト化)**: fast(llama)・diverge(qwen-122b)・implement(gemma) が支持。
  しばしば案3(初回ロード遅延)と併用を提案。
- **批判役(qwen-32b)の最重要指摘**: 案1は「巨大 JSON を読まない代わりに軽量 JSON を読む」だが、**新キーを足すと
  2秒ループの read 数が +1 になる**。この拡張は「storage read を増やすたびに重くなる」履歴がある(並行化で
  timeout 退行・diag を毎回 read に足して重化)=read +1 は地雷。かつ「計測(_stepMs)せずに直すと外す」リスク。

## 司令塔の裏取り(実コード)= 案1 を【REPLACE で】採用 + 計測で確認

批判役の「read +1」は **REPLACE にすれば回避できる**(司令塔の実コード確認):
- status の2秒ループは watch タブが開いていれば `enumerateActiveLives` 経路1(tabs.query)で lv を取れる
  =経路2の fastDiag read は **スキップ**される。よって fastDiag は **毎ティック1回だけ**(line 290 の明示 read)。
- → この1回を「フル fastDiag(~40KB)」から「軽量ダイジェスト(~1KB)」に **置き換える**(読む回数は同じ・サイズだけ
  ~40分の1)。read 数は増えない=批判役の地雷を踏まない。フル fastDiag は「AI共有ボタンを押した時だけ」読む。
- content 側は既に fastDiag を storage に書いている=その直前に最小フィールドだけのダイジェストを作って
  **同じ set で**書く(write は元々あるので新規 I/O 増は write 1個ぶんのみ・2秒ループの read には影響しない)。

★計測ファースト(批判役の正論を取り込む): status には既に `_stepMs` 計器があり「最終更新」の隣に
  「重かったステップ top2」を出す。**実装前に一度それを見て fastDiag read が律速だと確認**する。もし律速が
  `loadAllSummaries` や `enumerateActiveLives` なら案1は的外れ=そちらを先に直す。構造的には 40KB/2秒の
  read+parse が最有力だが、過去「実機で確認するまで直ったと言うな」を踏んでいるので計測で裏を取る。

→ **採用 = 案1(REPLACE 版)+ 計測確認。** 案3(初回遅延)は副次的に併用可だが、まず案1 で 2秒ループと初回の
  両方の fastDiag コストが消えるので、案1 単独で「開くのが重い」に効くはず。案2(間引き)は fastDiag を古い値で
  見せる=診断の鮮度が落ちるので不採用(ダイジェストなら毎回新鮮なまま軽い)。

## 実装方針(案1・REPLACE・最小ブラスト半径)
1. **計測**: 実機で status を開き「最終更新」隣の _stepMs top2 を確認(fastDiag が律速か)。律速が違えばそちらへ。
2. **content 側**: fastDiag を書く所(aiShareFastDiag を set する直前)で、status が使う最小フィールドだけの
   ダイジェストを純関数で抽出し、別キー(例 KEY_STATUS_FAST_DIAG_LITE)に同時 set。抽出は純関数+test。
   - status が fastDiag から実際に使うフィールドだけを入れる(lives / 各 live の集計値 / 健全度に要る値)。
     verbose(giftSubAppRelayDiag / ndgrUnknownSamples / interceptFetchLog / commentObservability の生ログ)は **入れない**。
3. **status 側**: 2秒ループの `loadFastDiagSafe()` を `loadStatusFastDiagLiteSafe()` に **置換**(読む回数同じ・~40分の1)。
   - フル fastDiag は AI共有ボタン押下時だけ読む(loadFastDiagSafe はその経路に残す)。
   - enumerateActiveLives 経路2(watch タブ 0 の稀パス)も lite で lv を取れるよう lite に lives を含める。
4. **健全度パネル等が使う値**: lite に必要十分なフィールドが入っているか実コードで突合(欠けると健全度が na に退化)。

## やらないこと(地雷回避)
- 新たな storage read を **増やさない**(批判役の指摘=read +1 は重化)。lite は full の置換であって追加でない。
- 並行 read 化しない(過去に LevelDB 競合で timeout 退行・撤回済)。直列のまま。
- 案2(fastDiag を間引きキャッシュ)は採らない=診断の鮮度が落ちる。ダイジェストで毎回新鮮かつ軽くする。
- 計測せずに「直った」と言わない(実機 _stepMs と体感で確認してから)。
- content の fastDiag そのものの構造は壊さない(AI共有が使う=full は維持)。lite は別キーで追加。

## 再発防止
- 「status が毎回 read するのは lite だけ」という構造にすると、今後 content の fastDiag が肥大しても status は
  重くならない(lite に足さない限り)。診断ページの軽さを構造で守る。
