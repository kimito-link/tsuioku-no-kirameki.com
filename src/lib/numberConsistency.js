/**
 * 状態速報の「数字の自己矛盾」を自動検知する純関数(v0.1.859)。
 *
 * 背景: 2026-06-21 の実機速報で「同じ配信なのにレポートのユニーク127人 vs コメントした人26人」「本文188 vs
 *   記録194 vs 公式196」のような数字の食い違いが出た。これは『片方の集計が壊れている/意味が違う』サインだが、
 *   今までは人(司令塔/ユーザー)が目で照合しないと気づけなかった。診断が【自分の出した数字どうしを照合し、
 *   論理的に矛盾する/強く異常を示す組み合わせ】を自動で⚠に出す=self-verifying loop の核
 *   (検証可能な事実だけ自動ゲート化・[[feedback_self_verifying_loop]])。
 *
 * 原則(self-verifying):
 *   - 機械的に判定できる事実だけを出す。論理的に不可能(コメントした人>来場)や、桁違いの乖離など
 *     「正常な揺れでは説明できない」ものに限る。正常範囲のばらつき(本文 vs 記録の数件差・取得率±数%)は出さない。
 *   - 新規データ取得ゼロ・外部送信ゼロ。既存の livesData / reportPreview の値を照合するだけの薄い層。
 *   - 「どの数字とどの数字が、どう食い違っているか」を必ず明示する(原因特定を人に丸投げしない)。
 *
 * @typedef {{
 *   id: string,
 *   severity: 'bad'|'warn',
 *   message: string
 * }} ConsistencyFinding
 */

/** @param {unknown} v @returns {number|null} */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** @param {number} n */
function ja(n) {
  return n.toLocaleString('ja-JP');
}

/**
 * livesData(配信ごと)と reportPreview(保存前KPI)と fastDiag(公式値 DOM↔NDGR)を照合し、矛盾を検知する。
 * @param {{ livesData?: any[], reportPreview?: any, fastDiag?: any }} data
 * @returns {ConsistencyFinding[]}
 */
export function detectNumberInconsistencies(data) {
  /** @type {ConsistencyFinding[]} */
  const findings = [];
  const livesData = Array.isArray(data?.livesData) ? data.livesData : [];
  const rp = data?.reportPreview && typeof data.reportPreview === 'object' ? data.reportPreview : null;

  // --- 配信ごと: 取得率が極端(記録↔公式の乖離)。多タブ名残/二重計上/取りこぼしのサイン ---
  for (const lv of livesData) {
    const recorded = num(lv?.recordedCount);
    const official = num(lv?.officialCommentCount);
    const id = String(lv?.lv || lv?.liveId || '');
    if (recorded == null || official == null || official <= 0) continue;
    const pct = Math.round((recorded / official) * 100);
    // 記録が公式を大きく上回る(>130%)=論理的におかしい(記録は公式の部分集合のはず)。
    //   配信終了直後の数件差や多タブ少量名残は正常なので、明確に過剰な 130% 超だけ。
    if (pct > 130) {
      findings.push({
        id: `over-record-${id}`,
        severity: 'warn',
        message:
          `記録(${ja(recorded)})が公式(${ja(official)})を大きく上回っています(${pct}%・${id})。` +
          `記録は公式の一部のはずなので、別配信のコメント混入か二重計上の疑いがあります。`
      });
    }
  }

  // --- レポートプレビュー(保存前KPI)の内部矛盾 ---
  if (rp) {
    const total = num(rp.totalComments);
    const uniqueUsers = num(rp.uniqueUsers); // marketing の「のべ別キー」(過大になりうる)
    const commenters = num(rp.commenters); // gap の実人数(正本)
    const visitors = num(rp.visitors);

    // 1) コメントした人 > 来場 = 論理的に不可能(来場者の一部しかコメントしない)。
    if (commenters != null && visitors != null && visitors > 0 && commenters > visitors) {
      findings.push({
        id: 'commenters-gt-visitors',
        severity: 'bad',
        message:
          `「コメントした人」(${ja(commenters)})が「来場」(${ja(visitors)})を超えています。` +
          `来場者の一部しかコメントしないはずなので、来場数の取得失敗かコメント者の数え過ぎの疑いがあります。`
      });
    }

    // 2) のべ別キー(uniqueUsers)が本文コメント数を超える=不可能(1コメント=最大1キー)。
    if (uniqueUsers != null && total != null && total > 0 && uniqueUsers > total) {
      findings.push({
        id: 'uniquekeys-gt-total',
        severity: 'warn',
        message:
          `ユニーク集計(${ja(uniqueUsers)})が本文コメント数(${ja(total)})を超えています。` +
          `1コメント=最大1キーのはずなので、集計の母数ズレの疑いがあります。`
      });
    }

    // 3) レポート本文と配信の記録総数が桁違い(v0.1.853 型の断線=表示用キャップへの短絡の早期検知)。
    //    同一配信が1つに特定できる時だけ照合(複数配信ならどれと比べるか曖昧なのでスキップ)。
    if (total != null && total > 0 && livesData.length === 1) {
      const recorded = num(livesData[0]?.recordedCount);
      // レポート本文は「本文ありのみ・配信者除外・興味到着除外」で記録総数より少なめが正常。
      //   だが記録の半分未満まで落ちるのは、全件 storage でなく表示用キャップ済みを集計している断線のサイン。
      if (recorded != null && recorded >= 50 && total < recorded * 0.5) {
        findings.push({
          id: 'report-undercount',
          severity: 'warn',
          message:
            `レポートの本文コメント(${ja(total)})が記録総数(${ja(recorded)})の半分未満です。` +
            `レポートが全件でなく表示用の一部だけを集計している断線(過小集計)の疑いがあります。`
        });
      }
    }
  }

  // --- 公式値の DOM↔NDGR 乖離。同じ公式値を2経路(DOM 表示/NDGR protobuf)で取っていて、両方とも
  //     数値が取れているのに食い違う=どちらかの取得がズレているサイン(v0.1.862 照合拡充)。
  //     両方が有限数の時だけ比較(片方 null=未取得は比較しない=誤検知防止)。
  const v2 = data?.fastDiag?.content?.giftDiagnostics?.officialValuesV2;
  if (v2 && typeof v2 === 'object') {
    /** @type {Array<[string, string]>} */
    const pairs = [
      ['giftPoints', 'ギフトpt'],
      ['adPoints', '広告pt']
    ];
    for (const [key, label] of pairs) {
      const entry = v2[key];
      const ndgr = num(entry?.ndgr?.value);
      const dom = num(entry?.domStats?.value);
      if (ndgr == null || dom == null) continue; // どちらか未取得=比較しない。
      // 完全一致が基本。pt 系は大きい値もあるので「差が大きい時だけ」(絶対差>=100 かつ 相対差>=20%)。
      //   小さなタイミング差(DOM 更新ラグ)で毎回⚠を出さないための二重ゲート。
      const absDiff = Math.abs(ndgr - dom);
      const base = Math.max(Math.abs(ndgr), Math.abs(dom), 1);
      if (absDiff >= 100 && absDiff / base >= 0.2) {
        findings.push({
          id: `domndgr-${key}`,
          severity: 'warn',
          message:
            `${label}が DOM 表示(${ja(dom)})と NDGR(${ja(ndgr)})で食い違っています。` +
            `公式値の取得経路のどちらかがズレている可能性があります。`
        });
      }
    }
  }

  return findings;
}
