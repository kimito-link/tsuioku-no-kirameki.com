/**
 * 放送終了後の HTML レポート / マーケ分析の頭にくる「ゆっくり解説風」要約セクション。
 * 数字を読まされる退屈さを、りんく・こん太・たぬ姉の 3 人会話で吸収する。
 *
 * 設計方針（Hoshino-Method 寄せ）:
 *   - 数字（金・PV）に直結する具体値を優先（「すごい」より「5,000 貢」を見せる）
 *   - 1 行短く、5〜8 行で完結（読まれる長さ）
 *   - 締めは次回への動線（「また放送してね」）
 *   - キャラ表情はライン毎に変えて視覚刺激を切らさない
 *
 * 純関数化してテスト可能にする：scrape 結果と最終値だけ渡せば dialog が決まる。
 */

/**
 * @typedef {'rinku'|'konta'|'tanunee'} YukkuriCharacter
 * @typedef {'smile'|'blink'|'half-eyes'|'normal'} YukkuriExpression
 * @typedef {{ character: YukkuriCharacter, expression: YukkuriExpression, mouthOpen: boolean, line: string }} YukkuriLine
 */

const CHAR_LABELS = /** @type {const} */ ({
  rinku: 'りんく',
  konta: 'こん太',
  tanunee: 'たぬ姉'
});

const CHAR_BASE = /** @type {const} */ ({
  rinku: 'images/yukkuri-charactore-english/link/link-yukkuri',
  konta: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri',
  tanunee: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri'
});

/**
 * キャラ＋表情＋口の状態 から画像パスを返す。
 * konta だけ "normal" 単独ファイル (kitsune-yukkuri-normal.png) を持つので分岐。
 *
 * @param {YukkuriCharacter} character
 * @param {YukkuriExpression} expression
 * @param {boolean} mouthOpen
 */
export function yukkuriCharacterImagePath(character, expression, mouthOpen) {
  const base = CHAR_BASE[character];
  if (character === 'konta' && expression === 'normal') {
    return `${base}-normal.png`;
  }
  return `${base}-${expression}-mouth-${mouthOpen ? 'open' : 'closed'}.png`;
}

/** @param {unknown} v */
function fmtNum(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return v.toLocaleString('ja-JP');
}

/** @param {string} s */
function trimToTitle(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  if (t.length <= 60) return t;
  return `${t.slice(0, 58)}…`;
}

/**
 * @param {{
 *   bundle: import('./officialEventDomBundle.js').OfficialEventDomBundle | null,
 *   broadcastTitle?: string,
 *   broadcasterName?: string,
 *   recordedCommentCount?: number,
 *   streamAgeMin?: number
 * }} input
 * @returns {YukkuriLine[]}
 */
