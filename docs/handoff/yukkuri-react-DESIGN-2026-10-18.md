# ゆっくり3人の「反応」設計書(DESIGN)

> **設計=Fable / 会議素材=無料会議5体(統括 nvidia が 503 で欠落・批判役が統合を兼ねた回=参考扱い) / 裏取り=司令塔(実コードの行・関数名を確認) / 2026-10-18**
> 3段構えワークフロー(council-fable)の手順2の産物。実装ハンドオフ: [yukkuri-react-IMPLEMENTATION-HANDOFF-2026-10-18.md](yukkuri-react-IMPLEMENTATION-HANDOFF-2026-10-18.md)
> コードは変更していない(設計のみ)。コード内の旧コメントが指す `docs/handoff/yukkuri-float-and-celebrate-DESIGN-2026-10-17.md` は未マージのブランチ(`docs/yukkuri-float-celebrate-design`)にしか無い。本書はそれに依存しない。

## 0. お題と結論(先出し)

ユーザー(2026-10-17):「またゆっくりキャラがただ浮かんでるだけの気がします」。→ 会議で決める。

経緯: 2026-10-12 のユーザー指示「とりあえず浮かんでるだけでいい」で `talk:false`(吹き出しが会場の内容に被っていたため)。以降の反応は「コメント件数の節目のお祝い」だけ。

| 論点 | 結論 |
|---|---|
| どの出来事か | ①ギフト(全額・tier 4段)>②コメント節目(実装済み)>③広告(同 tier のギフトより必ず1段下)>④盛り上がり(既存の heat 係数の増幅)。PICK UP・入場は MVP 除外(入場は信号があるが価値最下位) |
| 見せ方 | 強さは `proj.tier` に直結。small/medium = **1人**が笑顔+口パク+小さく跳ねる(帯内・transform のみ)。large/mega = **3人**が節目祝いと同じ弾み+既存バッジに「+1,200pt」。広告は同 tier のギフトより1段下=「ギフト>広告」を人数と振幅で表す。吹き出しは使わない |
| うるささ | 2層ロック: 頷き層 = `NOD_MIN_GAP_MS 2500`+空いている子だけ / 弾み層 = 既存 `cheerUntilMs` 再入無視(2.4秒)を共用。弾み中の頷きは捨てる。合算は v4 に分離 |
| データ経路 | 会場内 `launchGiftThrow` が `true` を返す直前の1箇所(4経路が収束済み・重複除去済み)。**鏡 pulse・メッセージ・storage 差分は使わない** |
| 性能 | CSS keyframes 1本(transform のみ)+ tick 内の期限畳み込み。タイマー/リスナー 0 増・18fps 不変・reduced-motion では跳ねを止め表情だけ。クラッカーは**後** |

## 1. 裏取り: 会議の前提と実コードの食い違い(実コード優先)

