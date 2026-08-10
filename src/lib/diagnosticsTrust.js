// @ts-nocheck — 任意の診断スナップショットを歩く動的判定
/**
 * 「この診断の信頼性」メタ診断（council/diagnostics-completeness-root-SYNTHESIS.md 第1段）。
 *
 * 狙い（根本治療）= 状態速報を見た瞬間「どこが信頼でき・どこが空/古いか」が冒頭で分かるようにする。
 *   これまで started:0 や「鏡なし」を見ても、それが【本当に異常】なのか【診断が古い/空なだけ】なのか
 *   区別できず、私(Claude)がスクショや画面名を聞き返す→ユーザー「診断で全部わかる前提がまた壊れてる」
 *   という同じループを繰り返していた。
 *   → メタ診断が「watch タブ有無/popup 診断の鮮度/各経路の最終更新・liveId 一致」を冒頭に出せば、
 *     たとえ個々の診断を取りこぼしても【取りこぼしている事実】が必ず出る=ループが構造的に止まる。
 *
 * 確定した2つの根(実コード棚卸し):
 *   - 根1「1回だけ集約」= popup 固有診断は popup を開いた idle 時に1回だけ storage 書き込み・再集約しない
 *     → persistedAt の経過で「古い」を可視化する(再集約は地雷なので触らない)。
 *   - 根2「ページまたぎ非対称」= globalThis はページごと別物 → storage 由来かを明示する。
 *
 * ★制約: 新規 storage read を増やさない(status が既に手元に持つ persistedAt/capturedAt/liveId だけ)。純関数。
 *
 * @module diagnosticsTrust
 */

/*
 * ★v0.1.1304: 時刻と保留の判定は src/lib/timeAuthority.js が唯一の正本。
 *   ここに独自の定義を置かない(それが7版事件の構造的原因だった)。
 *   同じ値・同じ判定が複数箇所にあると、片方だけ直しても症状が残る。
 */
import {
  agoLabel,
  classifyReading,
  durationMsOf,
  toEpochMs,
  VALUE_FRESH_MS,
  WRITER_BOOT_GRACE_MS
} from './timeAuthority.js';

/** popup 診断が「新鮮」とみなす上限(3分)。★正本は timeAuthority.VALUE_FRESH_MS。 */
export const POPUP_DIAG_FRESH_MS = VALUE_FRESH_MS;

/**
 * popup 起動から「まだ構造的にゼロで正常」とみなす猶予。
 * ★正本は timeAuthority.WRITER_BOOT_GRACE_MS。ここは互換のための re-export。
 *   v0.1.1302 では独自定義(3000)を置き、popupDiagUptimeNote.js:29 のリテラルと
 *   【同じ値が2箇所にある】状態を作っていた(「2箇所で違う定義を作らない」と
 *   コメントに書きながら)。v0.1.1304 で正本へ一本化。
 */
export const POPUP_BOOT_GRACE_MS = WRITER_BOOT_GRACE_MS;

