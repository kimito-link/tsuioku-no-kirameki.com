/**
 * 放送終了後の HTML レポート / マーケ分析の頭にくる「漫画読み体験」要約。
 * `yukkuriBroadcastSummary.js` の dialogue 形式を、コマ割り + 吹き出し +
 * 強調数字 + 擬音語 + 背景色 で漫画コマ風に再構成する。
 *
 * 構造：
 *   buildMangaBroadcastPanels(input)  → MangaPanel[] （純関数）
 *   renderMangaBroadcastPanelsHtml(panels, { imageDataUrlMap })
 *   mangaBroadcastSummaryEmbeddedCss()
 */

import {
  yukkuriCharacterImagePath,
  listYukkuriCharacterImagePaths
} from './yukkuriBroadcastSummary.js';
import { buildUserProfileLinkedLabelHtml } from './userProfileLinkHtml.js';

/**
 * @typedef {'rinku'|'konta'|'tanunee'} MangaCharacter
 * @typedef {'smile'|'blink'|'half-eyes'|'normal'} MangaExpression
 * @typedef {'opening'|'numbers'|'capture'|'event'|'top-fans'|'closing'} MangaSceneId
 *
 * @typedef {{
 *   character: MangaCharacter,
 *   expression: MangaExpression,
 *   mouthOpen: boolean,
 *   size: 'big'|'medium'|'small',
 *   line: string,
 *   lineHtml?: string
 * }} MangaDialogue
 *
 * @typedef {{
 *   sceneId: MangaSceneId,
 *   caption: string,
 *   bg: 'rinku'|'konta'|'tanunee'|'neutral'|'gold'|'pink',
 *   dialogues: MangaDialogue[],
 *   highlight: { value: string, label: string }|null,
 *   onomatopoeia: string|null
 * }} MangaPanel
 */

const CHAR_LABELS = /** @type {const} */ ({
  rinku: 'りんく',
  konta: 'こん太',
  tanunee: 'たぬ姉'
});

/** @param {unknown} v */
function fmtNum(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return v.toLocaleString('ja-JP');
}

/** @param {unknown} s @returns {string} HTML 用エスケープ（lineHtml 組み立て用） */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

/**
 * niconico の userPageUrl / 値から数値 uid を取り出す（無ければ空）。
 * @param {unknown} value
 * @returns {string}
 */
function uidFromUserPageUrl(value) {
  const s = String(value == null ? '' : value).trim();
  if (/^\d{1,18}$/.test(s)) return s;
  const m = s.match(/\/user\/(\d{1,18})(?:\/|\?|$)/);
  return m ? m[1] : '';
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
 *   broadcasterUserId?: string,
 *   recordedCommentCount?: number,
 *   streamAgeMin?: number
 * }} input
 * @returns {MangaPanel[]}
 */