| # | 資料(brief)の記述 | 実コード(司令塔が確認済み) | 影響 |
|---|---|---|---|
| F1 | ギフトの信号=鏡セルの pulse | 会場には**ギフトの直接検知が3経路**あり、全部 `launchGiftThrow(speakerKey, proj, detectAt)`([venueBar.js:4503](../../src/extension/venueBar.js))へ収束(呼び出し :4776/:4793/:4839/:4893/:4950)。①`maybeThrowGiftFromSpeech`(:4755・コメント本文) ②`handleNewGiftEvents`(:4862・`nls_gift_events_<lv>`・`thrownGiftEventKeys` で重複除去) ③`handleGiftPointsAggregate`(`computeGiftDelta` 帳簿)。`proj` は `{kind:'gift'|'ad', tier:'small'|'medium'|'large'|'mega', point, durationMs}`(giftThrowProjectile.js)。戻り値 true=実際に投げた | **設計の要**。鏡 pulse は popup が描いた時だけ更新(最大15分 stale)・会場で差分化が要り初回ベースライン問題あり。投げ物が飛んだ瞬間に乗る方が直接・低遅延・重複除去済み・tier 付き。鏡 pulse は**使わない** |
| F2 | 入場は信号が無い | **ある**: `maybeThrowArrivalFromSpeech`(:4812)が `launchGiftThrow('', proj)` を `kind:'gift', point:0`(:4834)で流用 | 入場でもギフト反応が出ないよう **`proj.point > 0` で除外**(地雷) |
| F3 | 反応は節目のお祝いだけ | 浮遊は既に **heat 連動**: `resolveCharaFloat` が `heatLevel` で周期・縦振幅・笑顔率を変える(charaLiveState.js)。`getHeatLevel: () => crowdHeatLevel`(venueBar.js:3353) | qwen 案B(熱度で浮遊)は既に半分入っている=新機構でなく係数の問題 |
| F4 | ギフト節目の祝いは別に出る | `shouldSkipShowerForCheer` は `variant==='support' && kind==='comment_milestone' && ≥100` だけ止める | ギフト反応を足しても popup 側の祝いとは独立(二重にならない) |
| F6 | バッジは帯の内側 | `.nlcl-stage[data-placement="top"] .nlcl-cheer-badge { top: calc(100% + 8px) }` = **3人の下**(帯の外・約40px)に出る。既に 10-17 の節目祝いで採用済み | バッジ再利用なら新たな「覆い」は増えない |

## 2. 会議の裁定

| 案 | 出所 | 裁定 | 理由 |
|---|---|---|---|
| 200px 吹っ飛び+波紋 | qwen 案A | **不採用** | 帯から出て映像・段を覆う=確定指示(覆わない)に反する |
| 熱度で浮遊を大きく | qwen 案B | **採用(v5)** | 既存係数の増幅として |
| `reactionTrigger.js` 等の新ファイル | llama | **不採用** | 実在しない創作・抽象的 |
| 広告=小バッジ / 入場=弾み+「入場」 | gpt-oss-120b | **不採用** | バッジはギフト専用に残す=序列。無料イベントは控えめ(venueBar.js:4829 の既存判断) |
| クールダウン・同時最大数 | gpt-oss-120b | **採用** | 数値は実コード由来に差し替え |
| PICK UP を除外 | gpt-oss-20b | **採用(MVP)** | `talk:false` を一部解除することになり、相槌の歯止めとの整合が別設計。価値序列も低い。後回し |
| reduced-motion の完全対応 | gpt-oss-20b | **採用** | 跳ねを止め表情だけ |

## 3. A. 理想の体験フロー

1. 誰かが 30pt のギフトを投げる → 投げ物が中央へ飛ぶのと**同じ瞬間**、3人のうち1人(投げ主のキーで決定論的に選ばれ、直前に反応した子は避ける)が笑顔で口パクしながら小さく跳ねる(0.9秒)。1.4秒後に浮遊へ戻る。会場の内容は何も隠れない。
2. 1,200pt が来る → 3人全員が節目祝いと同じ弾み(2.4秒)+3人の下に「+1,200pt」。
3. 小額が3連打 → 1人目が跳ね、2.5秒以内の残りは黙る(v4 で「まとめて1回」に昇格)。
4. 広告 500pt → 1人が小さく跳ねる(ギフトの 50pt 相当)。バッジは出ない。
5. コメントが速い時間帯 → 浮遊が速く大きくなり笑顔が増える(既存。v5 で 64px でも分かる量に)。
6. 100件到達 → 既存の3人お祝い(変更なし)。弾み中にギフトが来れば弾みが優先。
7. reduced-motion → 跳ねず、表情(笑顔・口パク)だけ。

「浮かんでいるだけ」が消えるのは 1・2 で、それだけで最小。

## 4. B. 統合アーキ(コンポーネント4つ・既存3層をそのまま使う)

