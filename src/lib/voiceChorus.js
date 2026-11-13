// voiceChorus.js
// 2026-11-12: 合唱(混雑配信の読み上げ・会議の第2段)。
//
// 会議の結論(/mnt/project-files/voice/busy-voice-council-result-2026-11-12.md): 数秒内に同じ言葉
//   (わこつ・888・草…)が何人からも来たら、1件にまとめて、その人たちの声を少しずつずらして重ねて
//   1回で鳴らす。888 が拍手、わこつが歓声に聞こえる。ふだん読まれない人も「自分の声で加われた」になる。
//   世界の読み上げツールで「群衆を音で表す」ものは見つからなかった(わんコメ・琴詠ニア・海外 TTS)。
//
// 重ねるのは「覚えた声」(voiceClipCache)がある人だけ=合成を増やさない(ふつうの CPU の PC が基準)。
//   覚えていない人の声は、読み上げ待ちが空いている時に1人ずつ作っておく(次の合唱から加わる)。
// うるさくしないため、重ねるのは最大4人(主役と合わせて5人)・音量は控えめ・人数は厚みで表す。
//
// DOM/chrome.* 非依存の純部品。

/** 主役のほかに重ねる人数の上限。 */
export const VOICE_CHORUS_MAX_MEMBERS = 4;
/** 重ねる声の出だしのずれ(ms)。1人目から順に。少しずつずらすと「大勢」に聞こえる。 */
export const VOICE_CHORUS_OFFSETS_MS = Object.freeze([90, 170, 260, 340]);
/** 重ねる声の音量(主役の音量設定に対する割合・%)。 */
export const VOICE_CHORUS_GAIN_PERCENT = 55;
/** 合唱の設定(既定 ON)。 */
export const KEY_VOICE_CHORUS_ENABLED = 'nls_voice_chorus_enabled_v1';

/**
 * 保存値から合唱を使うか(既定 ON=明示的に false の時だけ OFF)。
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isVoiceChorusEnabled(raw) {
  return raw !== false;
}

/**
 * 2026-11-13: 合唱で「同じ言葉」とみなすための形。笑い(w・ｗ・www・草・笑・わら)は1つ、拍手(888…)は1つ、
 *   語尾の伸ばし・！？・句読点は無視する。YouTube 実測(毎分85〜140件・10分)で多かったのは
 *   「www・草・w・ｗ・笑笑」で、文字が少しずつ違うため合唱に加われたのは9件だけだった。
 * @param {unknown} body
 * @returns {string} 比べられない時は ''
 */
export function voiceChorusMatchKey(body) {
  if (typeof body !== 'string') return '';
  let t = body.normalize('NFKC').trim().toLowerCase();
  if (!t) return '';
  if (/^(?:w+|草+|笑+|(?:わら)+)$/u.test(t)) return 'わら';
  if (/^8{3,}$/.test(t)) return '888';
  t = t.replace(/[ー〜~!?！？。、.,…]+$/u, '');
  return t;
}

/**
 * 待ち行列の中から、同じ言葉で合唱に加われる件を探す。
 *   - 同じ本文(読む前の文)・別の人・まだ鳴っていない件。
 *   - 加わる人が大事なもの(ギフト・広告・配信者・モデレーター)なら合唱にしない(その人の声で1件として読む)。
 *   - 2026-11-13: 初コメ('first')は、混んでいる時(busy)だけ合唱に加える。
 *     YouTube 実測(2.3万人・毎分60〜260件・12分)で、混雑中の538件がほぼ全部「初コメ」扱いで合唱に入れず、
 *     合唱は1回も鳴らなかった。混雑中の初コメは1件ずつ並べても古くなって捨てられる(同じ12分で164件)ので、
 *     合唱に入れて「自分の言葉が鳴った」にする方が本人にも配信者にもよい。空いている時は今までどおり1件で読む。
 * @param {ReadonlyArray<any>} queue
 * @param {{ body?: unknown, userKey?: unknown, importance?: unknown, busy?: boolean }} candidate
 * @returns {number} 見つからなければ -1
 */
