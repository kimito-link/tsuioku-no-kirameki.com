/**
 * スマホ版のデモ(/live-view?v=demo)の配線。PC が無くても動く作り物の配信を、端末の中だけで流す。
 *   中身の組み立ては app/live-view-demo-feed.js(純関数)。ここは見本の読み込みと、読み上げのデモ用の声だけ。
 *   ★サーバーの /api/status には取りに行かない・何も送らない。
 *
 * @module live-view-demo
 */
import { buildDemoSnapshot, DEMO_TOKEN } from './live-view-demo-feed.js';

export { DEMO_TOKEN };

/** @param {string} token */
export function isDemoToken(token) {
  return token === DEMO_TOKEN;
}

/**
 * @param {{ fetchImpl?: typeof fetch, now?: () => number }} [a]
 */
export function createDemoSource(a = {}) {
  const fetchImpl = a.fetchImpl || ((u, i) => fetch(u, i));
  const now = a.now || (() => Date.now());
  const startedAt = now();
  /** @type {Promise<any>|null} */
  let base = null;
  /** @type {Promise<{ file: string }[]>|null} */
  let voiceList = null;
  let voiceNo = 0;
  let lastVoiceAt = 0;
  let voicePrimed = false;

  /** 見本の土台(1回だけ読む)。読めなければ空の土台で動かす。 */
  function loadBase() {
    if (!base) {
      base = fetchImpl('/app/demo/snapshot.json', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}));
    }
    return base;
  }

  return {
    async snapshot() {
      return buildDemoSnapshot({ base: await loadBase(), startedAt, nowMs: now() });
    },
    /**
     * 読み上げ(live-view-voice.js)にそのまま渡す fetch。/app/demo/voice/index.json にある声を順に、約8秒ごとに1つ返す。
     *   声のファイルが無ければ何も返さない(デモでも読み上げのボタンは動く)。
     */
    async voiceFetch() {
      if (!voiceList) {
        voiceList = fetchImpl('/app/demo/voice/index.json', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : []))
          .then((j) => (Array.isArray(j) ? j.filter((x) => x && typeof x.file === 'string') : []))
          .catch(() => []);
      }
      const list = await voiceList;
      /** @type {{ no: string, ogg: string }[]} */
      const clips = [];
      // 最初の1回は「いま」を覚えるだけ=過去の声は鳴らさない(本物と同じ)。
      const first = !voicePrimed;
      voicePrimed = true;
      if (!first && list.length && now() - lastVoiceAt >= 8_000) {
        const item = list[voiceNo % list.length];
        try {
          const r = await fetchImpl(`/app/demo/voice/${item.file}`);
          if (r.ok) {
            const u8 = new Uint8Array(await r.arrayBuffer());
            let bin = '';
            for (let i = 0; i < u8.length; i += 1) bin += String.fromCharCode(u8[i]);
            voiceNo += 1;
            lastVoiceAt = now();
            clips.push({ no: String(voiceNo), ogg: btoa(bin) });
          }
        } catch {
          /* 声が取れなければ次の回に */
        }
      }
      return { ok: true, json: async () => ({ ok: true, clips }) };
    }
  };
}