export function buildYukkuriBroadcastSummary(input) {
  const bundle = input?.bundle || null;
  const ws = bundle?.programStats || null;
  const ev = bundle?.eventBanner || null;
  const bal = bundle?.eventBalloon || null;
  const rank = Array.isArray(bundle?.contributionRanking)
    ? bundle.contributionRanking
    : [];
  const titleRaw = trimToTitle(input?.broadcastTitle || '');
  const broadcaster = String(input?.broadcasterName || '').trim();
  const recorded =
    typeof input?.recordedCommentCount === 'number' && Number.isFinite(input.recordedCommentCount)
      ? Math.max(0, Math.floor(input.recordedCommentCount))
      : null;
  const streamAgeMin =
    typeof input?.streamAgeMin === 'number' && Number.isFinite(input.streamAgeMin)
      ? Math.max(0, Math.floor(input.streamAgeMin))
      : null;

  /** @type {YukkuriLine[]} */
  const out = [];

  // 1. 開幕：りんく が番組と最終数字を握って読み上げる
  if (titleRaw) {
    out.push({
      character: 'rinku',
      expression: 'smile',
      mouthOpen: true,
      line: `今回の「${titleRaw}」${broadcaster ? `（${broadcaster}さん）` : ''}、お疲れさまでしたー！`
    });
  } else {
    out.push({
      character: 'rinku',
      expression: 'smile',
      mouthOpen: true,
      line: `今回の番組、お疲れさまでしたー！`
    });
  }

  // 2. ws 5値：たぬ姉 が落ち着いて数字を出す
  if (ws) {
    const segs = [];
    if (ws.watchCount != null) segs.push(`来場 ${fmtNum(ws.watchCount)} 人`);
    if (ws.commentCount != null) segs.push(`コメ ${fmtNum(ws.commentCount)} 件`);
    if (streamAgeMin != null) {
      const h = Math.floor(streamAgeMin / 60);
      const m = streamAgeMin % 60;
      const t = h > 0 ? `${h}時間${m}分` : `${m}分`;
      segs.push(`配信 ${t}`);
    }
    if (segs.length) {
      out.push({
        character: 'tanunee',
        expression: 'smile',
        mouthOpen: true,
        line: `${segs.join(' / ')} で着地タヌ`
      });
    }
  }

  // 3. 捕捉率：こん太 が冷静に集計を読む（語尾「コン」は使わない普通の口調）
  if (recorded != null && ws && ws.commentCount && ws.commentCount > 0) {
    const ratio = Math.round((recorded / ws.commentCount) * 100);
    out.push({
      character: 'konta',
      expression: ratio >= 30 ? 'smile' : 'half-eyes',
      mouthOpen: true,
      line:
        ratio >= 30
          ? `こちらの記録は ${fmtNum(recorded)} 件、捕捉率 ${ratio}% でした。よく拾えてますね`
          : `こちらの記録は ${fmtNum(recorded)} 件、捕捉率 ${ratio}% です。次はもう少し拾えるとよさそうですね`
    });
  } else if (recorded != null) {
    out.push({
      character: 'konta',
      expression: 'normal',
      mouthOpen: true,
      line: `こちらの記録は ${fmtNum(recorded)} 件 です`
    });
  }

  // 4. イベント参加：たぬ姉 が誇らしげに
  if (ev) {
    const evTitle = trimToTitle(ev.title);
    const segs = [];
    if (ev.rank != null) segs.push(`現在 ${ev.rank} 位`);
    const score = bal?.eventTotalScore != null ? bal.eventTotalScore : ev.score;
    if (score != null) segs.push(`累計 ${fmtNum(score)}`);
    if (segs.length && evTitle) {
      out.push({
        character: 'tanunee',
        expression: 'blink',
        mouthOpen: true,
        line: `イベント「${evTitle}」では ${segs.join(' / ')} まで来てるタヌよ`
      });
    }
  }

  // 5-7. 上位応援者：3 キャラで回しながら名前を読む（匿名は飛ばす）
  const namedTop = rank.filter((r) => r && !r.isAnonymous && r.name).slice(0, 3);
  const charRotation = /** @type {YukkuriCharacter[]} */ (['rinku', 'konta', 'tanunee']);
  const cheers = [
    'ぶっちぎりのトップ！すごいー！',
    'いつもありがとうございます！',
    '感謝感激タヌ〜'
  ];
  for (let i = 0; i < namedTop.length; i++) {
    const r = namedTop[i];
    out.push({
      character: charRotation[i % 3],
      expression: i === 0 ? 'blink' : 'smile',
      mouthOpen: true,
      line: `${r.rank}位は ${trimToTitle(r.name)} さん、${fmtNum(r.contribution)} 貢！${cheers[i] || 'ありがとう！'}`
    });
  }

  // 8. 締め：りんく の挨拶（mouth closed で「お辞儀」表現）
  out.push({
    character: 'rinku',
    expression: 'smile',
    mouthOpen: false,
    line: '応援してくれた皆さん、ありがとうございました。次回もお楽しみにー！'
  });

  return out;
}

/** @param {string} s */
function escapeHtmlMin(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    /** @type {Record<string,string>} */ ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]
  );
}

/**
 * このモジュールが使い得るキャラ画像パス（重複なし）。HTML 保存時には
 * ダウンロード後に相対パスが解けないので、呼び出し側で全部 data URL 化して
 * `imageDataUrlMap` 経由で render に渡す。
 *
 * @returns {string[]}
 */
export function listYukkuriCharacterImagePaths() {
  /** @type {YukkuriCharacter[]} */
  const chars = ['rinku', 'konta', 'tanunee'];
  /** @type {YukkuriExpression[]} */
  const exps = ['normal', 'smile', 'blink', 'half-eyes'];
  /** @type {Set<string>} */
  const set = new Set();
  for (const c of chars) {
    for (const e of exps) {
      for (const mouth of [false, true]) {
        set.add(yukkuriCharacterImagePath(c, e, mouth));
      }
    }
  }
  return [...set];
}

