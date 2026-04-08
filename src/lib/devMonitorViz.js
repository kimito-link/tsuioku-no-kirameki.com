/**
 * 開発・テスト用監視パネル向けの純粋 HTML 断片（DOM 非依存）。
 * 将来ユーザー向け分析 UI に流用しやすいよう数値→割合の計算をここに集約する。
 */

import { escapeHtml } from './htmlEscape.js';

/**
 * @param {{ displayCount: number, officialCount: number|null }} p
 * @returns {{ fillPct: number, ratioLabel: string, tone: 'ok'|'warn'|'bad'|'neutral' }}
 */
export function officialVsRecordedBarState(p) {
  const d = Math.max(0, Math.floor(Number(p.displayCount) || 0));
  const o =
    p.officialCount != null &&
    Number.isFinite(p.officialCount) &&
    p.officialCount > 0
      ? Math.max(0, Math.floor(Number(p.officialCount)))
      : null;
  if (o == null) {
    return {
      fillPct: d > 0 ? 100 : 0,
      ratioLabel: d > 0 ? `記録 ${d} 件（公式件数なし）` : '記録 0',
      tone: 'neutral'
    };
  }
  const fill = Math.min(100, (d / o) * 100);
  const tone =
    fill >= 95 ? 'ok' : fill >= 80 ? 'warn' : d === 0 && o > 0 ? 'bad' : 'bad';
  return {
    fillPct: fill,
    ratioLabel: `${d} / ${o}（${fill.toFixed(1)}%）`,
    tone
  };
}

/**
 * @param {{
 *   numericUidWithHttpAvatar: number,
 *   numericUidWithoutHttpAvatar: number,
 *   anonStyleUidWithHttpAvatar: number,
 *   anonStyleUidWithoutHttpAvatar: number,
 *   numericWithNickname: number,
 *   numericWithoutNickname: number,
 *   anonWithNickname: number,
 *   anonWithoutNickname: number
 * }} gaps
 * @returns {{ label: string, pct: number, count: number, tone: string }[]}
 */
export function profileGapBarSeries(gaps) {
  const rows = [
    {
      label: '数字ID・アイコンあり',
      n: gaps.numericUidWithHttpAvatar,
      tone: 'g1'
    },
    {
      label: '数字ID・アイコンなし',
      n: gaps.numericUidWithoutHttpAvatar,
      tone: 'g2'
    },
    {
      label: '匿名風ID・アイコンあり',
      n: gaps.anonStyleUidWithHttpAvatar,
      tone: 'g3'
    },
    {
      label: '匿名風ID・アイコンなし',
      n: gaps.anonStyleUidWithoutHttpAvatar,
      tone: 'g4'
    },
    { label: '数字ID・名前あり', n: gaps.numericWithNickname, tone: 'g5' },
    { label: '数字ID・名前なし', n: gaps.numericWithoutNickname, tone: 'g6' },
    { label: '匿名風・名前あり', n: gaps.anonWithNickname, tone: 'g7' },
    { label: '匿名風・名前なし', n: gaps.anonWithoutNickname, tone: 'g8' }
  ];
  const maxN = Math.max(1, ...rows.map((r) => r.n));
  return rows.map((r) => ({
    label: r.label,
    count: r.n,
    pct: (r.n / maxN) * 100,
    tone: r.tone
  }));
}

/**
 * @param {Record<string, unknown>|null|undefined} sample
 * @returns {{ key: string, count: number, pct: number }[]}
 */
export function commentTypeDistribution(sample) {
  if (!sample || typeof sample !== 'object') return [];
  /** @type {Record<string, number>} */
  const m = {};
  for (const [k, v] of Object.entries(sample)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) m[k] = n;
  }
  const total = Object.values(m).reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  return Object.entries(m)
    .map(([key, count]) => ({
      key,
      count,
      pct: (count / total) * 100
    }))
    .sort((a, b) => b.count - a.count);
}

const WS_STALE_MS = 120_000;

/**
 * @param {number} wsAgeMs
 * @returns {{ freshnessPct: number, label: string, tone: 'ok'|'warn'|'bad' }}
 */