function lc(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

/**
 * 状態速報の信頼性を組む。判定は「鮮度・有無・liveId 一致」という機械的事実だけ(誤検知ゼロ)。
 *
 * @param {object} args
 * @param {boolean} args.hasWatchTab          視聴中の配信(livesData の recording)があるか
 * @param {string}  args.currentLiveId        いま対象の lv(鏡 liveId 優先)
 * @param {object|null} args.popupDiag        loadPopupDiagSafe の戻り(persistedAt/popup を持つ)
 * @param {object|null} args.jsonBlob         純Webへ送る当のデータ(各鏡 capturedAt/liveId)
 * @param {{ everSent?: boolean, ageSec?: number|null, liveId?: string }} [args.publishOutcome] 送信結果要約
 * @param {number} args.nowMs
 * @returns {object} 信頼性サマリ
 */
export function buildDiagnosticsTrust(args) {
  const a = args && typeof args === 'object' ? args : {};
  const nowMs = Number(a.nowMs) || 0;
  const currentLid = lc(a.currentLiveId);
  const blob = a.jsonBlob && typeof a.jsonBlob === 'object' ? a.jsonBlob : {};

  // --- watch タブ(popup 由来診断の前提) ---
  const hasWatchTab = a.hasWatchTab === true;

  // --- popupDiag(根1: 1回だけ集約=古くなりうる) ---
  const pd = a.popupDiag && typeof a.popupDiag === 'object' ? a.popupDiag : null;
  const popupAt = pd ? toEpochMs(pd.persistedAt) : 0;
  const popupAgeMs = popupAt > 0 && nowMs > 0 ? Math.max(0, nowMs - popupAt) : null;
  const popupFresh = popupAgeMs != null && popupAgeMs <= POPUP_DIAG_FRESH_MS;
  // popupDiag の対象配信(watchSnapshotMeta.liveId)が現配信と一致するか。
  const popupLid = lc(pd?.popup?.watchSnapshotMeta?.liveId);
  const popupLidMatch = currentLid && popupLid ? popupLid === currentLid : null;

  // --- 各鏡(jsonBlob 由来・status が手元に持つ) ---
  /*
   * ★v0.1.1304: 鮮度判定は timeAuthority.classifyReading が正本。
   *   ★戻り値の【形】は凍結する(present/ageMs/fresh/lidMatch)。
   *     formatDiagnosticsTrustLines・parityVerdict・aiShareFullText が依存しており、
   *     1フィールド変えるだけで連鎖で壊れる。移設は「判定の場所」だけを動かす。
   */
  const mirrorOf = (m) => {
    const mm = m && typeof m === 'object' ? m : null;
    if (!mm) return { present: false };
    const lid = lc(mm.liveId);
    const r = classifyReading({ present: true, capturedAt: mm.capturedAt, nowMs });
    return {
      present: true,
      ageMs: r.ageMs,
      fresh: r.fresh,
      lidMatch: currentLid && lid ? lid === currentLid : null
    };
  };
  /*
   * ★v0.1.1302: 起動直後の「鏡なし」を🔴にしない(誤読の構造的根治)。
   *
   * ■ 何が起きていたか(2026-08-09・開発者が3回誤読した)
   *   起動 3.3秒 で撮った速報が「応援レーン鏡🔴なし ×3」を出し、
   *   これを「publish の取りこぼし」と読んで書き手側を3回追いかけ、全部空振りした。
   *   実際は publish は正常(初回 flush は min-gap を待たず 400ms で載る)。
   *   🔴 の出どころは読み取り側で、補助データは 12秒キャッシュ越しにしか読まれず
   *   初期値が null=起動直後は構造的に「鏡なし」に見える。
   *
   * ■ 対策の正本は既にある
   *   popupDiagUptimeNote.js が「鏡の flush は publish の 400ms 後」「起動直後を
   *   ゼロと読むな」と警告しているが、その注記は popup 固有診断セクションにしか
   *   出ておらず、🔴 が実際に出るこの冒頭ブロックには届いていなかった。
   *   → 同じ閾値(3秒)・同じ null ガードをここにも効かせる。
   *
   * ★null ガードは必須: Number(null)===0 なので、これが無いと
   *   「値が取れなかった」を「起動0秒」と偽って全部⏳にしてしまう。
   */
  /*
   * ★v0.1.1302: 補助データ(鏡を含む)の齢。status-entry.js の extras は
   *   12秒キャッシュ越しにしか読まれない(EXTRAS_REFETCH_MS=12000)ので、
   *   鏡の値は最大12秒古い。これが速報に出ていなかったため、読み手は
   *   「今この瞬間 鏡が無い」と誤解できた。数字を出すだけ(判定は変えない)。
   */
  // ★v0.1.1304: 経過時間のガードは timeAuthority.durationMsOf が正本(null/空文字を 0 と誤読しない)。
  const extrasAgeMs = durationMsOf(a.extrasAgeMs);
  /*
   * ★shadeAgeMs は performance.now() 基準の【経過時間】であり、capturedAt(epoch の時点)とは
   *   別の量・別の時計。混ぜると「更新56年前」型の事故になる
   *   ([[venue-seats-lastupdate-clock-mismatch-v1044]])。だから別変数のまま扱う。
   */
  const bootAgeMs = durationMsOf(pd?.popup?.loadShadeProbe?.shadeAgeMs);
  /*
   * ★v0.1.1303(v0.1.1302 の設計ミスを是正・実機で効かなかった):
   *
   * ■ 何を間違えたか
   *   v0.1.1302 は「popup 起動から3秒未満か」だけで保留を決めた。
   *   ところが実機は【popup起動4.3秒・鏡は8秒前の値】で🔴のまま。
   *   時系列に直すと:
   *     status が鏡を読んだ = popup 起動の【3.7秒前】
   *   = まだ存在しないものを読んだので null なのは当然。
   *   しかし猶予は popup 起動基準なので一切効かなかった。
   *
   * ■ 正しい問い
   *   「popup が若いか」ではなく
   *   【その鏡の値を読んだ時点で、popup は書ける状態だったか】。
   *   読んだ時刻 = now - extrasAgeMs / popup 起動時刻 = now - bootAgeMs。
   *   読んだ時刻が popup 起動より前(または直後 GRACE 未満)なら、
   *   鏡が無いのは【計器の順序の問題】であって不具合ではない。
   *
   * ★extrasAgeMs が取れない場合は従来どおり popup 起動基準にフォールバックする
   *   (status 以外の呼び手=テスト等で extras の概念が無いことがある)。
   */
  /*
   * ★v0.1.1304: 「読んだ時点で書き手は書ける状態だったか」の判定は
   *   timeAuthority.classifyReading が【唯一の正本】。ここで独自に計算しない。
   *   popupDiagUptimeNote も同じ正本の定数を使うので、3判定者の基準が構造的に一致する。
   */
  const absentProbe = classifyReading({
    present: false,
    readAgoMs: extrasAgeMs,
    writerBootAgoMs: bootAgeMs,
    nowMs
  });
  const justBooted = absentProbe.state === 'pending';
  const readAtRelativeToBootMs = absentProbe.readAtRelativeToBootMs;
  /** 「読んだ時点では書けていなかった」なら present:false を保留(pending)に倒す。 */
  const mirrorOfWithGrace = (m) => {
    const r = mirrorOf(m);
    if (!r.present && justBooted) {
      return { ...r, pending: true, bootAgeMs, readAtRelativeToBootMs };
    }
    return r;
  };
  const mirrors = {
    lane: mirrorOfWithGrace(blob.laneMirror),
    stat: mirrorOfWithGrace(blob.statCardsMirror),
    northStar: mirrorOfWithGrace(blob.northStarMirror)
  };

  // --- 送信結果(根2: storage 由来=ページ横断で読める) ---
  const po = a.publishOutcome && typeof a.publishOutcome === 'object' ? a.publishOutcome : null;
  const publish = po
    ? { everSent: po.everSent === true, ageSec: po.ageSec ?? null, liveId: lc(po.liveId) }
    : { everSent: false, ageSec: null, liveId: '' };

  // --- 総合 verdict(機械的) ---
  // 信頼の核= popup 由来診断(描画プローブ/鏡)が新鮮かつ現配信か。
  const popupTrustable = pd ? popupFresh && popupLidMatch !== false : false;
  let verdict = 'unknown';
  if (!hasWatchTab) {
    verdict = 'no_watch_tab'; // 視聴中タブが無い=popup 由来は空/古くて当然
  } else if (!pd) {
    verdict = 'popup_not_opened'; // watch はあるが popup 診断が未集約
  } else if (popupLidMatch === false) {
    verdict = 'popup_other_live'; // 別配信の古い popup 診断が混入
  } else if (!popupFresh) {
    verdict = 'popup_stale'; // popup 診断が古い(開き直しで新鮮化)
  } else if (justBooted && (mirrors.lane.pending || mirrors.stat.pending || mirrors.northStar.pending)) {
    // ★v0.1.1302: 起動直後で鏡が未着なら「全部信頼できる」と断言しない。
    //   ここで trustable を出していたため、🔴 と「🟢そのまま信頼できる」が同居し、
    //   読み手(開発者)が🔴を本物だと信じて3回空振りした。
    verdict = 'popup_just_booted';
  } else {
    verdict = 'trustable'; // popup 由来も新鮮・現配信=全て信頼可
  }

  return {
    hasWatchTab,
    currentLiveId: currentLid,
    // ★v0.1.1302: 鏡を含む補助データの齢(最大12秒古い)。表示専用・判定には使わない。
    extrasAgeMs,
    popup: {
      present: !!pd,
      ageMs: popupAgeMs,
      fresh: popupFresh,
      lidMatch: popupLidMatch,
      // v0.1.984: popup が動かしていた拡張バージョン/ビルド(新コード未ロード判定用)。
      extVersion: pd?.popup?.extensionVersion ? String(pd.popup.extensionVersion) : '',
      buildId: pd?.popup?.buildId ? String(pd.popup.buildId) : '',
      // v0.1.988: 診断の出自(passive/embed_watch/toolbar/popup)。パリティ判定が passive 由来の
      //   heavy probe=0 を「①POP未描画」と誤診しないために使う。
      viewKind: pd?.popup?.viewKind ? String(pd.popup.viewKind) : ''
    },
    mirrors,
    publish,
    popupTrustable,
    verdict
  };
}

/** verdict → 1行サマリの日本語。 */
function verdictLine(t) {
  switch (t.verdict) {
    case 'no_watch_tab':
      return '🟡 視聴中の配信が無いため、popup 由来の診断（応援レーン描画/北極星/鏡）は空・古くて当然です。';
    case 'popup_not_opened':
      return '🟡 視聴中ですが popup 診断が未取得です。watch タブで拡張ポップアップを一度開くと埋まります。';
    case 'popup_other_live':
      return '🔴 別配信の古い popup 診断が混ざっています。watch タブを F5 して popup を開き直してください。';
    case 'popup_stale':
      return '🟡 popup 診断が古いです（下の「応援レーン描画/北極星」は現状と違う可能性）。popup を開き直すと新鮮化します。';
    case 'popup_just_booted':
      // ★v0.1.1302: 起動直後は鏡が未着で当然。ここで🟢を出すと、同居する⏳/🔴を
      //   読み手が本物の不具合だと信じてしまう(実際に3回空振りした)。
      return (
        '🟡 popup を開いた直後の値です。鏡がまだ書かれていないだけで異常ではありません' +
        '（鏡の書き出しは publish の 400ms 後・状態速報の補助データは最大12秒キャッシュ）。' +
        'popup を開いたまま数十秒おいて取り直すと確定します。'
      );
    case 'trustable':
      return '🟢 watch タブ有・popup 診断も新鮮で現配信＝この状態速報の各診断はそのまま信頼できます。';
    default:
      return '';
  }
}

/** 経路1行(present/鮮度/liveId)。 */
function pathLine(label, m) {
  // ★v0.1.1302: 起動直後の未着は🔴ではなく⏳(まだ書かれていないだけ=正常)。
  //   ここを🔴にしていたため、開発者が3回「取りこぼし」と誤読して空振りした。
  if (m && m.pending) {
    /*
     * ★v0.1.1303: 「なぜ保留なのか」を時系列で書く。
     *   実機では status が鏡を読んだのが popup 起動の【3.7秒前】だった
     *   = まだ存在しないものを読んだので null。これは不具合ではない。
     */
    const rel = m.readAtRelativeToBootMs;
    if (rel != null && rel < 0) {
      const before = (Math.abs(rel) / 1000).toFixed(1);
      return `- ${label}: ⏳ 判定保留(この値を読んだのは popup 起動の${before}秒【前】=まだ書かれていない・数十秒おいて取り直し)`;
    }
    const sec = m.bootAgeMs != null ? (m.bootAgeMs / 1000).toFixed(1) : '?';
    return `- ${label}: ⏳ 判定保留(popup起動${sec}秒=まだ書かれていないだけ・数十秒おいて取り直し)`;
  }
  if (!m || !m.present) return `- ${label}: 🔴 なし`;
  const fresh = m.fresh === false ? `🟡${agoLabel(m.ageMs)}(古い)` : m.ageMs != null ? agoLabel(m.ageMs) : '';
  const lid = m.lidMatch === false ? ' 🔴別配信' : m.lidMatch === true ? ' ✅' : '';
  return `- ${label}: ✅あり ${fresh}${lid}`.trimEnd();
}

/**
 * 状態速報の【冒頭】に置くテキスト行配列。「この診断はどこまで信頼できるか」を最初に示す。
 * @param {object} trust buildDiagnosticsTrust の戻り
 * @returns {string[]}
 */
export function formatDiagnosticsTrustLines(trust) {
  const t = trust && typeof trust === 'object' ? trust : null;
  if (!t) return [];
  const lines = [];
  lines.push('### この診断の信頼性（最初に読んでください）');
  const vl = verdictLine(t);
  if (vl) lines.push(vl);
  // 各経路の最終更新・liveId 一致を1行ずつ(「出てない/古い」が一目で分かる)。
  lines.push(`- watch タブ（視聴中）: ${t.hasWatchTab ? '✅あり' : '🔴なし（popup 由来は空/古くて当然）'}`);
  if (t.popup.present) {
    const fresh = t.popup.fresh === false ? `🟡${agoLabel(t.popup.ageMs)}(古い)` : agoLabel(t.popup.ageMs);
    const lid = t.popup.lidMatch === false ? ' 🔴別配信' : t.popup.lidMatch === true ? ' ✅現配信' : '';
    // v0.1.984: popup が動かしていた版を併記=新コード未ロード(古い版)を一目で判別できる。
    const ver = t.popup.extVersion ? ` 〔v${t.popup.extVersion}〕` : '';
    lines.push(`- popup 固有診断（応援レーン描画/北極星/avatar）: ✅あり ${fresh}${lid}${ver}`.trimEnd());
  } else {
    lines.push('- popup 固有診断（応援レーン描画/北極星/avatar）: 🔴 未取得（watch タブで popup を開くと埋まる）');
  }
  lines.push(pathLine('応援レーン鏡', t.mirrors.lane));
  lines.push(pathLine('数字カード鏡', t.mirrors.stat));
  lines.push(pathLine('北極星鏡', t.mirrors.northStar));
  /*
   * ★v0.1.1302: 上の3行が読んだ値の【齢】。status の補助データは12秒キャッシュ越し
   *   (status-entry.js:312 EXTRAS_REFETCH_MS=12000)なので、鏡は最大12秒古い。
   *   これが出ていなかったため「今この瞬間 鏡が無い」と読めてしまい、
   *   開発者が3回「取りこぼし」と誤読して空振りした。数字を出すだけ(判定は変えない)。
   */
  if (t.extrasAgeMs != null) {
    lines.push(`  （上の3つの鏡は補助データ経由＝${agoLabel(t.extrasAgeMs)}の値。最大12秒古くなります）`);
  }
  // 送信結果(ページ横断 storage)。
  if (t.publish.everSent) {
    const age = t.publish.ageSec != null ? agoLabel(t.publish.ageSec * 1000) : '';
    lines.push(`- 純Web公開送信: ✅送信済み ${age}`.trimEnd());
  } else {
    lines.push('- 純Web公開送信: 🟡 まだ送信していない（純Webは古い/空）');
  }
  return lines;
}
