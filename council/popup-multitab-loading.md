# お題: popup を開くと「ローディングが長い」(特に2つ目のタブ)を直す — 昔は0だった退化

## ユーザーの言葉
「popup(記録/同接/来場カードの画面)を開くとローディングが長い。2つ目のタブだとずっとローディング、
1つ目も長いかも。**前はローディング0で一気に取れてたことが何回もあった。**」
= 昔できていたのに退化した(リグレッション)。複数タブで悪化。

## 司令塔が実コードで特定した真因(確定・推測でない)

### 「ローディング0」を実現していた仕組み(v0.1.650)
- popup 再オープン時に「開いた瞬間に全コメント表示・ローディングなし」を出すため、
  chrome.storage.session に【直近1 live の全件配列】をキャッシュしている。
- キー: `SESSION_COMMENT_CACHE_KEY = 'nls_session_comment_cache_v1'`(src/lib/sessionCommentCache.js:17)。
- **このキーは固定名・1本だけ**。ファイル自身のコメントに明記:「直近1 live の全件配列を1本だけ
  persist する」「1 live 上書き・貯めない」。
- popup refresh は `isSessionCommentCacheFresh(cache, lv, total)` で `cache.lv === lv` を確認し、
  一致すれば IDB 全件読み(重い・数千件)を【飛ばして即返す】= これが「ローディング0」の正体
  (popup-entry.js:13628-13638)。

### 退化の核心(複数タブで cache が共倒れ)
- 2つの watch タブ(別 live lv1/lv2)を開くと、両タブの popup/refresh が【同じ1本のキー】を
  奪い合って上書きする:
  - lv1 タブが書く → キーは lv1 の配列。
  - lv2 タブが書く → キーは lv2 の配列(lv1 を上書き)。
  - lv1 タブが再 refresh → `cache.lv !== 'lv1'`(中身は lv2)→ **fresh でない → 毎回 IDB 全件
    重い読みに落ちる**。
- 2タブが互いに上書きし続ける → **どちらのタブも session cache が永遠に当たらない** →
  両方とも毎回 heavy read → 「2つ目はずっとローディング・1つ目も長い」。
- 1タブだけのときは固定キーでも常に自分の lv なので必ず当たる = 「前はローディング0で一気に
  取れてた」(=単一タブ時の体験)。複数タブで初めて壊れる。

### 確認済みの事実(コード)
- session cache は版印 = cdbSummary.total(currentChunkTotal)で stale-while-revalidate。
  total が増えたら作り直し(後退なし)。仕組み自体は正しいが【キーが live をまたいで共有】が穴。
- heavy read 自体(readAllCommentsFromCommentDb)は IDB で、数千件だと cold で数秒かかる
  =これを session cache で飛ばす設計だったのに、複数タブで飛ばせない。
- 件数カードの「数字が出る」即時描画は軽量サマリ(cdbSummary.total)由来で別経路だが、
  ユーザー体感の「ローディング」は heavy read 待ちの2段階paint(summary→全件)の【全件待ち】を
  指している可能性が高い(吹き出し/応援帯/ストーリーは全件が要る)。

## このプロジェクトの制約(必ず守る)
- Windows + PowerShell。`npm run verify:cc`。「1変更=patch 1つ」。changelog 35字以内・
  manifest/package 同期。
- 純ロジックは src/lib に切り出して単体テスト(sessionCommentCache.test.js が既存)。
- chrome.storage.session の quota は ~10MB。巨大配信(数万件)で複数 live ぶん貯めると溢れる
  (現在 1 live cap=SESSION_COMMENT_CACHE_MAX_ROWS=30000)。
- 多タブで共有 storage を圧迫しない(記録停止 stall の再発を避ける=既出の最重要制約)。
- 後退ゼロ: SW 終了で session が消えても IDB 経路に自動フォールバック(現状の安全性を保つ)。

## 会議への質問(役割分担 + 結論→根拠→反論→具体案 の4ブロックで答えよ)
役割: 総合役=設計整合と退行防止 / 発散役=別の切り口 / 批判役=各案の穴を最低1つ /
実装役=具体的なファイル・関数・キー式・テスト名・数値まで。

### Q1: session cache を per-live にどう作り替えるか
- 案A: キーを `nls_session_comment_cache_<lv>` に per-live 化(単純・各タブが自分のを持つ)。
  → 複数 live ぶん session に残る。quota(10MB)対策(LRU で古い live を消す/件数cap)をどうするか。
- 案B: 1本のキーに「lv→payload の小さな map(直近N live)」を持つ(LRU で N 件)。
  → 1本なので onChanged 競合は減るが、書くたび map 全体を read-modify-write =多タブで
    storage 競合(stall)を誘発しないか。
- 案C: その他(per-live + 全体 quota 管理を別メタキーで、等)。
- どれが「多タブで stall を増やさず」「quota を溢れさせず」「後退ゼロ」か。

### Q2: そもそも heavy read を session cache で飛ばす以外の即時化はあるか
- 件数/同接/来場の数字は軽量サマリで即出ているはず。ユーザーの「ローディング」は何の待ちか
  (全件配列が要る吹き出し/応援帯/ストーリーの2段目描画か、それとも数字自体も遅いか)。
- 全件が要る描画を「まずサマリの直近N件で描いて、全件は後追いで差し替え」にできないか
  (既に commentReadState='summary' 経路があるが、複数タブでそれも効いていない?)。

### Q3: 複数タブで heavy IDB read が同時多発する負荷
- 2タブが同時に readAllCommentsFromCommentDb(数千件)を走らせると IDB/メインスレッドが重い。
  per-live session cache が当たれば各タブ1回で済むが、当たるまでの初回は重い。
- 初回 heavy read 後に per-live cache へ確実に書けば「2回目以降は0」になる。1回目をどう軽くするか
  (cap を下げる/直近だけ先に描く/IDB cursor を途中で打ち切って先頭N件で描く等)。

### Q4(批判役の核心): 最小修正で「2つ目もローディング0」になるか・per-live 化の穴
- 案A(per-live キー)で本当に「2つ目もローディング0」が復活するか、それとも別経路
  (lightData の profile cache 同梱・heavy read の cold コスト)がまだ残るか。
- per-live にすると session quota を複数 live で食う。長尺×多タブで quota 溢れ→ session 全体が
  書けなくなり【全タブ退化】しないか。cap/LRU の具体値は。

## 期待する最終成果(司令塔が1案に統合)
最小で「2つ目のタブでもローディング0(=昔の体験)」が復活する修正(MVP)と、quota/多タブ stall を
増やさない構造化を分けて。退行ゼロ(単一タブの現挙動・SW 終了時の IDB フォールバック)を最優先。
具体ファイル(sessionCommentCache.js / popup-entry.js)・キー式・LRU/cap 数値・テスト名まで。
