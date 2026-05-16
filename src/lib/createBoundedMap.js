/**
 * @typedef {'fifo'|'lru'} BoundedMapPolicy
 * @typedef {{policy?:BoundedMapPolicy, mode?:BoundedMapPolicy}} BoundedMapOptions
 */

/**
 * @param {number} cap
 * @param {string} name
 * @returns {number}
 */
function normalizeBoundedMapCap(cap, name) {
  const normalized = Number(cap);
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new RangeError(`${name || 'boundedMap'} cap must be a positive number`);
  }
  return Math.floor(normalized);
}

/**
 * @param {BoundedMapOptions|undefined} options
 * @returns {BoundedMapPolicy}
 */
function normalizeBoundedMapPolicy(options) {
  const policy = String(options?.policy || options?.mode || 'fifo').toLowerCase();
  if (policy !== 'fifo' && policy !== 'lru') {
    throw new RangeError(`boundedMap policy must be "fifo" or "lru": ${policy}`);
  }
  return /** @type {BoundedMapPolicy} */ (policy);
}

class BoundedMap extends Map {
  /**
   * @param {number} cap
   * @param {string} name
   * @param {BoundedMapOptions|undefined} options
   */
  constructor(cap, name, options) {
    super();
    /** @type {number} */
    this.cap = normalizeBoundedMapCap(cap, name);
    /** @type {string} */
    this.name = name || 'boundedMap';
    /** @type {BoundedMapPolicy} */
    this.policy = normalizeBoundedMapPolicy(options);
  }

  /** @param {unknown} key */
  get(key) {
    if (this.policy !== 'lru' || !super.has(key)) return super.get(key);
    const value = super.get(key);
    super.delete(key);
    super.set(key, value);
    return value;
  }

  /**
   * @param {unknown} key
   * @param {unknown} value
   * @returns {this}
   */
  set(key, value) {
    if (this.policy === 'lru' && super.has(key)) {
      super.delete(key);
    }
    super.set(key, value);
    while (this.size > this.cap) {
      const oldest = this.keys().next();
      if (oldest.done) break;
      super.delete(oldest.value);
    }
    return this;
  }
}

/**
 * 長時間運用の popup 内で増え続けるキャッシュ向けの Map ファクトリ。
 * FIFO は挿入順、LRU は get/set されたキーを残す。
 *
 * @template K,V
 * @param {number} cap
 * @param {string} name
 * @param {{policy?:'fifo'|'lru', mode?:'fifo'|'lru'}=} options
 * @returns {Map<K,V> & {cap:number, name:string, policy:'fifo'|'lru'}}
 */
export function createBoundedMap(cap, name, options = undefined) {
  return /** @type {Map<K,V> & {cap:number, name:string, policy:'fifo'|'lru'}} */ (
    /** @type {unknown} */ (new BoundedMap(cap, name, options))
  );
}