export function wsStalenessState(wsAgeMs) {
  if (!Number.isFinite(wsAgeMs) || wsAgeMs < 0) {
    return { freshnessPct: 0, label: '—', tone: 'bad' };
  }
  const freshnessPct = Math.max(0, Math.min(100, 100 - (wsAgeMs / WS_STALE_MS) * 100));
  const tone = freshnessPct >= 70 ? 'ok' : freshnessPct >= 35 ? 'warn' : 'bad';
  const label = `${Math.round(wsAgeMs)} ms`;
  return { freshnessPct, label, tone };
}

/** @param {ReturnType<typeof officialVsRecordedBarState>} st */
export function htmlOfficialVsRecordedBar(st) {
  const toneClass =
    st.tone === 'ok'
      ? 'nl-viz-bar__fill--ok'
      : st.tone === 'warn'
        ? 'nl-viz-bar__fill--warn'
        : st.tone === 'bad'
          ? 'nl-viz-bar__fill--bad'
          : 'nl-viz-bar__fill--neutral';
  return (
    '<section class="nl-viz-block" aria-label="記録件数と公式コメント数の比較">' +
    '<h4 class="nl-viz-block__title">記録件数と公式コメント数（棒グラフ）</h4>' +
    '<div class="nl-viz-bar nl-viz-bar--tall">' +
    `<div class="nl-viz-bar__track"><div class="nl-viz-bar__fill ${toneClass}" style="width:${Math.min(100, st.fillPct).toFixed(2)}%"></div></div>` +
    `<p class="nl-viz-block__caption">${escapeHtml(st.ratioLabel)}</p>` +
    '</div></section>'
  );
}

/**
 * @param {number|null|undefined} ratio 0..1 想定
 */
export function htmlCaptureRatioBar(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return '';
  const pct = Math.max(0, Math.min(100, ratio * 100));
  const toneClass =
    pct >= 70 ? 'nl-viz-bar__fill--ok' : pct >= 40 ? 'nl-viz-bar__fill--warn' : 'nl-viz-bar__fill--bad';
  return (
    '<section class="nl-viz-block" aria-label="キャプチャ率">' +
    '<h4 class="nl-viz-block__title">公式統計から見たコメントキャプチャ率（参考）</h4>' +
    '<div class="nl-viz-bar nl-viz-bar--tall">' +
    '<div class="nl-viz-bar__track">' +
    `<div class="nl-viz-bar__fill ${toneClass}" style="width:${pct.toFixed(2)}%"></div>` +
    '</div>' +
    `<p class="nl-viz-block__caption">${escapeHtml(`${pct.toFixed(1)}%`)}</p>` +
    '</div></section>'
  );
}

/**
 * @param {ReturnType<typeof profileGapBarSeries>} series
 */
export function htmlProfileGapBars(series) {
  if (!series.length) return '';
  const rows = series
    .map(
      (s) =>
        `<div class="nl-viz-mini-row"><span class="nl-viz-mini-row__label">${escapeHtml(s.label)}</span>` +
        '<div class="nl-viz-mini-row__track">' +
        `<div class="nl-viz-mini-row__fill nl-viz-mini-row__fill--${s.tone}" style="width:${Math.min(100, s.pct).toFixed(2)}%"></div>` +
        '</div>' +
        `<span class="nl-viz-mini-row__n">${escapeHtml(String(s.count))}</span></div>`
    )
    .join('');
  return (
    '<section class="nl-viz-block" aria-label="利用者の種類別・アイコンと名前の取りやすさ">' +
    '<h4 class="nl-viz-block__title">利用者の種類別・取れた情報（目安バー）</h4>' +
    `<div class="nl-viz-mini-rows">${rows}</div>` +
    '<p class="nl-viz-block__note">バーは「いちばん多い行」を100%とした目安です。数字同士をそのまま足したり比較したりはできません。</p>' +
    '</section>'
  );
}

/**
 * @param {string} key
 */