```
[検知] venueBar.js launchGiftThrow(:4503)  ← 4経路収束済み(gift本文/NDGR event/帳簿delta/arrival)
   │  return true の直前に 1行:
   │  if (proj.point > 0) charaLive.onGiftThrown({ kind: proj.kind, tier: proj.tier, points: proj.point, speakerKey })
   ▼
[配線] charaLiveController.js  onGiftThrown(input) → 新 API(talk と独立=cheer と同じ)
   │  ・small/medium(gift) / 全tier(ad を1段下げ) → nod: triggerCharaReaction(state,{commentKey:speakerKey||`gift:${t}`, text:'', nowMs, durationMs:REACT_MIN_MS})
   │       + nodes[who].el に .is-nod を remove/offsetWidth/add(cheer() と同手法)・nodUntil[who]=t+900
   │  ・large/mega(gift) → burst: 既存 cheer 経路を label 指定で共用(cheerUntilMs ロック共用)
   │  ・NOD_MIN_GAP_MS=2500 / 弾み中は nod を捨てる
   ▼
[判断] charaLiveState.js  変更なし(triggerCharaReaction / triggerCharaCheer をそのまま使う)
   ▼
[描画] charaLiveStage.js  CSS 追加のみ: .nlcl-chara.is-nod { animation: nlcl-nod 900ms } + @keyframes + reduced-motion で none
```

- 既存 `cheer()` は `cheerLabel(milestone)` 固定(charaLiveController.js)。v2 で内部を `startBurst(label)` に切り出し、`cheer()`=`startBurst(cheerLabel(m))`、ギフトは `startBurst(formatPtDelta(points))`(liveGiftPulse.js の既存関数=「+1,200pt」)。既存テスト(charaLiveCheer.test.js)の期待は不変。
- 鏡 pulse(`laneMirror.js` の `{g,gt,h,ht}`)は**タイルのバッジ用のまま触らない**。
- `talk:false` は不変(`charaLiveFloatOnly.wiring.test.js` が固定している)。

## 5. C. 具体機構

**C-1 入口(venueBar.js・1箇所)**: `launchGiftThrow` 内、`el.classList.add('is-flying'); return true;` の直前。ここより前の早期 return(`!open`・同時投擲上限)は自然に除外される。条件は `proj.point > 0`(入場 `point:0` を弾く)。`speakerKey`(`u:<uid>` or '')を担当決めの種に渡す。失敗は握る(`try { … } catch {}`)。

**C-2 強さの表(controller 内の純関数 `resolveGiftReaction({kind,tier})`)**

| 入力 | 反応 | 人数 | 長さ | バッジ |
|---|---|---|---|---|
| gift small (1–49pt) | nod | 1 | 1400ms(REACT_MIN_MS) | なし |
| gift medium (50–499) | nod(跳ね大: `.is-nod[data-nod="medium"]` scale 1.22) | 1 | 1400ms | なし |
| gift large (500–4999) | burst(既存 is-cheering) | 3 | 2400ms | `+N pt` |
| gift mega (≥5000) | burst | 3 | 2400ms(v4 で 3200 を検討) | `+N pt` |
| ad small/medium | 無反応 | 0 | – | なし |
| ad large | nod(small 相当) | 1 | 1400ms | なし |
| ad mega | nod(medium 相当) | 1 | 1400ms | なし |

「広告=ギフトの1段下」を表で固定(金額で割らず段で表す)。担当決めは既存 `pickReactingChara(speakerKey || \`gift:${points}\`, lastSpeaker)`。同じ人の連続ギフトは同じ子が反応=「推しに頷く子」が決まる副次効果。

**C-3 歯止め**: `lastNodAt`(`t - lastNodAt < 2500` なら捨てる・キューしない・talk 用の `lastReactionAt` とは分ける)。弾み中(`cheerUntilMs && t < cheerUntilMs`)の nod は捨てる。上限の根拠: 実際は同時投擲上限と投げ物の持続 1.5〜2.4秒で既に律速され、ギフトが毎秒来ない限り数回/分。

