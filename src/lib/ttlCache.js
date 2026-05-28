/**
 * 星野ロミ spotify.ts パターン: TTL 付きインメモリキャッシュ。
 * トークン・アバターURL など期限付きデータの再取得を抑制する。
 *
 * @template V
 * @param {{ ttlMs: number, maxSize?: number }} opts
 */
export function createTtlCache(opts) {
  const ttlMs = Number(opts?.ttlMs) || 60_000;
  const maxSize = Number(opts?.maxSize) || 0;

  /** @type {Map<string, { value: V, expiresAt: number }>} */
  const store = new Map();

  /** @param {string} key */
  function isAlive(key) {
    const entry = store.get(key);
    if (!entry) return false;
    if (Date.now() >= entry.expiresAt) {
      store.delete(key);
      return false;
    }
    return true;
  }

  function evictExpired() {
    for (const [k, v] of store) {
      if (Date.now() >= v.expiresAt) store.delete(k);
    }
  }

  /**
   * @param {string} key
   * @param {V} value
   */
  function set(key, value) {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (maxSize > 0 && store.size > maxSize) {
      // v0.1.356: maxSize 超過時、まず期限切れエントリを掃除する。従来は挿入順最古を
      //   無条件に削っていたため、期限切れの死んだエントリが残っているのに有効なエントリを
      //   優先削除してしまうことがあった。死んでいるものから先に落とす。
      evictExpired();
      if (store.size > maxSize) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
    }
  }

  /**
   * @param {string} key
   * @returns {V|undefined}
   */
  function get(key) {
    if (!isAlive(key)) return undefined;
    return store.get(key)?.value;
  }

  /** @param {string} key */
  function has(key) {
    return isAlive(key);
  }

  function clear() {
    store.clear();
  }

  function size() {
    evictExpired();
    return store.size;
  }

  return { set, get, has, clear, size };
}