export function commentTypeKeyLabelJa(key) {
  const k = String(key || '').trim().toLowerCase();
  /** @type {Record<string, string>} */
  const map = {
    gift: 'ギフト',
    normal: '通常',
    operator: '運営',
    system: 'システム',
    command: 'コマンド',
    easy: 'イージー',
    premium: 'プレミアム',
    emotion: 'エモーション'
  };
  return map[k] || String(key || '').trim() || 'その他';
}

/**
 * @param {ReturnType<typeof commentTypeDistribution>} dist
 */
export function htmlCommentTypeBars(dist) {
  if (!dist.length) return '';
  const tones = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'];
  const rows = dist
    .map((d, i) => {
      const tone = tones[Math.min(i, tones.length - 1)];
      const ja = commentTypeKeyLabelJa(d.key);
      return (
        `<div class="nl-viz-mini-row"><span class="nl-viz-mini-row__label" title="内部キー: ${escapeHtml(d.key)}">${escapeHtml(ja)}</span>` +
        '<div class="nl-viz-mini-row__track">' +
        `<div class="nl-viz-mini-row__fill nl-viz-mini-row__fill--${tone}" style="width:${Math.min(100, d.pct).toFixed(2)}%"></div>` +
        '</div>' +
        `<span class="nl-viz-mini-row__n">${escapeHtml(String(d.count))}</span></div>`
      );
    })
    .join('');
  return (
    '<section class="nl-viz-block" aria-label="画面に載っているコメントの種類">' +
    '<h4 class="nl-viz-block__title">いま画面に出ているコメントの種類（割合）</h4>' +
    `<div class="nl-viz-mini-rows">${rows}</div>` +
    '</section>'
  );
}

/**
 * @param {ReturnType<typeof wsStalenessState>} st
 */
export function htmlWsStalenessBar(st) {
  if (st.label === '—') return '';
  const toneClass =
    st.tone === 'ok'
      ? 'nl-viz-bar__fill--ok'
      : st.tone === 'warn'
        ? 'nl-viz-bar__fill--warn'
        : 'nl-viz-bar__fill--bad';
  return (
    '<section class="nl-viz-block" aria-label="接続情報の新しさ">' +
    '<h4 class="nl-viz-block__title">配信ページとの接続の新しさ（参考）</h4>' +
    '<div class="nl-viz-bar nl-viz-bar--tall">' +
    '<div class="nl-viz-bar__track">' +
    `<div class="nl-viz-bar__fill ${toneClass}" style="width:${st.freshnessPct.toFixed(2)}%"></div>` +
    '</div>' +
    `<p class="nl-viz-block__caption">${escapeHtml(`最終更新からの経過 ${st.label}（長いほどバーが短くなります）`)}</p>` +
    '</div></section>'
  );
}

/**
 * @param {{
 *   thumbSeries: number[],
 *   idSeries: number[],
 *   nickSeries: number[],
 *   commentSeries: (number|null)[]
 * }} seriesArrays
 * @param {{ persisted?: boolean }} [opts]
 * @returns {string} SVG 4 連（スパークライン）
 */