**C-4 CSS(charaLiveStage.js の `charaLiveStageCss()` に追記)**
```
.nlcl-chara.is-nod { animation: nlcl-nod 900ms ease-out; }
.nlcl-chara.is-nod[data-nod="medium"] { animation-name: nlcl-nod-medium; }
@keyframes nlcl-nod        { 0%{transform:scale(1) translateY(0)} 30%{transform:scale(1.14) translateY(-5px)} 60%{transform:scale(0.98) translateY(0)} 100%{transform:scale(1) translateY(0)} }
@keyframes nlcl-nod-medium { … scale(1.24) translateY(-8px) … }
@media (prefers-reduced-motion: reduce) { .nlcl-chara.is-nod { animation: none; } }
```
既存 `nlcl-cheer` と同じく、CSS animation は inline transform(浮遊)より優先・fill-mode なし=終われば浮遊に戻る。最大 scale 1.24×64px=79px → 帯の上下に ±8px はみ出すだけ(節目祝いの 1.35 より小さい)。表情は `triggerCharaReaction` の react モードが既に担う。

**C-5 tick での畳み込み(タイマー増なし)**: `nodUntil: Record<CharaId, number>` を controller に持ち、tick の `cheerUntilMs` 判定の隣で `if (nodUntil[id] && t >= nodUntil[id]) { el.classList.remove('is-nod'); nodUntil[id]=0 }`。裏タブで rAF が止まっても、復帰した最初の tick で畳まれる。

**C-6 手動フック(venueBar.js)**: `__nls_chara_react_probe__ = (tier='small', kind='gift') => ({ started: charaLive.onGiftThrown({ kind, tier, points: {small:10,medium:120,large:1200,mega:6000}[tier] }) })`。`__nls_chara_cheer_probe__` の隣。

## 6. D. 偽陽性・退行つぶし

単体(vitest・happy-dom・`charaLiveCheer.test.js` の `makeHarness` を流用): ①small → react の子がちょうど1人・`text===''`・`is-nod` ②2.5秒未満の2回目は捨てる・2.5秒後は別の子 ③large → 3人 react・`is-cheering`・badge `'+1,200pt'`・弾み中の small は捨てる ④ad mega → 1人 nod(medium)・badge hidden / ad small → 捨てる ⑤`points:0` は何もしない(入場の混入防御) ⑥`setVisible(false)` 中・`destroy()` 後は null ⑦tick で900ms 進めると `is-nod` が外れる(reducedMotion でも) ⑧CSS が transform のみ・reduced-motion で `animation:none`。

配線(新規 `charaLiveGiftReact.wiring.test.js`・CRLF 正規化): `launchGiftThrow` 本文に `charaLive.onGiftThrown(` が**1回だけ**・`proj.point > 0` を伴い・`return true;` の前。`maybeThrowArrivalFromSpeech` 本文には**無い**。`startCharaLive({` が `talk: false` のまま。1行削除で赤。

実ブラウザ(headless): 会場を開き probe(small→`.is-nod` が1つ・900ms後に消える / large→`is-cheering`+badge)。本物の経路: `nls_gift_events_<lv>` に1要素 push(`handleNewGiftEvents`)で実発火。★`GIFT_DELTA_DEBOUNCE_MS=60s`(giftDeltaFallback.js)内に本物イベントがあると aggregate 経路は合成されない=検証は events 経路が確実。`status:live` で CPU の前後比較。

偽陽性の芽: 会場を開いた直後の primeEmit に過去のギフト本文が含まれると昔のギフトにも反応(投げ物の既存挙動と一貫)。二重観測(コメント本文と NDGR event)は nod の 2.5秒ギャップと burst の再入無視で二重に見えない。巨大ゴミ値は `computeGiftDelta` が 10億でクランプ済みで、表示は文字列なので崩れない。

## 7. E. MVP(最初の1版)

