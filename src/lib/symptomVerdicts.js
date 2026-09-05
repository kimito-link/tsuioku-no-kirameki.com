/**
 * symptomVerdicts.js — 「症状名でそのまま引ける」特化判定を**複数**出す純関数。
 *
 * ★なぜ要るか(2026-08-13 ユーザー指摘)
 *   ユーザーの言葉:「特化したものを複数つくれといっているのに、総合1個しかない」
 *
 *   従来は `summarizeHealthVerdict` が33セルを**1行に畳んで**いた:
 *       総合判定: 🟢 取り込み中 ✓（取得を進めています）
 *   ＝サムネが全部白くても、レーンが空でも、**総合は緑になりうる**。
 *   実際 2026-08-13 の実機は「総合=取り込み中✓」なのに、
 *   会場のサムネは白く、応援レーンは描画関数が一度も呼ばれていなかった。
 *
 * ★この設計の肝: 判定を【ユーザーが困ったときに使う言葉】で引けるようにする。
 *   「サムネが白い」「レーンが空」「黒い」「重い」— これが症状名。
 *   セル名(avatar / lane-count / paint)は開発者の言葉であって、
 *   困っている当人の言葉ではない([[instrument-must-name-the-cause-2026-08-01]])。
 *
 * ■ 掟
 *   1. **正常なものは出さない**(異常だけ出す=ノイズを作らない)。
 *      ★累積値ではなく「いまどうか」で判定する
 *      ([[cumulative-value-shown-as-current-state-2026-08-12]])。
 *   2. **1行目に次の一手**を書く。読んで直せない判定は価値が低い
 *      ([[instrument-value-is-measured-by-fixes-2026-08-12]])。
 *   3. **仕様上取れないものを異常と呼ばない**(匿名にサムネは存在しない)。
 *      ここを間違えると「直せない赤」が居座り、本物の異常が埋もれる。
 *   4. 純関数・DOM を触らない・時刻は呼び出し側が渡す。
 *
 * @module symptomVerdicts
 */

/** @typedef {{ id:string, symptom:string, level:'bad'|'warn', line:string }} SymptomVerdict */

/**
 * ★v0.1.1391: popup 起動から この時間 未満のスナップショットでは
 *   レーン系を判定しない(起動直後は「まだ動いていない」が正常)。
 *   実機の偽陽性は popup 起動 0.2 秒後の値で 🔴 を出していた。
 */
export const LANE_JUDGE_MIN_AGE_MS = 5000;

/**
 * 数値化(取れなければ null=未観測。0 と混同しない)。
 * @param {unknown} v
 * @returns {number|null}
 */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 症状ごとの特化判定を作る(異常なものだけ・複数返す)。
 *
 * @param {object} input
 * @param {any} [input.identityAcquisition] サムネ/名前の取得率(popup診断)
 * @param {any} [input.laneRenderProbe] 応援レーン描画の観測
 * @param {any} [input.sidepanelSelfDiag] サイドパネル自己診断
 * @param {any} [input.avatarLoadDiag] アイコン画像のロード結果
 * @param {number} [input.updateMs] 状態速報の更新所要(ms)
 * @param {number} [input.popupAgeMs] popup 起動からの経過(ms)。v0.1.1391 で追加。
 *   未指定/null は不明として従来どおり判定する。短い値のときだけレーン系を見送る
 *   (起動直後の「まだ動いていない」を異常と誤判定しないため)。
 * @returns {SymptomVerdict[]} 異常だけ・重い順
 */