export function buildMangaBroadcastPanels(input) {
  const bundle = input?.bundle || null;
  const broadcasterUid = String(input?.broadcasterUserId || '').trim();
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

  /** @type {MangaPanel[]} */
  const panels = [];

  // ───── コマ 1：オープニング（タイトル発表）─────
  {
    const titleSeg = titleRaw ? `「${titleRaw}」` : 'この放送';
    const broadcasterSeg = broadcaster ? `（${broadcaster}さん）` : '';
    /** @type {MangaDialogue} */
    const openingDialogue = {
      character: 'rinku',
      expression: 'smile',
      mouthOpen: true,
      size: 'big',
      line: `今回の${titleSeg}${broadcasterSeg}、お疲れさまでしたー！`
    };
    // 配信者名が数値 uid と紐付くならユーザーページへリンク化（lineHtml）。
    if (broadcaster && /^\d{1,18}$/.test(broadcasterUid)) {
      const nameLink = buildUserProfileLinkedLabelHtml(broadcasterUid, `${broadcaster}さん`);
      openingDialogue.lineHtml = `今回の${esc(titleSeg)}（${nameLink}）、お疲れさまでしたー！`;
    }
    panels.push({
      sceneId: 'opening',
      caption: '【プロローグ】今回の放送のおさらい',
      bg: 'rinku',
      dialogues: [openingDialogue],
      highlight: null,
      onomatopoeia: 'わいわい〜！'
    });
  }

  // ───── コマ 2：数字の振り返り（来場・コメ・経過）─────
  if (ws || streamAgeMin != null) {
    const segs = [];
    if (ws?.watchCount != null) segs.push(`来場 ${fmtNum(ws.watchCount)} 人`);
    if (ws?.commentCount != null) segs.push(`コメ ${fmtNum(ws.commentCount)} 件`);
    if (streamAgeMin != null) {
      const h = Math.floor(streamAgeMin / 60);
      const m = streamAgeMin % 60;
      const t = h > 0 ? `${h}時間${m}分` : `${m}分`;
      segs.push(`配信 ${t}`);
    }
    /** @type {{value:string,label:string}|null} */
    let hl = null;
    if (typeof ws?.watchCount === 'number') {
      hl = { value: `${fmtNum(ws.watchCount)} 人`, label: '来場者数' };
    } else if (typeof ws?.commentCount === 'number') {
      hl = { value: `${fmtNum(ws.commentCount)} 件`, label: '本家コメ数' };
    }
    panels.push({
      sceneId: 'numbers',
      caption: '【1コマ目】数字の振り返り',
      bg: 'neutral',
      dialogues: [
        {
          character: 'tanunee',
          expression: 'normal',
          mouthOpen: true,
          size: 'medium',
          line: `${segs.length ? segs.join(' / ') : '統計はまだそろってない'}で着地タヌ`
        }
      ],
      highlight: hl,
      onomatopoeia: 'コクコク'
    });
  }

  // ───── コマ 3：捕捉率（こん太の評価）─────
  if (recorded != null && ws && ws.commentCount && ws.commentCount > 0) {
    const ratio = Math.round((recorded / ws.commentCount) * 100);
    const isGood = ratio >= 30;
    panels.push({
      sceneId: 'capture',
      caption: '【2コマ目】記録の評価',
      bg: isGood ? 'gold' : 'konta',
      dialogues: [
        {
          character: 'konta',
          expression: isGood ? 'smile' : 'half-eyes',
          mouthOpen: true,
          size: 'medium',
          line: isGood
            ? `こちらの記録は ${fmtNum(recorded)} 件、捕捉率 ${ratio}% です。よく拾えてますね`
            : `こちらの記録は ${fmtNum(recorded)} 件、捕捉率 ${ratio}% です。次はもう少し拾えるとよさそうですね`
        }
      ],
      highlight: { value: `${ratio}%`, label: '捕捉率' },
      onomatopoeia: isGood ? 'パチパチ！' : 'しゅん…'
    });
  }

  // ───── コマ 4：イベント参加（順位ドカン！）─────
  if (ev) {
    const evTitle = trimToTitle(ev.title);
    const score = bal?.eventTotalScore != null ? bal.eventTotalScore : ev.score;
    /** @type {string[]} */
    const segs = [];
    if (ev.rank != null) segs.push(`現在 ${ev.rank} 位`);
    if (score != null) segs.push(`累計 ${fmtNum(score)}`);
    /** @type {{value:string,label:string}|null} */
    let hl = null;
    if (ev.rank != null) {
      hl = { value: `${ev.rank} 位`, label: 'イベント順位' };
    } else if (score != null) {
      hl = { value: fmtNum(score), label: 'イベントスコア' };
    }
    panels.push({
      sceneId: 'event',
      caption: '【3コマ目】参加イベント',
      bg: 'gold',
      dialogues: [
        {
          character: 'tanunee',
          expression: 'blink',
          mouthOpen: true,
          size: 'big',
          line: evTitle
            ? `イベント「${evTitle}」では ${segs.join(' / ')} まで来てるタヌよ`
            : `イベントでは ${segs.join(' / ')} まで来てるタヌよ`
        }
      ],
      highlight: hl,
      onomatopoeia: 'キラキラ✨'
    });
  }

  // ───── コマ 5：上位応援者（3人会話）─────
  const namedTop = rank.filter((r) => r && !r.isAnonymous && r.name).slice(0, 3);
  if (namedTop.length > 0) {
    const charRotation = /** @type {MangaCharacter[]} */ (['rinku', 'konta', 'tanunee']);
    const intros = [
      'ぶっちぎりのトップ！すごいー！',
      'いつもありがとうございます！',
      '感謝感激タヌ〜'
    ];
    /** @type {MangaDialogue[]} */
    const dialogues = [];
    for (let i = 0; i < namedTop.length; i++) {
      const r = namedTop[i];
      const nameText = trimToTitle(r.name);
      const intro = intros[i] || 'ありがとう！';
      /** @type {MangaDialogue} */
      const dialogue = {
        character: charRotation[i % 3],
        expression: i === 0 ? 'blink' : 'smile',
        mouthOpen: true,
        size: i === 0 ? 'medium' : 'small',
        line: `${r.rank}位 ${nameText} さん、${fmtNum(r.contribution)} 貢！${intro}`
      };
      // 貢献者の userPageUrl から数値 uid が取れたら名前をリンク化（lineHtml）。
      const rAny = /** @type {any} */ (r);
      const uid = uidFromUserPageUrl(rAny.userPageUrl || rAny.userId);
      if (uid) {
        const nameLink = buildUserProfileLinkedLabelHtml(uid, `${nameText} さん`);
        dialogue.lineHtml = `${esc(r.rank)}位 ${nameLink}、${esc(fmtNum(r.contribution))} 貢！${esc(intro)}`;
      }
      dialogues.push(dialogue);
    }
    /** @type {{value:string,label:string}|null} */
    const hl = namedTop[0]
      ? {
          value: `${trimToTitle(namedTop[0].name)} さん`,
          label: `1位 ${fmtNum(namedTop[0].contribution)} 貢`
        }
      : null;
    panels.push({
      sceneId: 'top-fans',
      caption: '【4コマ目】上位応援者の発表',
      bg: 'pink',
      dialogues,
      highlight: hl,
      onomatopoeia: 'ありがとう〜♪'
    });
  }

  // ───── コマ 6：クロージング（りんくのお辞儀）─────
  panels.push({
    sceneId: 'closing',
    caption: '【エピローグ】次回もお楽しみに！',
    bg: 'rinku',
    dialogues: [
      {
        character: 'rinku',
        expression: 'smile',
        mouthOpen: false,
        size: 'big',
        line: '応援してくれた皆さん、ありがとうございました。次回もお楽しみにー！'
      }
    ],
    highlight: null,
    onomatopoeia: 'ぺこり'
  });

  return panels;
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
 * `buildMangaBroadcastPanels` の出力を 1 つの section HTML に変換。
 *
 * @param {MangaPanel[]} panels
 * @param {{
 *   heading?: string,
 *   imageDataUrlMap?: Record<string, string>
 * }} [opts]
 * @returns {string}
 */
export function renderMangaBroadcastPanelsHtml(panels, opts = {}) {
  if (!Array.isArray(panels) || panels.length === 0) return '';
  const heading = opts?.heading || '今回の放送のおさらい・漫画版';
  const imageMap =
    opts?.imageDataUrlMap && typeof opts.imageDataUrlMap === 'object'
      ? opts.imageDataUrlMap
      : null;

  /** @param {MangaDialogue} d */
  const renderDialogue = (d) => {
    const path = yukkuriCharacterImagePath(d.character, d.expression, d.mouthOpen);
    const src = (imageMap && imageMap[path]) || path;
    const name = CHAR_LABELS[d.character] || d.character;
    return (
      `<div class="nl-manga-dialogue nl-manga-dialogue--${d.size} nl-manga-dialogue--${escapeHtmlMin(d.character)}">` +
      `<div class="nl-manga-face-wrap">` +
      `<img class="nl-manga-face" src="${escapeHtmlMin(src)}" alt="${escapeHtmlMin(name)}" loading="lazy" decoding="async" />` +
      `<div class="nl-manga-name">${escapeHtmlMin(name)}</div>` +
      `</div>` +
      `<div class="nl-manga-bubble">` +
      // lineHtml は呼び出し側で escape 済みテキスト＋安全な <a>（buildUserProfileLinkedLabelHtml）
      // だけで組み立てる契約。無ければ従来どおり line を escape して出す。
      `<p class="nl-manga-bubble__text">${typeof d.lineHtml === 'string' && d.lineHtml ? d.lineHtml : escapeHtmlMin(d.line)}</p>` +
      `</div>` +
      `</div>`
    );
  };

  const items = panels
    .map((panel) => {
      const dialoguesHtml = panel.dialogues.map(renderDialogue).join('');
      const highlightHtml = panel.highlight
        ? `<div class="nl-manga-highlight">` +
          `<div class="nl-manga-highlight__value">${escapeHtmlMin(panel.highlight.value)}</div>` +
          `<div class="nl-manga-highlight__label">${escapeHtmlMin(panel.highlight.label)}</div>` +
          `</div>`
        : '';
      const onomatopoeiaHtml = panel.onomatopoeia
        ? `<div class="nl-manga-onomatopoeia" aria-hidden="true">${escapeHtmlMin(panel.onomatopoeia)}</div>`
        : '';
      return (
        `<article class="nl-manga-panel nl-manga-panel--bg-${escapeHtmlMin(panel.bg)} nl-manga-panel--scene-${escapeHtmlMin(panel.sceneId)}">` +
        `<div class="nl-manga-panel__caption">${escapeHtmlMin(panel.caption)}</div>` +
        `<div class="nl-manga-panel__body">` +
        `<div class="nl-manga-panel__dialogues">${dialoguesHtml}</div>` +
        highlightHtml +
        `</div>` +
        onomatopoeiaHtml +
        `</article>`
      );
    })
    .join('');

  return (
    `<section class="nl-manga-summary">` +
    `<h2 class="nl-manga-summary__heading">${escapeHtmlMin(heading)}</h2>` +
    `<div class="nl-manga-summary__panels">${items}</div>` +
    `</section>`
  );
}

/**
 * HTML 埋め込み向けの最小 CSS。漫画コマっぽい枠線・吹き出し・強調・擬音語を表現。
 * 自己完結なので呼び出し側で <style> に流し込むだけで OK。
 *
 * @returns {string}
 */
export function mangaBroadcastSummaryEmbeddedCss() {
  return [
    /* ── セクション全体（responsive: clamp で全サイズ追従）── */
    '.nl-manga-summary{margin:clamp(12px,3vw,20px) 0;font-family:"Yu Gothic","ヒラギノ角ゴ Pro",system-ui,Arial,sans-serif;container-type:inline-size;}',
    '.nl-manga-summary__heading{margin:0 0 clamp(10px,2.5vw,16px);font-size:clamp(15px,4vw,22px);font-weight:900;letter-spacing:0.04em;color:#1f2937;border-left:clamp(4px,1vw,7px) solid #2a6f4d;padding-left:clamp(8px,2vw,12px);line-height:1.3;}',
    '.nl-manga-summary__panels{display:grid;grid-template-columns:1fr;gap:clamp(10px,2.5vw,16px);}',
    /* container query で 720px 以上は 2 列、それ未満は 1 列（外側 width 不問） */
    '@container (min-width: 720px){.nl-manga-summary__panels{grid-template-columns:1fr 1fr;}}',
    /* viewport 側でも保険（container query 非対応ブラウザ向け） */
    '@media(min-width:760px){.nl-manga-summary__panels{grid-template-columns:1fr 1fr;}}',

    /* ── コマ ── */
    '.nl-manga-panel{position:relative;border:clamp(2px,0.5vw,3px) solid #1f2937;border-radius:clamp(6px,1.5vw,10px);padding:clamp(10px,2.5vw,16px);padding-bottom:clamp(14px,3vw,22px);overflow:hidden;box-shadow:3px 3px 0 #1f2937;min-width:0;}',
    '.nl-manga-panel--bg-rinku{background:linear-gradient(160deg,#fff5f7,#ffe5ec);}',
    '.nl-manga-panel--bg-konta{background:linear-gradient(160deg,#fffbeb,#fef0c7);}',
    '.nl-manga-panel--bg-tanunee{background:linear-gradient(160deg,#fef6ef,#f5e0c9);}',
    '.nl-manga-panel--bg-neutral{background:linear-gradient(160deg,#fafafa,#eef2f7);}',
    '.nl-manga-panel--bg-gold{background:linear-gradient(160deg,#fff7d6,#ffe9a3);}',
    '.nl-manga-panel--bg-pink{background:linear-gradient(160deg,#fff0f5,#ffd6e6);}',
    '.nl-manga-panel--scene-opening{grid-column:1/-1;}',
    '.nl-manga-panel--scene-closing{grid-column:1/-1;}',

    '.nl-manga-panel__caption{font-size:clamp(10px,2.4vw,12px);font-weight:700;color:#6b7280;letter-spacing:0.06em;margin-bottom:clamp(6px,1.5vw,10px);line-height:1.3;}',
    '.nl-manga-panel__body{display:flex;flex-direction:column;gap:clamp(8px,2vw,12px);}',
    '.nl-manga-panel__dialogues{display:flex;flex-direction:column;gap:clamp(8px,2vw,12px);}',

    /* ── 会話（顔と吹き出し）── */
    '.nl-manga-dialogue{display:flex;align-items:flex-start;gap:clamp(8px,2vw,14px);min-width:0;}',
    /* 極狭幅 (480px 未満) では konta も顔を左に揃える（読みやすさ優先） */
    '.nl-manga-dialogue--konta{flex-direction:row-reverse;}',
    '@media (max-width:480px){.nl-manga-dialogue--konta{flex-direction:row;}}',
    '.nl-manga-face-wrap{display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;}',
    '.nl-manga-face{border-radius:50%;background:#fff;border:2px solid #1f2937;box-shadow:2px 2px 0 #1f2937;display:block;}',
    /* 顔サイズは clamp で widths 追従。big/medium/small は段階的に小さく */
    '.nl-manga-dialogue--big .nl-manga-face{width:clamp(64px,18vw,96px);height:clamp(64px,18vw,96px);}',
    '.nl-manga-dialogue--medium .nl-manga-face{width:clamp(54px,14vw,72px);height:clamp(54px,14vw,72px);}',
    '.nl-manga-dialogue--small .nl-manga-face{width:clamp(44px,11vw,56px);height:clamp(44px,11vw,56px);}',
    '.nl-manga-name{font-size:clamp(10px,2.4vw,12px);font-weight:800;color:#1f2937;line-height:1.2;}',

    /* ── 吹き出し ── */
    '.nl-manga-bubble{position:relative;flex:1 1 auto;min-width:0;background:#fff;border:2px solid #1f2937;border-radius:clamp(10px,2.5vw,16px);padding:clamp(8px,2vw,12px) clamp(10px,2.5vw,15px);box-shadow:2px 2px 0 #1f2937;}',
    '.nl-manga-bubble::before{content:"";position:absolute;left:-12px;top:18px;width:0;height:0;border-style:solid;border-width:8px 12px 8px 0;border-color:transparent #1f2937 transparent transparent;}',
    '.nl-manga-bubble::after{content:"";position:absolute;left:-9px;top:20px;width:0;height:0;border-style:solid;border-width:6px 10px 6px 0;border-color:transparent #fff transparent transparent;}',
    '.nl-manga-dialogue--konta .nl-manga-bubble::before{left:auto;right:-12px;border-width:8px 0 8px 12px;border-color:transparent transparent transparent #1f2937;}',
    '.nl-manga-dialogue--konta .nl-manga-bubble::after{left:auto;right:-9px;border-width:6px 0 6px 10px;border-color:transparent transparent transparent #fff;}',
    /* 極狭幅で konta が逆になった時のしっぽ向き直し */
    '@media (max-width:480px){.nl-manga-dialogue--konta .nl-manga-bubble::before{left:-12px;right:auto;border-width:8px 12px 8px 0;border-color:transparent #1f2937 transparent transparent;}.nl-manga-dialogue--konta .nl-manga-bubble::after{left:-9px;right:auto;border-width:6px 10px 6px 0;border-color:transparent #fff transparent transparent;}}',
    '.nl-manga-bubble__text{margin:0;font-size:clamp(13px,3.2vw,15px);line-height:1.55;color:#111827;font-weight:600;overflow-wrap:anywhere;word-break:break-word;}',
    '.nl-manga-dialogue--big .nl-manga-bubble__text{font-size:clamp(14px,3.6vw,16px);}',

    /* ── 強調数字 ── */
    '.nl-manga-highlight{display:inline-block;padding:clamp(6px,1.6vw,9px) clamp(10px,2.5vw,15px);background:#1f2937;color:#fff;border-radius:6px;align-self:flex-start;box-shadow:3px 3px 0 #fff,3px 3px 0 1px #1f2937;max-width:100%;}',
    '.nl-manga-highlight__value{font-size:clamp(18px,5vw,26px);font-weight:900;letter-spacing:0.04em;line-height:1.1;overflow-wrap:anywhere;}',
    '.nl-manga-highlight__label{font-size:clamp(10px,2.4vw,12px);font-weight:700;color:#fbbf24;letter-spacing:0.06em;margin-top:2px;}',
    '.nl-manga-panel--bg-gold .nl-manga-highlight{background:#7c2d12;}',
    '.nl-manga-panel--bg-pink .nl-manga-highlight{background:#9f1239;}',
    '.nl-manga-panel--bg-konta .nl-manga-highlight{background:#92400e;}',

    /* ── 擬音語 ── */
    /* 極狭幅では絶対配置だと邪魔なので、768px 未満では下に普通に並べる */
    '.nl-manga-onomatopoeia{display:inline-block;margin-top:8px;font-size:clamp(15px,4vw,20px);font-weight:900;color:#dc2626;text-shadow:1px 1px 0 #fff,2px 2px 0 #1f2937;font-family:"Impact","Arial Black",sans-serif;letter-spacing:0.06em;transform:rotate(-4deg);pointer-events:none;align-self:flex-end;}',
    '@media (min-width:768px){.nl-manga-onomatopoeia{position:absolute;right:14px;bottom:10px;margin-top:0;}.nl-manga-panel--scene-opening .nl-manga-onomatopoeia,.nl-manga-panel--scene-closing .nl-manga-onomatopoeia{top:14px;bottom:auto;}}',

    /* prefers-reduced-motion 対応：傾きを軽く */
    '@media (prefers-reduced-motion:reduce){.nl-manga-onomatopoeia{transform:none;}}',

    /* ダーク背景の HTML レポート向け：色を反転して可読性確保 */
    '@media (prefers-color-scheme:dark){.nl-manga-summary__heading{color:#e5e7eb;}.nl-manga-bubble__text{color:#111827;}}'
  ].join('\n');
}

/**
 * 必要な画像 path 一覧（呼び出し側で data URL 焼き込み用に使う）。
 * @returns {string[]}
 */
export function listMangaCharacterImagePaths() {
  return listYukkuriCharacterImagePaths();
}