**v1「ギフトで1人が頷く」**: 変更ファイルは `charaLiveController.js`(`onGiftThrown`・`NOD_MIN_GAP_MS`・`nodUntil`・tick 畳み込み・`resolveGiftReaction`=v1 では large/mega も nod(medium 相当)に倒す)・`charaLiveStage.js`(CSS)・`venueBar.js`(`launchGiftThrow` に1行+probe)・テスト2本。変更しない: `charaLiveState.js`・鏡・storage・記録経路・`talk:false`・既存 cheer。戻し方: venueBar.js の1行削除。

v2: large/mega を3人弾み+`+N pt` バッジ(`startBurst(label)` 切り出し)。v3: 広告を1段下で有効化。v4: 合算(cooldown 中の pt を `pendingPoints` に足し、cooldown 明けの tick で tier を再判定して1回で出す・タイマー増なし)。v5: heat 係数の増幅(`resolveCharaFloat` の振幅係数・実機で見える量を測ってから)。以降: PICK UP 口パク・クラッカー。

## 8. F. 捨てた案と理由

- **鏡 pulse を会場で差分化して検知**: 鏡は popup が描いた時しか更新されず、会場で「新しく現れた/増えた」を再計算する器が要り、初回ベースライン・暫定供給・配信切替を全部書き直すことになる。`launchGiftThrow` にはその全部が入っている。
- **popup からメッセージで通知**: 経路を1本増やす。会場は既に自前で検知している。
- **200px 吹っ飛び**: 帯から出て映像・段を覆う。
- **広告に小バッジ**: 広告にもバッジを出すと「ギフト>広告」が画面上で崩れる。
- **入場で弾み+「入場」**: 無料イベントは有料ギフトより必ず控えめ(venueBar.js:4829)。MVP では出さない。
- **PICK UP で口パク**: `talk:false` を一部解除することになり、相槌の歯止め(`lastReactionAt`)との整合が別設計。後回し。
- **小さな文字(「わぁ」等)**: 帯の下に文字を増やす=覆う方向。バッジ1個(既存)で十分。
- **クラッカー飛び回りを今やる**: 帯外へ DOM を動かす=「覆わない」と衝突。条件を固定して後回し。

## 9. G. 地雷と回避策

- venueBar.js は **CRLF**。Bash heredoc はバックスラッシュを壊す → 編集は Write の `.cjs` 経由。配線テストは `\r\n` 正規化。
- `VENUE_CSS` は文字列・`LANE_CSS_SYNC` 区間内の直接編集禁止 → 本設計の CSS は **charaLiveStage.js の `charaLiveStageCss()`** に置く(venueBar の CSS は触らない)。
- `[hidden]` 安全網: 新 DOM は増やさない(badge は既存)。`.is-nod` はクラスだけ。
- pointer-events: `.nlcl-stage` が none=子に継承。新要素なしなので崩れない。
- `git add` に新規テスト2本と `.html`/`scripts/` を明示(取りこぼし事故の既知地雷)。
- `charaLiveFloatOnly.wiring.test.js` が `startCharaLive({` から 1500 文字内の `talk: false\n  });` を見る → 呼び出しに引数を足すと壊れる。`onGiftThrown` は戻り値 API なので引数追加は不要。
- `charaLiveCheer.test.js` は `cheer({milestone})` の挙動を固定 → 公開挙動は変えない。
- 入場 `proj.point===0` の混入は venueBar 側と controller 側の両方で守る。
- 実機未確認は断言しない: 跳ね量・ギャップの数値は実機で見て微調整する前提。CPU 影響は `status:live` で測るまで「無い」と言わない。

## 10. H. ユーザーへの最小質問(既定案つき・決めなくても v1 は出せる)

1. 小額ギフト(1〜49pt)にも1人が頷くか: (a)全ギフト(既定) (b)50pt以上だけ
2. 500pt以上で「+1,200pt」バッジを3人の下に出すか: (a)出す(既定・v2) (b)弾みだけ
3. 広告に反応させるか: (a)ギフトの1段下で小さく(既定・v3) (b)反応しない
4. 後回しの候補の順: 熱度で浮遊を大きく / PICK UP で口パク / クラッカー