/**
 * `buildYukkuriBroadcastSummary` の出力を 1 つの section HTML に変換。
 * CSS は呼び出し側（HTML レポート / マーケ分析）が用意する前提（クラス名は固定）。
 *
 * `imageDataUrlMap` を渡すと、生のキャラ画像 path を data URL（`data:image/png;base64,...`）
 * に置き換えて出力する。HTML レポートをダウンロード後に開いても画像が見えるようにするため。
 *
 * @param {YukkuriLine[]} lines
 * @param {{
 *   heading?: string,
 *   imageDataUrlMap?: Record<string, string>
 * }} [opts]
 * @returns {string} 空配列なら空文字
 */
export function renderYukkuriBroadcastSummaryHtml(lines, opts = {}) {
  if (!Array.isArray(lines) || lines.length === 0) return '';
  const heading = opts?.heading || '今回の放送を振り返り';
  const imageMap =
    opts?.imageDataUrlMap && typeof opts.imageDataUrlMap === 'object'
      ? opts.imageDataUrlMap
      : null;
  const items = lines
    .map((line) => {
      const ch = line?.character;
      const exp = line?.expression;
      if (!ch || !exp) return '';
      const path = yukkuriCharacterImagePath(
        ch,
        exp,
        Boolean(line.mouthOpen)
      );
      const src = (imageMap && imageMap[path]) || path;
      const name = CHAR_LABELS[ch] || ch;
      return (
        `<div class="nl-yukkuri-line nl-yukkuri-line--${escapeHtmlMin(ch)}">` +
        `<img class="nl-yukkuri-face" src="${escapeHtmlMin(src)}" alt="${escapeHtmlMin(name)}" loading="lazy" decoding="async" />` +
        `<div class="nl-yukkuri-bubble">` +
        `<div class="nl-yukkuri-name">${escapeHtmlMin(name)}</div>` +
        `<p class="nl-yukkuri-text">${escapeHtmlMin(line.line || '')}</p>` +
        `</div>` +
        `</div>`
      );
    })
    .join('');
  return (
    `<section class="nl-yukkuri-summary">` +
    `<h2 class="nl-yukkuri-summary__heading">${escapeHtmlMin(heading)}</h2>` +
    `<div class="nl-yukkuri-summary__body">${items}</div>` +
    `</section>`
  );
}

/**
 * HTML 埋め込み向けの最小 CSS。1 ファイルで自己完結させたい用途のために返す。
 * 既に外側で同等の CSS を持っているなら呼ぶ必要は無い。
 */
export function yukkuriBroadcastSummaryEmbeddedCss() {
  return [
    '.nl-yukkuri-summary{margin:18px 0;padding:18px;border-radius:14px;background:linear-gradient(180deg,#f6fff8,#eef9f3);border:1px solid #cfe9d8;}',
    '.nl-yukkuri-summary__heading{margin:0 0 12px;font-size:18px;font-weight:700;color:#2a6f4d;}',
    '.nl-yukkuri-summary__body{display:flex;flex-direction:column;gap:10px;}',
    '.nl-yukkuri-line{display:flex;align-items:flex-start;gap:10px;}',
    '.nl-yukkuri-line--konta{flex-direction:row-reverse;}',
    '.nl-yukkuri-face{width:64px;height:64px;border-radius:50%;background:#fff;border:1px solid #cfe9d8;flex-shrink:0;}',
    '.nl-yukkuri-bubble{background:#fff;border:1px solid #cfe9d8;border-radius:12px;padding:8px 12px;max-width:520px;box-shadow:0 1px 0 rgba(42,111,77,0.05);}',
    '.nl-yukkuri-line--konta .nl-yukkuri-bubble{background:#fff8ec;border-color:#f0d9a8;}',
    '.nl-yukkuri-line--tanunee .nl-yukkuri-bubble{background:#f6f0ec;border-color:#d8c3b3;}',
    '.nl-yukkuri-name{font-weight:700;font-size:13px;color:#2a6f4d;margin-bottom:2px;}',
    '.nl-yukkuri-line--konta .nl-yukkuri-name{color:#a86b1e;}',
    '.nl-yukkuri-line--tanunee .nl-yukkuri-name{color:#7a5a3f;}',
    '.nl-yukkuri-text{margin:0;font-size:14px;line-height:1.5;color:#222;}'
  ].join('');
}