export function htmlAcquisitionSparklines(seriesArrays, opts = {}) {
  const series = [
    { label: 'サムネ', color: '#0f8fd8', vals: seriesArrays.thumbSeries },
    { label: 'ID', color: '#6366f1', vals: seriesArrays.idSeries },
    { label: '名前', color: '#ea580c', vals: seriesArrays.nickSeries },
    { label: 'コメ', color: '#0d9488', vals: seriesArrays.commentSeries }
  ];
  const W = 200;
  const H = 36;
  const pad = 4;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;

  /**
   * null / NaN は欠測（コメ系列で公式件数が無いサンプル等）— 折れ線を切る。
   * @param {(number|null|undefined)[]} vals
   * @param {string} color
   */
  const lineOrDotSvg = (vals, color) => {
    if (!vals.length) return '';
    const n = vals.length;
    /** @param {number|null|undefined} v */
    const missing = (v) => v == null || (typeof v === 'number' && !Number.isFinite(v));
    /** @type {({ x: number, y: number }|null)[]} */
    const coords = vals.map((v, i) => {
      if (missing(v)) return null;
      const vn = /** @type {number} */ (v);
      const x =
        n === 1 ? pad + innerW / 2 : pad + (innerW * i) / Math.max(1, n - 1);
      const y = pad + innerH * (1 - Math.max(0, Math.min(100, vn)) / 100);
      return { x, y };
    });
    const present = coords.filter(Boolean);
    if (present.length === 0) return '';
    if (present.length === 1) {
      const c = /** @type {{ x: number, y: number }} */ (present[0]);
      return `<circle cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="2.2" fill="${color}"/>`;
    }
    let d = '';
    let pen = false;
    for (let i = 0; i < n; i++) {
      const c = coords[i];
      if (!c) {
        pen = false;
        continue;
      }
      d += pen
        ? ` L ${c.x.toFixed(2)},${c.y.toFixed(2)}`
        : `M ${c.x.toFixed(2)},${c.y.toFixed(2)}`;
      pen = true;
    }
    return d
      ? `<path fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`
      : '';
  };

  const blocks = series
    .map((s) => {
      const svgInner = lineOrDotSvg(s.vals, s.color);
      return (
        `<div class="nl-viz-spark"><span class="nl-viz-spark__cap">${escapeHtml(s.label)}</span>` +
        `<svg class="nl-viz-spark__svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">` +
        `<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="color-mix(in srgb, var(--nl-border) 70%, transparent)" stroke-width="0.6" rx="3"/>` +
        svgInner +
        '</svg></div>'
      );
    })
    .join('');

  const note = opts.persisted
    ? '4本とも「取れている割合」の推移です。このPCに少しずつ残ります（目安で最大約7日・250点）。コメは公式件数が無いサンプルでは欠測となり、折れ線が途切れることがあります。'
    : '4本とも「取れている割合」の推移です。ブラウザのタブを閉じるまでの履歴だけです。コメは公式件数が無いサンプルでは欠測となり、折れ線が途切れることがあります。';
  return (
    '<section class="nl-viz-block" aria-label="データ取得率の推移">' +
    '<h4 class="nl-viz-block__title">取得率の推移（小さな折れ線）</h4>' +
    `<p class="nl-viz-block__note">${escapeHtml(note)}</p>` +
    `<div class="nl-viz-spark-grid">${blocks}</div>` +
    '</section>'
  );
}

/**
 * 記録件数（表示・storage）の推移。値は系列内最大で 0–100% に正規化。
 * @param {number[]} displaySeries
 * @param {number[]} storageSeries
 */
export function htmlDualCountSparklines(displaySeries, storageSeries) {
  if (!displaySeries.length || displaySeries.length !== storageSeries.length) return '';
  const maxVal = Math.max(
    1,
    ...displaySeries,
    ...storageSeries
  );
  const dN = displaySeries.map((n) => (Math.max(0, n) / maxVal) * 100);
  const sN = storageSeries.map((n) => (Math.max(0, n) / maxVal) * 100);
  const W = 220;
  const H = 40;
  const pad = 4;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const n = dN.length;
  if (n < 1) return '';

  /**
   * @param {number[]} vals
   * @param {string} color
   */
  const pathFor = (vals, color) => {
    if (n === 1) {
      const v = vals[0];
      const x = pad + innerW / 2;
      const y = pad + innerH * (1 - Math.max(0, Math.min(100, v)) / 100);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.2" fill="${color}"/>`;
    }
    const pts = vals.map(
      /** @param {number} v @param {number} i */ (v, i) => {
      const x = pad + (innerW * i) / (n - 1);
      const y = pad + innerH * (1 - Math.max(0, Math.min(100, v)) / 100);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      }
    );
    return `<path fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" d="M ${pts.join(' L ')}"/>`;
  };

  const svg =
    `<svg class="nl-viz-count-spark__svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">` +
    `<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="color-mix(in srgb, var(--nl-border) 70%, transparent)" stroke-width="0.6" rx="3"/>` +
    pathFor(dN, '#0f8fd8') +
    pathFor(sN, '#0d9488') +
    '</svg>';

  return (
    '<section class="nl-viz-block" aria-label="記録件数の推移">' +
    '<h4 class="nl-viz-block__title">記録件数の推移（一覧＝青・保存＝緑）</h4>' +
    '<p class="nl-viz-block__note">ポップアップを開いて更新するたびに1点足します。高さはその時点での最大に合わせた目安です。</p>' +
    `<div class="nl-viz-count-spark">${svg}` +
    '<div class="nl-viz-count-spark__legend">' +
    '<span><span class="nl-viz-leg nl-viz-leg--disp" aria-hidden="true"></span>一覧の件数</span>' +
    '<span><span class="nl-viz-leg nl-viz-leg--stor" aria-hidden="true"></span>このPCに保存した件数</span>' +
    '</div></div>' +
    '</section>'
  );
}

