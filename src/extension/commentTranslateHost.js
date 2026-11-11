/**
 * commentTranslateHost.js — Chrome 内蔵の Translator / LanguageDetector だけを呼ぶ。
 * 無い・失敗したときは理由を返す。外の翻訳サービスへは送らない。
 * モデルの作成は、呼び出し側が planCommentTranslate で go と決めたあとだけ。
 */

const pairCache = new Map();

/**
 * @param {object} [scope]
 * @returns {{ translator: object|null, detector: object|null }}
 */
export function readChromeTranslatorApis(scope) {
  const g = scope && typeof scope === 'object' ? scope : {};
  const translator = g.Translator && typeof g.Translator.create === 'function' ? g.Translator : null;
  const detector =
    g.LanguageDetector && typeof g.LanguageDetector.create === 'function' ? g.LanguageDetector : null;
  return { translator, detector };
}

/**
 * @param {object|null} api
 * @param {string} sourceLanguage
 * @param {string} targetLanguage
 * @returns {Promise<string>}
 */
export async function queryTranslatorAvailability(api, sourceLanguage, targetLanguage) {
  if (!api || typeof api.availability !== 'function') return 'unavailable';
  try {
    const value = await api.availability({ sourceLanguage, targetLanguage });
    const name = String(value || '');
    if (name === 'available' || name === 'downloadable' || name === 'downloading' || name === 'unavailable') {
      return name;
    }
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/**
 * 言語の組ごとに1つだけ作って使い回す（件ごとに作り直すと弱いPCで重くなる）。
 * @param {object|null} api
 * @param {{ text: string, sourceLanguage: string, targetLanguage: string }} req
 * @returns {Promise<{ ok: boolean, text: string, reason: string }>}
 */
export async function translateWithChrome(api, req) {
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
      translator = await api.create({ sourceLanguage, targetLanguage });
      pairCache.set(key, translator);
    }
    const out = await translator.translate(text);
    const line = String(out || '').trim();
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