export function buildSymptomVerdicts(input) {
  const out = /** @type {SymptomVerdict[]} */ ([]);
  if (!input || typeof input !== 'object') return out;

  /* ────────────── ① サムネが白い ────────────── */
  const ia = input.identityAcquisition;
  if (ia && typeof ia === 'object') {
    const identifiable = num(ia.identifiable) ?? 0;
    const withThumb = num(ia.withThumb) ?? 0;
    const guessed = num(ia.guessedThumb) ?? 0;
    /*
     * ★匿名は分母に入れない(仕様上サムネが存在しない=直せない赤にしない)。
     *   数値IDを持つ人が1人以上いて、その全員が実サムネ0のときだけ異常と呼ぶ。
     */
    if (identifiable > 0 && withThumb === 0) {
      out.push({
        id: 'thumb-white',
        symptom: 'サムネが白い',
        level: 'bad',
        line:
          `🔴 サムネが白い: 名前が出ている${identifiable}人の実サムネが0件` +
          (guessed > 0 ? `(${guessed}人はIDから組んだ推測URLを表示中=実在未確認)` : '') +
          ' ★次の一手: 実サムネの取得経路(プロフィール解決)を確認。推測URLは404で白くなる'
      });
    }
  }

  /* ────────────── ② アイコンが読めない(CDN側) ────────────── */
  const al = input.avatarLoadDiag;
  if (al && typeof al === 'object') {
    const failed = num(al.usericonFailed) ?? 0;
    const ok = num(al.usericonSucceeded) ?? 0;
    if (failed > 0 && ok === 0) {
      out.push({
        id: 'avatar-all-failed',
        symptom: 'アイコンが全部読めない',
        level: 'bad',
        line:
          `🔴 アイコンが全部読めない: ${failed}件すべて失敗(成功0件)` +
          ' ★次の一手: URLの組み立てか通信を疑う(一部失敗なら相手側の404で正常)'
      });
    }
  }

  /* ────────────── ③ レーンが空 ────────────── */
  const lp = input.laneRenderProbe;
  /*
   * ★v0.1.1391(ユーザー実機で偽陽性): popup 起動【直後】のスナップショットで
   *   「描画関数が一度も呼ばれていません」と断定していた。
   *
   * ■ 何が嘘だったか
   *   実機の速報は `popup 起動から 0.2 秒後の値` で、当然まだ何も走っていない。
   *   それを 🔴 として出したうえ、3画面パリティまで「①が起動していない」と
   *   引きずっていた。★同じ画面には「応援レーン 23人 全員表示」が緑で出ていた
   *   =**同じ速報の中で矛盾**([[red-may-be-snapshot-too-early-2026-08-08]])。
   *
   * ■ 直し方: 起動直後は判定しない。**まだ分からない**と**壊れている**を混ぜない。
   *   popupAgeMs が短い間は「起動直後」として黙る(呼び出し側が渡せないときは
   *   従来どおり判定する=後方互換)。
   */
  /*
   * ★`num()` は Number(null)===0 のため **null を 0 に化かす**。
   *   そのまま使うと「経過不明」が「経過0ms=起動直後」になり、
   *   **常に判定を見送る**=足した判定が永久に出ない(自分で踏んだ)。
   *   → null/undefined は明示的に「不明」として扱い、従来どおり判定する。
   */
  const rawAge = input.popupAgeMs;
  const popupAgeMs = rawAge == null ? null : num(rawAge);
  const tooEarly = popupAgeMs != null && popupAgeMs >= 0 && popupAgeMs < LANE_JUDGE_MIN_AGE_MS;
  if (lp && typeof lp === 'object' && !tooEarly) {
    const started = num(lp.started) ?? 0;
    const painted = num(lp.domTilesPainted);
    if (started === 0) {
      out.push({
        id: 'lane-never-rendered',
        symptom: 'レーンが空',
        level: 'bad',
        line:
          '🔴 レーンが空: 描画関数が一度も呼ばれていません' +
          ' ★次の一手: watchタブを前面にして数十秒待つ(隠れていると描画を見送る仕様)'
      });
    } else if (painted != null && painted === 0) {
      out.push({
        id: 'lane-painted-zero',
        symptom: 'レーンが空',
        level: 'bad',
        line:
          '🔴 レーンが空: 描画は走ったのにタイルが0枚' +
          ' ★次の一手: 供給側(heavy/鏡)が空。記録件数と鏡の件数を突き合わせる'
      });
    } else if (String(lp.heavySettleState || '') === 'race') {
      out.push({
        id: 'lane-heavy-race',
        symptom: 'レーンが揃わない',
        level: 'warn',
        line:
          '🟡 レーンが揃わない: 全件読みが毎回追い越されて未完了(race)' +
          ' ★次の一手: 一部の人しか出ない状態。時間経過で揃うか観察する'
      });
    }
  }

  /* ────────────── ④ 開いた直後が黒い ────────────── */
  const sp = input.sidepanelSelfDiag;
  if (sp && typeof sp === 'object') {
    const blindMs = num(sp.blindMs) ?? num(sp?.contentBlind?.blindMs);
    if (blindMs != null && blindMs >= 1000) {
      out.push({
        id: 'panel-black',
        symptom: 'パネルが黒い',
        level: blindMs >= 4000 ? 'bad' : 'warn',
        line:
          `${blindMs >= 4000 ? '🔴' : '🟡'} パネルが黒い: 開いてから${Math.round(blindMs / 100) / 10}秒間、中身が出ていません` +
          ' ★次の一手: 主因(幕/シェード)は速報の該当行に出ています'
      });
    }
  }

  /* ────────────── ⑤ 診断が重い ────────────── */
  const upd = num(input.updateMs);
  if (upd != null && upd >= 3000) {
    out.push({
      id: 'status-slow',
      symptom: '診断が重い',
      level: upd >= 10000 ? 'bad' : 'warn',
      line:
        `${upd >= 10000 ? '🔴' : '🟡'} 診断が重い: 更新に${Math.round(upd / 100) / 10}秒` +
        ' ★次の一手: 同時視聴タブ数と記録件数を確認(storage競合が主因)'
    });
  }

  // ★重い順(bad→warn)。同レベル内は検出順を保つ。
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1));
}

/**
 * ★症状の合言葉の見出し。共有テキストから機械が拾えるように固定文字列にする。
 *
 * ★なぜ要るか(2026-08-23)
 *   症状IDは【前から出ていた】のに、速報には人が読む文だけを載せていた。
 *   ⟹ 受け取った側が「過去に同じ症状があったか」を★言葉で引けなかった。
 *   実測: 症状ID 7件で原因索引(ai-hub 245件)を引くと ★ヒット率 0%。
 *
 *   ★索引を引くには両側が【同じ言葉】を使っている必要がある。
 *   人が読む文は毎回変わるが、症状IDは変わらない。だからIDを載せる。
 */
export const SYMPTOM_SIGNATURE_LABEL = '合言葉(この語で過去の原因を検索):';

/**
 * 速報に貼るブロックへ整形する。
 * ★異常が無ければ**何も出さない**(正常時に1pxも足さない)。
 *
 * @param {SymptomVerdict[]|null|undefined} list
 * @returns {string} 空文字=出さない
 */
export function formatSymptomVerdictsBlock(list) {
  const arr = Array.isArray(list) ? list : [];
  if (arr.length === 0) return '';
  const lines = ['### 症状別の判定(いま出ている異常だけ)'];
  for (const v of arr) lines.push(v.line);

  // ★合言葉を1行にまとめて出す。
  //   ★人が読む文とは別に置く: 文は毎回変わるが、この語は変わらないため
  //   受け取った側が【そのまま検索に貼れる】。
  //   ★正常時は上の early return で何も出ないので、1pxも足さない。
  const ids = arr.map((v) => String(v?.id || '').trim()).filter(Boolean);
  if (ids.length > 0) {
    lines.push(SYMPTOM_SIGNATURE_LABEL + ' ' + ids.join(' '));
  }
  return lines.join('\n');
}