export function findVoiceChorusHost(queue, candidate) {
  if (!Array.isArray(queue) || !candidate) return -1;
  if (candidate.importance && !(candidate.importance === 'first' && candidate.busy === true)) return -1;
  const body = voiceChorusMatchKey(candidate.body);
  const who = String(candidate.userKey ?? '');
  if (!body || !who) return -1;
  for (let i = 0; i < queue.length; i += 1) {
    const q = queue[i];
    if (!q || typeof q !== 'object') continue;
    if (voiceChorusMatchKey(q.body) !== body) continue;
    if (String(q.userKey ?? '') === who) continue;
    return i;
  }
  return -1;
}

/**
 * 合唱に1人加える(同じ人・主役は二重に数えない)。上限を超えた人は数だけ数える。
 * @param {any} host 待ち行列の件(書き換える)
 * @param {unknown} userKey
 * @returns {'joined'|'counted'|'dup'}
 */
export function joinVoiceChorus(host, userKey) {
  const who = String(userKey ?? '');
  if (!host || !who || who === String(host.userKey ?? '')) return 'dup';
  if (!Array.isArray(host.chorus)) host.chorus = [];
  if (host.chorus.includes(who)) return 'dup';
  host.chorusCount = (Number(host.chorusCount) || 0) + 1;
  if (host.chorus.length >= VOICE_CHORUS_MAX_MEMBERS) return 'counted';
  host.chorus.push(who);
  return 'joined';
}

/**
 * 鳴らす直前に、重ねる声を決める。覚えた声がある人だけ・最大4人・ずれと音量つき。
 *   2026-11-13: 加わった人の声をまだ覚えていない時は、同じ言葉を前に言った別の声(crowd)で数を埋める
 *   (加わった人数まで・最大4)。混む配信では新しい人ばかりで本人の声はほぼ覚えていない(YouTube 実測:
 *   覚えた175件のうち本人の声が使えたのは0回)。主役の1件は今までどおりその人の声=1人1声は崩さない。
 * @template T
 * @param {ReadonlyArray<string> | null | undefined} members
 * @param {(userKey: string) => T | null | undefined} lookup 覚えた声(無ければ null)
 * @param {ReadonlyArray<T>} [crowd] 同じ言葉の別の声(主役・仲間の声と重ならないもの)
 * @returns {Array<{ userKey: string, clip: T, delayMs: number, gainPercent: number }>}
 */
export function planVoiceChorusOverlays(members, lookup, crowd = []) {
  /** @type {Array<{ userKey: string, clip: any, delayMs: number, gainPercent: number }>} */
  const out = [];
  if (!Array.isArray(members) || typeof lookup !== 'function') return out;
  for (const who of members) {
    if (out.length >= VOICE_CHORUS_MAX_MEMBERS) break;
    let clip = null;
    try { clip = lookup(who); } catch { clip = null; }
    if (!clip) continue;
    out.push({
      userKey: who,
      clip,
      delayMs: VOICE_CHORUS_OFFSETS_MS[out.length] ?? VOICE_CHORUS_OFFSETS_MS[VOICE_CHORUS_OFFSETS_MS.length - 1],
      gainPercent: VOICE_CHORUS_GAIN_PERCENT
    });
  }
  const want = Math.min(VOICE_CHORUS_MAX_MEMBERS, members.length);
  if (Array.isArray(crowd)) {
    for (const clip of crowd) {
      if (out.length >= want) break;
      if (!clip || out.some((o) => o.clip === clip)) continue;
      out.push({
        userKey: '',
        clip,
        delayMs: VOICE_CHORUS_OFFSETS_MS[out.length] ?? VOICE_CHORUS_OFFSETS_MS[VOICE_CHORUS_OFFSETS_MS.length - 1],
        gainPercent: VOICE_CHORUS_GAIN_PERCENT
      });
    }
  }
  return out;
}
