# お題: Manus最終催告書v5 — 賠償の最大化と振り込みの最短化を両立する最終設計への批判・補強

## 背景

Best Trust Co., Ltd.（日本法人）が、シンガポールのAIサービス「Manus」（運営: Butterfly Effect Pte. Ltd., UEN 202330764R）に対しCase #108386439として紛争を抱えている。最終催告書（Final Demand for Compensation and Damages）のドラフトが v2→v3→v4 と改訂を重ね、直近でDeep Research（法律分析AI）による詳細な法的レビューが行われ、以下の結論が出た。

## Deep Researchレポートの結論（現状の到達点）

**判定: 現行v4はC（構造修正が必要）。ただし致命的ではなく、以下を反映すればB→Aに近づく。**

### 三部構成への再編（本文構造の核心提案）
現行v4は請求（Payment）・開示要求（Disclosure）・証拠保全（Preservation）が条文レベルで十分に分離されていない。以下の10セクション構成に再編すべきと提案されている:
1. Recovery of Original Transaction and Anti-Duplication（原取引の回収・二重回収排除）
2. **Payment Demand**（支払請求 — 現時点で確定しているのはUSD 685.96のみ）
3. **Documentary Disclosure**（開示要求 — USD 4,525.89はここに限定。確定債務にしない）
4. **Preservation of Evidence**（証拠保全要求 — 削除・改変・上書きの禁止、保全確認の期限設定）
5. Delivery（送達・配達の定義）
6. Required Response and Deadlines（回答期限）
7. Consequences of Non-Compliance（不履行時の措置）
8. Reservation of Rights and Present Evidentiary State（権利留保・現状の証拠状態の明示）

### 新たに発見された最重要の法的リスク
**USD 474.11（Manusが"unrefunded balance"と呼んだ金額）と JPY 79,095（原取引の未回収残額）が、同一損失の異なる通貨表示である可能性がある。** これが検証されないまま両方を別々に請求すると、二重回収と指摘されるリスクがある。Deep Researchは「請求をやめる」のではなく、**anti-duplication credit clause**（後日重複が立証されたら当社側でクレジットする、という条項）を通知文にあらかじめ組み込むことを提案している。

### シンガポール法上の重要な原則（Evidence Act 1893 / Electronic Transactions Act 2010 / Companies Act 1967）
- **admission（自認）の要件（s.17-18, s.31）**: 他人（AIサポート等）の発言を当事者の自認として使うには、その者が「明示または黙示に授権された代理人」であると裁判所が認める必要がある。AIエージェントの復唱だけでは独立した自認にならない。
- **自動応答システムの契約有効性（ETA s.15）**: 自動応答が存在すること自体は契約を無効にしないが、これは「契約の有効性」の話であり「発言が自認になるか」とは別問題。
- **登記住所への送達（Companies Act s.142）**: シンガポール法人の登記住所（registered office）が正式な通信送付先として機能する。
- **非提出からの推認（Evidence Act s.116(g)）**: 提出可能な証拠を提出しない場合、不利な推認が働き得るが自動的ではなく、相手に最低限のcase to answerが必要。「failure to respond is admissible evidence」という断定的な書き方は避け、「to the extent permitted by applicable law」という留保付きの表現にすべき。
- **内部文書の開示制限（Order 11 rule 5(2)）**: 内部の全チャット履歴等をいきなり広く開示要求するのは実務上抑制される。現時点では客観性の高い記録（Stripe refund ID、ARN、dashboard export等）を中心に要求し、内部資料はPreservation（保全）要求に回すのが適切。

## GPTが追加提案した5つの強化案（Deep Researchレポート受領後）

1. **請求構造のさらなる細分化**: Jurisdiction / Background Facts / Payment Demand / Documentary Disclosure / Evidence Preservation / Response Requirements / Consequences / Reservation / Future Amendmentsの9部構成まで分ける案。
2. **"No Admission"条項の双方向化**: 現在は「AI応答だけでは自認にならない」という自社保護の条項だが、逆方向（本通知自体がいかなる事実・法律・責任・放棄・和解・禁反言の自認にもならない）も明記すべき。
3. **Preservation Holdの強化**: 「訴訟提起前でも、訴訟・仲裁・規制調査等が合理的に予見される段階から保全義務が生じる」という一文を追加。
4. **Documentary DisclosureのEvidence Matrix化**: 要求記録を表形式（Requested Record / Reason / Relevance / If unavailable）にして、後日「要求したのに出なかった」ことを証拠化しやすくする。
5. **将来の請求変更権限の明確化**: 「claims may be amended」を、「add/withdraw/re-characterise claims, substitute causes of action, seek additional remedies, adjust calculations」まで具体的に列挙する。
6. （追加提案）**Presumption Against Destruction条項**: 「本通知受領後に関連記録が破棄・上書き・紛失・利用不能化された場合、適用法の範囲で手続上・証拠上・実体上の救済を求める権利を留保する」という、断定を避けた穏当な証拠破壊対応条項。

