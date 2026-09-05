/**
 * finalDetailCells.js — 100個化の最終弾(識別・効果音・BGM・記録の質)。
 *
 * ★このモジュールが埋めるもの
 *   在庫の中で「枠が薄い」ところを、**症状として意味のあるものだけ**で埋める。
 *   会議 critic の判定に従い、数合わせで負の計器(読んでも直せない/誤誘導)は入れない。
 *
 * ■ 掟(1〜6)は他の *Cells.js と同じ。特に:
 *   掟1 防御が効いた回数は異常にしない
 *   掟2 仕様上そうなるものを異常にしない(匿名にサムネは無い等)
 *   掟5 「使っていない0」と「動くはずの0」を区別する
 *   掟6 次の一手か「これは仕様です」を書けないセルは作らない
 *
 * @module finalDetailCells
 */

/** @param {unknown} v @returns {number} */
function n0(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {string} id @param {string} label
 * @param {'ok'|'warn'|'bad'|'na'} level @param {string} text
 * @returns {import('./healthCells.js').HealthCell}
 */
function cell(id, label, level, text) {
  return { id, label, kind: /** @type {'state'} */ ('state'), value: null, level, text };
}

/**
 * 最終弾のセル。
 * @param {any} data buildHealthCells と同じ入力
 * @returns {Array<import('./healthCells.js').HealthCell>}
 */
export function buildFinalDetailCells(data) {
  /** @type {Array<import('./healthCells.js').HealthCell>} */
  const out = [];
  const p = data?.popupDiag?.popup ?? data?.popupDiag ?? null;

  /* ══ 人の識別 ══════════════════════════════════════════
   * ★ユーザーが価値を感じる指標そのもの(誰が言ったかを結びつけられているか)。
   * ★掟2が最重要: **匿名にはサムネも名前も原理的に無い**。
   *   匿名を分母に入れると「取れていない」と嘘をつく。
   *   identifiable(識別可能な人)だけを分母にする。
   */
  const ia = p?.identityAcquisition ?? null;

  /* ── 匿名の割合(仕様の説明・異常ではない) ─────────────── */
  if (!ia || !n0(ia.total)) {
    out.push(cell('identity-anon', '匿名の割合', 'na', '—'));
  } else {
    const total = n0(ia.total);
    const anon = n0(ia.anonymous);
    const pct = Math.round((anon / total) * 100);
    out.push(cell(
      'identity-anon', '匿名の割合',
      'ok', // ★匿名が多いのは配信の性質。異常ではない(掟2)
      `${anon}/${total}人(${pct}%)が匿名です${pct >= 50 ? ' ※匿名はサムネ・名前を取得できません(仕様)' : ''}`
    ));
  }

  /* ── 名前が取れているか(識別可能な人だけを分母に) ───────── */
  if (!ia || !n0(ia.identifiable)) {
    out.push(cell('identity-name', '名前の取得', 'na', '—'));
  } else {
    const namePct = Number(ia.namePercent);
    const missing = n0(ia.missingName);
    const ok = Number.isFinite(namePct) ? namePct : 0;
    out.push(cell(
      'identity-name', '名前の取得',
      ok >= 80 ? 'ok' : ok >= 50 ? 'warn' : 'bad',
      `${ok}%取得${missing > 0 ? `(${missing}人が未取得)` : ''}`
    ));
  }

  /* ── サムネが取れているか ─────────────────────────────
   * ★guessedThumb(合成=ゆっくり顔)は「取れなかった代替」。
   *   匿名主体の配信では合成が多いのが正常なので、
   *   **識別可能な人の中での実物率**だけを見る。
   */
  if (!ia || !n0(ia.identifiable)) {
    out.push(cell('identity-thumb', 'サムネの取得', 'na', '—'));
  } else {
    const thumbPct = Number(ia.thumbPercent);
    const missing = n0(ia.missingThumb);
    const ok = Number.isFinite(thumbPct) ? thumbPct : 0;
    out.push(cell(
      'identity-thumb', 'サムネの取得',
      ok >= 80 ? 'ok' : ok >= 50 ? 'warn' : 'bad',
      `${ok}%取得${missing > 0 ? `(${missing}人が未取得)` : ''}`
    ));
  }

  /* ── 名前もサムネも揃った人 ─────────────────────────── */
  if (!ia || !n0(ia.identifiable)) {
    out.push(cell('identity-complete', '名前とサムネが揃った人', 'na', '—'));
  } else {
    const allPct = Number(ia.allPercent);
    const ok = Number.isFinite(allPct) ? allPct : 0;
    out.push(cell(
      'identity-complete', '名前とサムネが揃った人',
      ok >= 70 ? 'ok' : ok >= 40 ? 'warn' : 'bad',
      `${n0(ia.withAll)}/${n0(ia.identifiable)}人(${ok}%)`
    ));
  }

  /* ══ 操作音 ════════════════════════════════════════════
   * ★handlePressed(押した) vs handleFired(鳴った)の差＝
   *   「押したのに鳴らなかった」= ユーザーに直接見える症状。
   */
  const op = data?.opSoundEffectDiag ?? null;
  if (!op || typeof op !== 'object') {
    out.push(cell('op-sound', '操作音', 'na', '—'));
  } else {
    const pressed = n0(op.handlePressed);
    const fired = n0(op.handleFired);
    const noPath = n0(op.noPathCount);
    const enabled = op.soundEnabled !== false;
    if (!enabled) {
      // 設定でOFF=正常(掟2)
      out.push(cell('op-sound', '操作音', 'na', 'OFF'));
    } else if (pressed <= 0) {
      out.push(cell('op-sound', '操作音', 'na', '—'));
    } else {
      const silent = Math.max(0, pressed - fired);
      out.push(cell(
        'op-sound', '操作音',
        silent > 0 ? 'warn' : 'ok',
        silent > 0
          ? `${pressed}回中${silent}回 鳴りませんでした${noPath > 0 ? `(音源なし${noPath})` : ''}`
          : `${fired}回 鳴りました`
      ));
    }
  }

  /* ══ BGM ══════════════════════════════════════════════
   * ★盛り上がり(リーチ/フィーバー)の出入りが記録されているか。
   *   ★掟5: BGMを使っていなければ出さない。
   */
  const bgm = data?.bgmPhaseDiag ?? null;
  if (!bgm || typeof bgm !== 'object' || bgm.bgmEnabled !== true) {
    out.push(cell('bgm-phase', 'BGMの盛り上がり', 'na', '—'));
  } else {
    const phase = String(bgm.phase || 'normal');
    const reach = n0(bgm.reachCount);
    const jackpot = n0(bgm.jackpotCount);
    const phaseJa = phase === 'fever' ? 'フィーバー' : phase === 'reach' ? 'リーチ' : '通常';
    out.push(cell(
      'bgm-phase', 'BGMの盛り上がり',
      'ok', // ★状態の記録=異常ではない
      `いま${phaseJa}(リーチ${reach}回・大当たり${jackpot}回)`
    ));
  }

  /* ══ 記録の質 ══════════════════════════════════════════
   * ★NDGR(公式の配信経路)から取れたコメントが、実際に保存されたか。
   *   取れているのに保存されていないなら、保存側が詰まっている。
   */
  const ratio = data?.fastDiag?.content?.giftDiagnostics?.commentObservability?.ndgrChatToPersistRatio ?? null;
  if (!ratio || !n0(ratio.decodedChats)) {
    out.push(cell('ndgr-persist', '受信から保存まで', 'na', '—'));
  } else {
    const decoded = n0(ratio.decodedChats);
    const persisted = n0(ratio.ndgrPersistedRows);
    const pct = Number(ratio.ratioPercent);
    const shown = Number.isFinite(pct) ? Math.round(pct) : Math.round((persisted / decoded) * 100);
    out.push(cell(
      'ndgr-persist', '受信から保存まで',
      shown >= 90 ? 'ok' : shown >= 50 ? 'warn' : 'bad',
      `${persisted}/${decoded}件(${shown}%)が保存されました`
    ));
  }

  /* ── userId が付いた保存(あとから誰か分かるか) ───────────
   * ★掟2: 匿名コメントに userId は無い。**低いこと自体は異常ではない**。
   *   ただし「あとから人を辿れない」事実は隠さず出す(数字は正直に)。
   */
  const uidStats = data?.fastDiag?.content?.giftDiagnostics?.commentObservability?.savedCommentsUidStats ?? null;
  if (!uidStats || !n0(uidStats.totalSaved)) {
    out.push(cell('uid-detail', 'あとから人を辿れる記録', 'na', '—'));
  } else {
    const total = n0(uidStats.totalSaved);
    const withUid = n0(uidStats.withUid);
    const pct = Math.round((withUid / total) * 100);
    out.push(cell(
      'uid-detail', 'あとから人を辿れる記録',
      'ok', // ★匿名主体なら低くて当然=異常にしない(掟2)
      `${withUid}/${total}件(${pct}%)に利用者IDが付いています${pct < 50 ? ' ※匿名が多い配信では低くなります' : ''}`
    ));
  }

  /* ══ 多タブ ════════════════════════════════════════════
   * ★同じ配信を複数タブで開くと、古いタブのデータが混ざることがある。
   */
  const multi = data?.fastDiag?.content?.giftDiagnostics?.multiTabDiag ?? null;
  if (!multi || typeof multi !== 'object') {
    out.push(cell('multi-tab', '複数タブの混線', 'na', '—'));
  } else {
    const suspected = multi.staleDomBundleSuspected === true;
    const lvCount = n0(multi.eventDomLvCount);
    out.push(cell(
      'multi-tab', '複数タブの混線',
      suspected ? 'warn' : 'ok',
      suspected
        ? '別の配信のデータが混ざっている疑いがあります(不要なタブを閉じてください)'
        : lvCount > 1 ? `${lvCount}配信を開いています(混線なし)` : '混線なし'
    ));
  }

  return out;
}