/**
 * @param {{
 *   total: number,
 *   withHttpAvatar: number,
 *   withoutHttpAvatar: number,
 *   withNickname: number,
 *   withoutNickname: number,
 *   numericUserId: number,
 *   nonNumericUserId: number,
 *   missingUserId: number,
 *   withResolvedAvatar?: number
 * }} avs
 */
export function htmlStoredCommentStackCharts(avs) {
  const t = avs.total;
  if (t <= 0) return '';

  /**
   * @param {string} title
   * @param {{ label: string, count: number, pct: number, tone: string, hint: string }[]} segments
   */
  const segRow = (title, segments) => {
    const inner = segments
      .map((s) => {
        const w = Math.max(0, Math.min(100, s.pct));
        return `<div class="nl-viz-stack-seg nl-viz-stack-seg--${s.tone}" style="width:${w.toFixed(2)}%" title="${escapeHtml(s.hint)}"></div>`;
      })
      .join('');
    const cap = segments
      .map((s) => `${s.label} ${s.count}`)
      .join(' · ');
    return (
      `<div class="nl-viz-stack-block">` +
      `<p class="nl-viz-stack-block__title">${escapeHtml(title)}</p>` +
      `<div class="nl-viz-stack-track" role="img" aria-label="${escapeHtml(cap)}">${inner}</div>` +
      `<p class="nl-viz-stack-block__cap">${escapeHtml(cap)}</p>` +
      `</div>`
    );
  };

  const httpPct = (avs.withHttpAvatar / t) * 100;
  const missPct = (avs.withoutHttpAvatar / t) * 100;
  const nickYes = (avs.withNickname / t) * 100;
  const nickNo = (avs.withoutNickname / t) * 100;
  const numPct = (avs.numericUserId / t) * 100;
  const anonPct = (avs.nonNumericUserId / t) * 100;
  const missUid = (avs.missingUserId / t) * 100;

  const blocks = [
    segRow('アイコン画像のURL（記録したコメント）', [
      {
        label: 'あり',
        count: avs.withHttpAvatar,
        pct: httpPct,
        tone: 'http',
        hint: 'https のアイコンURLが取れている'
      },
      {
        label: 'なし',
        count: avs.withoutHttpAvatar,
        pct: missPct,
        tone: 'miss',
        hint: '未取得・URLなし'
      }
    ]),
    segRow('表示名（ニックネーム）', [
      { label: 'あり', count: avs.withNickname, pct: nickYes, tone: 'nickY', hint: '' },
      { label: 'なし', count: avs.withoutNickname, pct: nickNo, tone: 'nickN', hint: '' }
    ]),
    segRow('ユーザーIDの形（合計100%）', [
      { label: '数字のID', count: avs.numericUserId, pct: numPct, tone: 'uidN', hint: '' },
      { label: '匿名風・その他', count: avs.nonNumericUserId, pct: anonPct, tone: 'uidA', hint: '' },
      { label: '未取得', count: avs.missingUserId, pct: missUid, tone: 'uidM', hint: '' }
    ])
  ].join('');

  return (
    '<section class="nl-viz-block" aria-label="記録コメントの内訳グラフ">' +
    '<h4 class="nl-viz-block__title">下の表と同じ内訳（積み上げバー）</h4>' +
    `${blocks}` +
    '</section>'
  );
}

/**
 * @param {number} displayCount
 * @param {number} officialCount
 */
