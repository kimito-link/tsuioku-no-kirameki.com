# perf-ab — 「重い」を前後比較で測る道具

拡張を読み込んだ Chromium を**一時プロファイル**で起動し、放送中の配信を開いて、拡張プロセスの CPU を測る。
推測で直さず、**同じ配信・同じ手順で、修正前と修正後を続けて**測るための土台(2026-10-11 に導入)。

## 実績(なぜ作ったか)
2026-10-11、実機で拡張プロセスが CPU 100% 超に張り付いた件。ここでの測定で次が分かった。
- 視聴ページ内パネルを切ると 2〜3%、出すと 113%・メモリ 885MB→1.9GB(`cpu-timeline.mjs --autoshow 0` との比較)。保存データが空でも起きる。
- パネルの CPU プロファイル(`profile-popup.mjs`)で `bestNicknameFromEntries`(人数×コメント数の総当たり)が自分の時間の 40%。
- 修正前(master) vs 修正後を続けて測ると、メインスレッドの稼働率 99.7% → 19%(v0.1.1593)。

## 使い方
放送中の `lv` を用意する(`https://live.nicovideo.jp/ranking`)。Windows 前提(PowerShell で CPU/メモリを採取)。

```bash
# 1) CPU プロファイル(パネルのメインスレッド)
node scripts/perf-ab/profile-popup.mjs --lv lv351523930 --settle 25 --seconds 10

# 2) 修正前 vs 修正後(同じ配信で続けて)
node scripts/perf-ab/make-before.mjs --ref master --dst C:/nls-ab/ext_before   # 修正前の拡張を作る
node scripts/perf-ab/profile-popup.mjs --lv lv351523930 --ext C:/nls-ab/ext_before   # 修正前
node scripts/perf-ab/profile-popup.mjs --lv lv351523930                              # 修正後(extension/)

# 3) ページを開くたびの CPU/メモリの積み上がり
node scripts/perf-ab/cpu-timeline.mjs --lv lv351523930 --side --status
node scripts/perf-ab/cpu-timeline.mjs --lv lv351523930 --autoshow 0   # パネルを出さない場合(切り分け)
```

比較する前に `npm run build` で `extension/dist` を最新にしておく(修正後=現在のビルド)。

## 読み方・注意
- **BUSY%** が 100% 近い=メインスレッドが飽和。上位の関数がそのまま犯人候補。
- ヘッドレスなので **GPU 合成は含まない**。プロセス全体の CPU が 100% 超でも、メインスレッドの稼働率が低ければ別のスレッド(合成など)。実機の最終確認は「更新→3分→プロセス別 CPU」で行う。
- 放送の混み具合で数字は揺れる。**前後は必ず続けて**測る。
- 端末の本物の Chrome・プロファイル・保存データには触れない(一時プロファイルのみ・終了時に自分の Chromium だけ終了)。
- 残った `nls-perf-*` の Chromium が見えたら、そのプロファイル名を含むプロセスだけを終了する。
