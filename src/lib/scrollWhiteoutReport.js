// @ts-nocheck — fastDiag(任意形)を歩いて整形する
/**
 * スクロール白化(下にスクロールすると重く・一瞬白くなって・遅れて描画される)を状態速報の
 *   【読める所】に出す整形 lib。
 *
 * 背景 = ユーザーが何度も報告している症状「スクロールすると重い→白くなって、時間がかかって映る」。
 *   観測値は content-entry.js が scrollWhiteoutProbe で集めて fastDiag.content.scrollWhiteoutDiag に
 *   入れている(whiteoutCount=可視→消失を検知した回数 / lastWhiteoutAgoMs=最後にいつ / samples=どの要素)。
 *   だが状態速報の【読める本文】には1行も出ておらず、生の fastDiag JSON に埋もれていた=ユーザーから見ると
 *   「診断に入っていない」。ここで読める1行+症状カードに昇格する(新規 read なし=既にある値を貼るだけ)。
 *
 * ★制約(role-separation-design §6): 新規 storage read を増やさない。fastDiag に既にある値だけを読む純関数。
 *
 * 観測値の形(scrollWhiteoutProbe.summarizeWhiteoutDiag):
 *   { whiteoutCount:number, lastWhiteoutAgoMs:number|null, samples:[{kind,prevH,nowH,visibleNow,atMs}] }
 *
 * @module scrollWhiteoutReport
 */

/** fastDiag から scrollWhiteoutDiag を取り出す(content 配下 or 直下の両方に耐える)。無ければ null。 */
export function pickScrollWhiteoutDiag(fastDiag) {
  const fromContent = fastDiag?.content?.scrollWhiteoutDiag;
  if (fromContent && typeof fromContent === 'object') return fromContent;
  const fromTop = fastDiag?.scrollWhiteoutDiag;
  if (fromTop && typeof fromTop === 'object') return fromTop;
  return null;
}

/** 「最後にN秒前」を出す(取れなければ '')。 */
function agoText(lastWhiteoutAgoMs) {
  const ms = Number(lastWhiteoutAgoMs);
  if (!Number.isFinite(ms) || ms < 0) return '';
  return `最後 約${Math.round(ms / 1000)}秒前`;
}

/**
 * 状態速報用の白化診断行を組み立てる。
 *   - diag 無し → 空配列(出さない=このセクション自体を作らない)。
 *   - count===0 → 「観測されていません」を出す(=スクロール白化は今のところ起きていない の事実)。
 *   - count>0 → 回数+最後にいつ+どの要素(samples の kind 内訳)を出す。
 * @param {object|null} fastDiag
 * @returns {string[]}
 */
export function formatScrollWhiteoutReportLines(fastDiag) {
  const diag = pickScrollWhiteoutDiag(fastDiag);
  if (!diag) return [];
  const lines = [];
  lines.push('### スクロール白化(重い・一瞬白くなる)');
  const count = Number(diag.whiteoutCount) || 0;
  if (count <= 0) {
    lines.push('  ✅ いまのところスクロール白化は観測されていません(count=0)。');
    return lines;
  }
  const ago = agoText(diag.lastWhiteoutAgoMs);
  // samples の kind 内訳(video=プレイヤー / host=応援パネルの土台)。何がどれだけ消えたか。
  const samples = Array.isArray(diag.samples) ? diag.samples : [];
  const byKind = {};
  for (const s of samples) {
    const k = String((s && s.kind) || '?').slice(0, 16);
    byKind[k] = (byKind[k] || 0) + 1;
  }
  const kindStr = Object.keys(byKind).length
    ? Object.entries(byKind).map(([k, n]) => `${k}×${n}`).join(' / ')
    : '(要素不明)';
  lines.push(`  🟡 スクロール白化を ${count} 回観測${ago ? ` (${ago})` : ''}。直近サンプル: ${kindStr}`);
  lines.push('     ＝下にスクロールすると応援パネルやプレイヤーが一瞬消え(白くなり)、遅れて再描画されています。');
  return lines;
}

/**
 * 白化を「症状→原因→次の一手」カードに昇格する(count>0 のときだけ)。
 *   buildStatusActions が返す配列に push される形に合わせる(severity/symptom/cause/action/fixableHere)。
 * @param {object|null} fastDiag
 * @returns {Array<{severity:string,symptom:string,cause:string,action:string,fixableHere:string}>}
 */
export function scrollWhiteoutToActionCards(fastDiag) {
  const diag = pickScrollWhiteoutDiag(fastDiag);
  const count = Number(diag?.whiteoutCount) || 0;
  if (!diag || count <= 0) return [];
  const ago = agoText(diag.lastWhiteoutAgoMs);
  return [
    {
      severity: 'warn',
      symptom: `スクロールすると重く、応援パネルが一瞬白くなって遅れて描画される(白化 ${count} 回${ago ? `・${ago}` : ''})`,
      cause:
        'スクロール時に inline panel の土台(host)やプレイヤーが reflow で一旦消えて作り直される瞬間、白い下地が見えています(scrollWhiteoutProbe が可視→消失を検知)。',
      action:
        'この状態速報ごと開発者(Claude)に共有してください。samples の要素(video=プレイヤー / host=応援パネル土台)から、どこの再描画が重いかを実コードで特定して、消さずに描き替える/再描画を間引く方向で直します。',
      fixableHere: 'no'
    }
  ];
}
