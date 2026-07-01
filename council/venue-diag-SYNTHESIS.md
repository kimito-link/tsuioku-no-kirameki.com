# SYNTHESIS: 会場モードに診断ブロックを加える(Phase 3・最終)

会議 2026-07-01 / code カテゴリ / routed 4体(qwen3-32b 批判, qwen3.6-27b 発散, llama-3.3-70b 爆速, gpt-oss-120b 批判)。code モードは1案に統合されログ本体に4体分が出る。司令塔が実コード裏取りの上で集約。

## 収束した結論(4体一致)
### 置き場: 席エリアの【外】の独立オーバーレイ・既定は畳む・🩺ボタンで開く
- 折りたたみを `seatsHost`(席)に入れず、**別レイヤ(position で席レイアウトに一切影響しない)**に置く=開閉で席の高さが揺れない(全体一致・gpt-oss/qwen 明示)。
- 会場はフルスクリーン没入 UI。**既定は畳む**。ヘッダーに 🩺 ボタンを足し、押したときだけ出す(既存 👥一覧/rosterPanel と同じ流儀=実績あり)。
- status(健全度パネル)が同じ観測値を色セルで既に出しているが、**会場内で「その場で見える」価値はある**(別窓/OBS 時に status を開かず状態が分かる)。二重でも冗長でない。

### sig(無変化 skip)キー: 件数のハッシュのみ・capturedAt は入れない
- `seatsShown|participantCount|otherCount|broadcasterInSeats|lastUpdateAt`(+アバター採用時は withAvatar/resolvedAvatar/withUid)の**件数だけ**を sig に。`capturedAt`(時刻)は絶対に入れない(v0.1.1022 明滅の教訓・全体一致)。

### 実装分担: 新規 src/lib/venueAvatarDiagLine.js・会場は read-only・storyAvatarDiagLine は改変しない
- qwen 批判の重要指摘=`storyAvatarDiagLine` を会場から直接流用するのは**型不整合で非現実的**(venue participant は {key,userId,name,avatar,count,giftPoints,hasGift}、story 側は別 typedef)。→ **storyAvatarDiagLine.js は触らない**。
- 新規 `src/lib/venueAvatarDiagLine.js` を storyAvatarDiagLine の**流儀(件数のみ・PII なし・ユーザー向け lead + 折りたたみ)**で作り、会場の participants + venueSeatsDiag を受け取る純関数にする。vitest で件数固定検証。

## 割れた点と司令塔判断
**アバター/userId 解決率を出すか(venue 固有だけか)**:
- gpt-oss(批判): venue 固有だけにせよ。アバター率を足すと participants の**毎フレーム走査**が増え hot path が重い。
- qwen(批判): userId 解決率は重要、省くと「恥をかかせる」。
- **司令塔判断: 両方出す。ただし毎フレーム再計算しない**。会場は元々 renderSeats で participants を作っている。診断はそこから**件数を1回読むだけ**を、既存 `publishVenueSeatsDiag` の**3秒 min-gap + sig 無変化 skip** に相乗りさせる(gpt-oss のコスト懸念を無効化しつつ qwen の価値を残す)。走査を新設しない=過剰実装回避。

## 高さ振動を出さない具体設計(handoff 地雷#1)
- 診断パネルは `.nlsb-venue-diag-panel`(新)を **overlay**(position: absolute 等)で席の外に重ねる。開いても `seatsHost` の高さは 1px も変わらない。
- 空データ(participantCount=0)時はボタンごと出さない or パネル内に「まだ参加者がいません」を固定高で出す(0↔本体の畳み振動を作らない)。
- パネルの内容更新は sig 無変化なら DOM を触らない(明滅しない)。

## やってはいけない(批判役の穴・handoff と一致)
1. participants をアバター率のためだけに**毎フレーム再走査**(→ 既存 renderSeats の1回に相乗り・3秒 gap)。
2. `storyAvatarDiagLine.js` を会場向けに改変(→ 触らない・新規 venueAvatarDiagLine.js)。
3. 折りたたみを seatsHost 内に置いて席の高さを揺らす(→ overlay で外に)。
4. 新 storage キーを増やす(→ 既存 KEY_VENUE_SEATS_DIAG に相乗り。アバター件数はパネル描画時にその場計算=storage に増やさない)。
5. 没入 UI に常時デバッグ情報を出して興を削ぐ(→ 既定畳む・🩺 で開く)。
6. venueBar を太らせて max-lines 超過(→ 純関数は venueAvatarDiagLine.js)。

## 実装計画(Phase 3)
1. `src/lib/venueAvatarDiagLine.js`(新): `computeVenueParticipantAvatarCounts(participants)` → {total, withUid, withAvatar, resolvedAvatar}(件数のみ純関数)+ `buildVenueDiagHtml({counts, seatsDiag})` → ユーザー向け lead + 会場固有(席数/参加者/ほかN/配信者混入/最終更新)の HTML。vitest でテスト。
2. `venueBar.js`: ヘッダーに 🩺 ボタン + `.nlsb-venue-diag-panel`(overlay)。開いているときだけ、renderSeats 末尾(既存 publishVenueSeatsDiag と同じ 3秒 gap + sig)で件数を1回計算しパネル更新。CSS で席の外に絶対配置。
3. 検証: verify:cc 緑・実機で「開閉で席が揺れない/重い配信で重くならない」。

## 会議の限界(裏取り済み)
- storyAvatarDiagLine と venueSeatsDiag/collectVenueparticipants のシグネチャは司令塔が実コードで確認済み(型不整合の指摘は正しい=story 側は StoryAvatarDiagSnapshot、venue participant は別形)。
- rosterPanel(👥一覧)が既存の overlay パターンを持つ=🩺 パネルはこれを踏襲すれば席高さを侵さない(裏取り済み・venueBar.js:1386 rosterBtn / :724 .nlsb-roster-panel)。