export function htmlRecordOfficialGapStack(displayCount, officialCount) {
  const o = Math.max(0, Math.floor(officialCount));
  const d = Math.max(0, Math.floor(displayCount));
  if (o <= 0) return '';
  const recPct = Math.min(100, (d / o) * 100);
  const gapPct = Math.max(0, 100 - recPct);
  const gap = o - d;
  return (
    '<section class="nl-viz-block" aria-label="公式に対する記録の割合">' +
    '<h4 class="nl-viz-block__title">公式コメント数に対する記録（積み上げ）</h4>' +
    '<div class="nl-viz-stack-track nl-viz-stack-track--tall" role="img" ' +
    `aria-label="記録 ${d} 件、差 ${gap} 件">` +
    `<div class="nl-viz-stack-seg nl-viz-stack-seg--rec" style="width:${recPct.toFixed(2)}%"></div>` +
    `<div class="nl-viz-stack-seg nl-viz-stack-seg--gap" style="width:${gapPct.toFixed(2)}%"></div>` +
    '</div>' +
    `<p class="nl-viz-stack-block__cap">${escapeHtml(`記録 ${d} / 公式 ${o}（未取り込み ${gap}）`)}</p>` +
    '</section>'
  );
}

/**
 * @param {number} interceptCount
 * @param {number} storageTotal
 */
export function htmlInterceptStorageBar(interceptCount, storageTotal) {
  const ic = Math.max(0, Math.floor(interceptCount));
  const st = Math.max(0, Math.floor(storageTotal));
  if (st <= 0 && ic <= 0) return '';
  const denom = Math.max(st, ic, 1);
  const pct = Math.min(100, (ic / denom) * 100);
  return (
    '<section class="nl-viz-block" aria-label="ページから拾った利用者メモと記録件数">' +
    '<h4 class="nl-viz-block__title">視聴ページで拾った利用者メモと、保存件数（目安）</h4>' +
    '<div class="nl-viz-bar nl-viz-bar--tall">' +
    '<div class="nl-viz-bar__track">' +
    `<div class="nl-viz-bar__fill nl-viz-bar__fill--neutral" style="width:${pct.toFixed(2)}%"></div>` +
    '</div>' +
    `<p class="nl-viz-block__caption">${escapeHtml(`ページ側メモ ${ic} 件・保存 ${st} 件のうち大きい方を基準にしたバー ${pct.toFixed(1)}%`)}</p>` +
    '</div></section>'
  );
}

/**
 * @param {{
 *   liveId: string,
 *   displayCount: number,
 *   storageCount: number,
 *   snapshot: Record<string, unknown>|null,
 *   avatarStats: null|{
 *     total: number,
 *     withHttpAvatar: number,
 *     withoutHttpAvatar: number,
 *     withNickname: number,
 *     withoutNickname: number,
 *     numericUserId: number,
 *     nonNumericUserId: number,
 *     missingUserId: number,
 *     withResolvedAvatar?: number
 *   }
 * }} p
 */
export function buildDevMonitorDlChartsHtml(p) {
  const lid = String(p.liveId || '').trim();
  if (!lid) return '';

  /** @type {string[]} */
  const parts = [];
  if (p.avatarStats && p.avatarStats.total > 0) {
    parts.push(htmlStoredCommentStackCharts(p.avatarStats));
  }

  const snap =
    p.snapshot && typeof p.snapshot === 'object'
      ? /** @type {Record<string, unknown>} */ (p.snapshot)
      : null;
  const ocRaw = snap?.officialCommentCount;
  const oc =
    typeof ocRaw === 'number' && Number.isFinite(ocRaw) ? ocRaw : null;
  if (oc != null && oc > 0) {
    parts.push(htmlRecordOfficialGapStack(p.displayCount, oc));
  }

  const dbgRaw = snap?._debug;
  const dbg =
    dbgRaw && typeof dbgRaw === 'object'
      ? /** @type {Record<string, unknown>} */ (dbgRaw)
      : null;
  const intercept =
    dbg && dbg.intercept != null ? Number(dbg.intercept) : NaN;
  if (Number.isFinite(intercept) && p.storageCount >= 0) {
    parts.push(htmlInterceptStorageBar(intercept, p.storageCount));
  }

  return `<div class="nl-dev-monitor-dl-charts">${parts.join('')}</div>`;
}