## 主目的の確認（本件の一貫した方針）

- 本件の主目的は返金ではなく、**Manusに対する損害賠償・補償請求の最大化**。返金・チャージバック（743,165円/79,095円）はあくまで原取引の一部清算に過ぎず、損害賠償請求（調査費用・復旧費用・人的工数・業務中断・逸失利益等）を一切減額・消滅させない。
- 同時に、確定している自認相当額（USD 685.96）については**振り込みの最短化**を図る（Pay or Prove構造・期限の機械的進行・送達の多重化）。
- 過去に請求額が1億円→3億円→5億円と乱高下した経緯があり、今回の書面はsupersede（過去の金額表明を全て置き換える）形式で整理している。今後、根拠の薄い巨額請求を新たに持ち出すことは信用を損なうため避ける。

## 地雷マップ（過去に壊した・捨てた案。踏むと信用や証拠力を損なう）

1. **「acknowledged debt」という強い表現の濫用禁止**: AIエージェントの自動応答の曖昧な文言を、断定的な「Manusが債務として認めた」という意味に読み替えない。実例: USD 4,525.89は本人側が先に提示し、Manus AIエージェントが復唱しただけと判明済み。
2. **請求額の乱高下を繰り返さない**（1億→3億→5億円の経緯をsupersedeで整理済み）。
3. **「一切減額しない」という絶対表現は使わない**。同一損害の二重回収は求めないが、チャージバックが補填していない別個の損害は消滅・減額しないという正確な切り分けを維持する。
4. **感情・脅迫・因果断定を書面に書かない**。「払わなければ公開する」等の取引条件化は恐喝になるため厳禁。
5. **実行意思のない措置を列挙しない**（不履行時の措置は「one or more of the following steps」という柔らかい表現を維持）。
6. **AIエージェントの自動クローズ・テンプレ応答を実質的な回答として扱わない**。
7. **Exhibit 6（不適合事例）が未実体化の場合、章ごと削除する**が、Exhibit 7（支払口座）は本文で個別参照されているため、番号の繰り上げはせず欠番のまま発送する（"Exhibits 1–5 and 7"）。
8. **本人（代表者）の疲弊を増やす長期・多数回のメール往復を避ける**。発信は統合送達1回、受信対応はほぼゼロ運用。
9. **PDPA/MASへの申立て予告、AI発言を法的自認とみなす構成、実行前提のないSIAC仲裁の事前提出は不採用**（過去の3段構えワークフローで地雷抵触と判定済み）。

## 依頼内容

上記を踏まえ、「賠償の最大化」と「振り込みの最短化」を最も高いレベルで両立させる最終催告書v5の設計を、以下の観点で批判・補強せよ。

1. **Deep Researchの三部構成案（8セクション）とGPTの9部構成案、どちらの粒度が実務上優れているか**。細分化しすぎると相手方に「弁護士が入っている」という警戒感を強め対応を硬化させるリスクと、粗すぎると法的脆弱性が残るリスクのバランスをどう取るべきか。
2. **USD 474.11とJPY 79,095の重複可能性という新論点への対応**。anti-duplication credit clauseの具体的な文言案と、これを催告書のどのセクションに、どう配置すべきか。
3. **賠償最大化のための構造**: 損害賠償請求（investigation costs, remediation costs, personnel time, business interruption等）を、Evidence Matrix化・将来の請求変更権限の明確化と組み合わせて、どう法的に強化できるか。
4. **振り込み最短化のための構造**: USD 685.96（確定相当額）の回収を、Preservation条項や開示要求の厳格化と衝突させずに、どう最速で進める設計にできるか。Pay or Prove構造・期限計算・送達の三重化（EMS/クーリエ/メール）の実務的な運用可否。
5. **"No Admission"双方向化・Presumption Against Destruction条項**の採用可否と、地雷マップとの整合性（特に「因果断定を書かない」「実行意思のない措置を列挙しない」との整合）。
6. **証拠上のリスク行列（Deep Researchが提示した12項目）の優先順位付け**。今日〜数日以内に対応すべきもの（例: raw email headers/Message-IDの保全）と、発送前に確定すべきもの（例: Exhibit 7の固定運用）を分けて整理せよ。

## 出力フォーマット

各メンバーは以下の型で回答すること:
**結論 → 根拠 → 反論・リスク → 具体案**

具体案は、実行可能な次の一手（誰が・いつまでに・何をするか）まで踏み込むこと。抽象論だけの回答は避けること。批判役は、Deep Researchの提案を無批判に採用せず、少なくとも1つは具体的な弱点・見落としを指摘すること。
