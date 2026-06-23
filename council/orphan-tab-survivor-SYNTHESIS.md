# SYNTHESIS: Alt+Tab に出ない裏 watch タブ(孤児)の安全な処理

会議4体(qwen3-32b 批判 / gemma4 統括 / qwen3.5-122b 発散 / llama-3.3-70b 爆速)+ 司令塔の実コード裏取り
+ ユーザーの方針確定(AskUserQuestion 3往復)で確定。

## 真因(実コード・実機診断で確定)
- 生き残っているのは `chrome.tabs.create({ active: false })` で開かれた【裏タブ】。active:false なので
  Alt+Tab に出ないが content script は走り「記録中・視聴中」になる(実機診断 recording:true / NDGR 0.8秒前 / video 1)。
- 開いたのは過去の autopatrol または削除済みの古い重複拡張(v0.1.727)。
- autopatrol は現在 `AUTOPATROL_KILL_SWITCH = true` で完全停止=【新規の裏タブはもう生まれない】。
- 既存の起動時掃除 sweepOrphanAutopatrolTabsOnce は「URL マーカー `#nls_autopatrol=1`」か
  「visited 履歴に在る lv」でしか孤児を拾えない。SPA がマーカーを消し、古い拡張由来の lv は
  今の拡張の visited に無いため、現存の孤児は永久に取りこぼす。

## 会議の決定的な論点(批判役 qwen3-32b)
- 候補A(content の自己申告)は【今ある既存孤児には効かない】。それらは自己申告フラグを持たない
  (古い拡張が開いた/マーカー消失済み)。自己申告は将来開くタブにしか効かないが、autopatrol は停止済み
  =将来は開かない=候補A は「もう起きない問題」にしか効かず目の前を解決しない。
- nvidia案(活動度スコアで自動クローズ)は「裏でニコ生を流しながら別作業」する手動タブを誤爆するリスクを
  自分で認めている。手動視聴タブの誤爆は絶対不可の制約。

## 司令塔の裏取り(実コード)
- `isAutopatrolTab()`(content-entry.js:8182)は URL ハッシュを毎回読むだけで、autopatrol 由来かを
  【永続化していない】。マーカーが消えた既存裏タブを autopatrol 由来と判別する手段はコード上どこにも無い。
- → 「今ある孤児」を手動の裏視聴タブと観測上区別して【自動で】閉じる確実な方法は存在しない。

## 確定した方針(ユーザー承認済み)
**status が「Alt+Tab に出ない裏タブ(active:false)」を検出して正直に表示し、ユーザーがボタンを
押したときだけ閉じる。自動では閉じない(誤爆ゼロ)。**

- ユーザー選択(AskUserQuestion):
  1. 方針 = 「長時間放置なら自動で閉じる」… を、誤爆防止の議論を経て
  2. 保護 = 「閉じる前に一言知らせる」
  3. 動き = 「知らせて・ユーザーが押したら閉じる」(= 完全自動ではなく半自動の手動確定)
- これは会議の最も安全な収束(候補B + nvidia 半自動の良いとこ取り)。autopatrol は停止のままで、新規タブを
  開く機構は一切作らない。status は読むだけ + ユーザー操作で chrome.tabs.remove するだけ = 最小実装・誤爆ゼロ。

## 実装接点(PR1・最小)
status は既に enumerateActiveLives で経路1(chrome.tabs.query)で watch タブを列挙している。queryWatchTabMap
(status-entry.js:482)が lv→{tabId,windowId} を既に作る。ここに tab.active を併せて持てば「裏タブか」が分かる。

1. **検出**: queryWatchTabMap を拡張(または新 query)し、各 watch タブの `{ tabId, windowId, active }` を取る。
   active:false の watch タブを「Alt+Tab に出ない裏タブ」として識別する純関数を src/lib に切り出し test。
   (放置時間の閾値判定は将来。まず「裏タブである」事実の提示と手動クローズを最小で入れる。)
2. **表示**: 「視聴中の配信」カードに、そのタブが裏タブ(active:false)のとき
   「⚠ このタブは Alt+Tab に出ない裏タブです(拡張が過去に開いた遺物の可能性)」のバッジ + 「このタブを閉じる」ボタン。
3. **閉じる**: ボタン押下で chrome.tabs.remove(tabId) を呼ぶ。active:true(前面)タブには出さない=手動視聴は誤爆しない。
   閉じたら次の自動更新でカードが消える。
4. **軽さ鉄則**: 追加 storage read は増やさない(tabs.query は既存経路の再利用)。

## やらないこと(過剰実装の回避)
- 自動クローズ機構は作らない(誤爆リスク+autopatrol 停止で将来の孤児は生まれない=1個の遺物のために
  新設は最小ブラスト半径違反)。
- content の自己申告フラグ永続化は入れない(既存孤児に効かず、将来も autopatrol が停止なので無用)。
- 活動度スコア/放置時間監視は入れない(MV3 SW 常駐不可 + 裏で流し見の誤爆)。
