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

# 3) メモリが何で増えているか(JS ヒープ / DOM / リスナー / OS メモリの時系列)
node scripts/perf-ab/growth.mjs --lv lv351523930 --minutes 3

# 4) ページを開くたびの CPU/メモリの積み上がり
node scripts/perf-ab/cpu-timeline.mjs --lv lv351523930 --side --status
node scripts/perf-ab/cpu-timeline.mjs --lv lv351523930 --autoshow 0   # パネルを出さない場合(切り分け)
node scripts/perf-ab/cpu-timeline.mjs --lv lv351523930 "--extra=--blink-settings=imagesEnabled=false"   # 画像を止めた場合(切り分け)

# 5) 会場(venue.html)が POP の鏡の投影になっているか(時系列・2026-10-12 導入)
node scripts/perf-ab/parity.mjs --lv lv351531643 --collect 30 --at 4,8,12,16,20,25,30,40,50,70
```

列の読み方: `会場-鏡` が 0 でなければ会場が鏡を映していない / `鏡-POP` が 0 でなければ鏡が POP の画面と別物 / 鏡KB が 512KB 近辺なら容量の安全弁(件数半減)を疑う。
実績(2026-10-12): 鏡が POP の画面(1092人)より小さい(154人)瞬間を確認。POP は縮小ガードで画面を保つが、鏡にはガード前の小さい候補集合が出ていた(原因B)。

比較する前に `npm run build` で `extension/dist` を最新にしておく(修正後=現在のビルド)。

## ENTRY POINTS(誰が仕事を始めているか)
`profile-popup.mjs` の最後に、スタックの一番下(入口)ごとの時間が出る。無名の入口は dist の「行:列」から関数の冒頭を読んで表示する。
`(native only)` は JS を介さない処理(DOM/IPC/構造化複製など)。**関数単体の自分の時間が平らでも、入口で見ると偏りが分かる**。

## 実機で熱いスレッドを名指しする(読み取りのみ)
PowerShell で `GetThreadDescription`(kernel32)を P/Invoke すると、Chrome が付けたスレッド名(`CrRendererMain` / `Compositor` など)が読める。
`Get-Process` の `Threads` の CPU 差分と組み合わせて「どのスレッドが何%か」を出す(`HRESULT` は **符号なし**で扱うこと。符号付きだと成功を失敗と読み違える)。
2026-10-11 実機: 拡張プロセスの熱いスレッドは `CrRendererMain`(メインスレッド)88〜93%、メモリ 4.5GB。

## 試して効果がなかったこと(同じことを繰り返さない)
- 更新(`refresh`)を「処理時間に応じて間隔を空ける」スケジューラ(dutyFactor)に変える: 同じ配信での前後比較で稼働率が変わらなかった(`refresh` はもともと間引かれており、1回ごとが重いだけ)→ 取り消し。
- 画像の読み込みを止める: CPU もメモリも変わらない → 画像は原因ではない。

## 読み方・注意
- **BUSY%** が 100% 近い=メインスレッドが飽和。上位の関数がそのまま犯人候補。
- ヘッドレスなので **GPU 合成は含まない**。プロセス全体の CPU が 100% 超でも、メインスレッドの稼働率が低ければ別のスレッド(合成など)。実機の最終確認は「更新→3分→プロセス別 CPU」で行う。
- 放送の混み具合で数字は揺れる。**前後は必ず続けて**測る。
- 端末の本物の Chrome・プロファイル・保存データには触れない(一時プロファイルのみ・終了時に自分の Chromium だけ終了)。
- 残った `nls-perf-*` の Chromium が見えたら、そのプロファイル名を含むプロセスだけを終了する。

## 実機と同じ量の保存データで測る(NLS_SEED_EXT_DIR)
空のプロファイルでは再現しない重さ(保存データ 40MB 超で初めて出る)を測るときは、実機の Chrome プロファイルフォルダを指定する。
chrome.storage.local と IndexedDB を**読むだけ**で一時プロファイルへ複製する(実機のファイルは変更しない・LOCK は除く)。
```
NLS_SEED_EXT_DIR="C:/Users/<you>/AppData/Local/Google/Chrome/User Data/Profile 45" node scripts/perf-ab/profile-popup.mjs --lv <lv>
```
2026-10-12: これで初めて「診断が重い」が再現した(30 秒のうち 26 秒がメインスレッド作業・保存データの読み込み約 2,300 回)。
