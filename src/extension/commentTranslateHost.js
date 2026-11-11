/**
 * commentTranslateHost.js — Chrome 内蔵の Translator / LanguageDetector だけを呼ぶ。
 * 無い・失敗したときは理由を返す。外の翻訳サービスへは送らない。
 * モデルの作成は、呼び出し側が planCommentTranslate で go と決めたあとだけ。
 */

const pairCache = new Map();
export const TRANSLATE_WAIT_MS = 20000;
const TIMED_OUT = Object.freeze({ timeout: true });

/**
 * 遅いダウンロードで状態が戻り続けないようにする。
 * @param {number} ms
 * @returns {Promise<{ timeout: true }>}
 */
function waitBudget(ms) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(TIMED_OUT), ms);
  });
}

/**
 * 後から失敗しても、待ちを終わったあとに未処理の拒否を出さない。
 * @param {Promise<unknown>} promise
 * @returns {Promise<{ ok: true, value: unknown } | { ok: false }>}
 */
function asSettled(promise) {
  return Promise.resolve(promise).then(
    (value) => ({ ok: true, value }),
    () => ({ ok: false })
  );
}

/**
 * @param {unknown} value
 * @returns {value is { timeout: true }}
 */
function isTimeout(value) {
  return value === TIMED_OUT;
}

/**
 * @param {any} [scope]
 * @returns {{ translator: any, detector: any }}
 */
export function readChromeTranslatorApis(scope) {
  const g = scope && typeof scope === 'object' ? scope : {};
  const translator = g.Translator && typeof g.Translator.create === 'function' ? g.Translator : null;
  const detector =
    g.LanguageDetector && typeof g.LanguageDetector.create === 'function' ? g.LanguageDetector : null;
  return { translator, detector };
}

/**
 * @param {any} api
 * @param {string} sourceLanguage
 * @param {string} targetLanguage
 * @returns {Promise<string>}
 */
export async function queryTranslatorAvailability(api, sourceLanguage, targetLanguage, waitMs = TRANSLATE_WAIT_MS) {
  if (!api || typeof api.availability !== 'function') return 'unavailable';
  const raced = await Promise.race([
    asSettled(api.availability({ sourceLanguage, targetLanguage })),
    waitBudget(waitMs)
  ]);
  if (isTimeout(raced)) return 'timeout';
  if (!raced.ok) return 'unavailable';
  const name = String(raced.value || '');
  if (name === 'available' || name === 'downloadable' || name === 'downloading' || name === 'unavailable') {
    return name;
  }
  return 'unavailable';
}

/**
 * 言語の組ごとに1つだけ作って使い回す（件ごとに作り直すと弱いPCで重くなる）。
 * @param {any} api
 * @param {{ text: string, sourceLanguage: string, targetLanguage: string }} req
 * @returns {Promise<{ ok: boolean, text: string, reason: string }>}
 */
export async function translateWithChrome(api, req, waitMs = TRANSLATE_WAIT_MS) {
  if (!api || typeof api.create !== 'function') {
    return { ok: false, text: '', reason: 'unavailable' };
  }
  const sourceLanguage = String(req?.sourceLanguage || '');
  const targetLanguage = String(req?.targetLanguage || '');
  const text = String(req?.text || '');
  if (!sourceLanguage || !targetLanguage || !text) {
    return { ok: false, text: '', reason: 'empty' };
  }
  const key = `${sourceLanguage}>${targetLanguage}`;
  try {
    let translator = pairCache.get(key);
    if (!translator) {
      if (pairCache.size >= 2) {
        const oldest = pairCache.keys().next().value;
        pairCache.delete(oldest);
      }
      const created = await Promise.race([
        asSettled(api.create({ sourceLanguage, targetLanguage })),
        waitBudget(waitMs)
      ]);
      if (isTimeout(created)) return { ok: false, text: '', reason: 'timeout' };
      if (!created.ok || !created.value) return { ok: false, text: '', reason: 'failed' };
      translator = /** @type {{ translate: (text: string) => Promise<unknown> }} */ (created.value);
      pairCache.set(key, translator);
    }
    const translated = await Promise.race([
      asSettled(translator.translate(text)),
      waitBudget(waitMs)
    ]);
    if (isTimeout(translated)) {
      pairCache.delete(key);
      return { ok: false, text: '', reason: 'timeout' };
    }
    if (!translated.ok) {
      pairCache.delete(key);
      return { ok: false, text: '', reason: 'failed' };
    }
    const line = String(translated.value || '').trim();
    if (!line) return { ok: false, text: '', reason: 'empty-result' };
    return { ok: true, text: line, reason: 'ok' };
  } catch {
    pairCache.delete(key);
    return { ok: false, text: '', reason: 'failed' };
  }
}

/** テスト用。翻訳器の使い回しを捨てる。 */
export function resetChromeTranslatorCache() {
  pairCache.clear();
}
