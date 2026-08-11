/**
 * 【層】L0 判定層（純粋関数・I/O禁止）
 * 【この箱に入るもの】失敗トークンの分類・変換・日本語ラベル
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*（import も禁止）
 * 【書けるstorageキー】なし
 * 【正本宣言】読み上げ失敗の値域はこのファイルのみ。他所での文字列リテラル比較は禁止
 */

/** @typedef {'down'|'timeout'|'http'|'payload'|'not_wired'|'unknown'} VoiceFailureCause */
/** @typedef {'probe'|'query'|'synth'} VoiceFailureStage */
/** @typedef {{ cause: VoiceFailureCause, stage: VoiceFailureStage }} VoiceFailure */

/** @type {Readonly<Record<string, VoiceFailure|null>>} */
const ALIVE_FAILURES = Object.freeze({
  'no-fetch': Object.freeze({ cause: 'not_wired', stage: 'probe' }),
  timeout: Object.freeze({ cause: 'timeout', stage: 'probe' }),
  refused: Object.freeze({ cause: 'down', stage: 'probe' }),
  'http-error': Object.freeze({ cause: 'http', stage: 'probe' }),
  '': null
});

/** @type {Readonly<Record<string, VoiceFailure>>} */
const SYNTH_FAILURES = Object.freeze({
  timeout: Object.freeze({ cause: 'timeout', stage: 'synth' }),
  unreachable: Object.freeze({ cause: 'down', stage: 'synth' }),
  query_http: Object.freeze({ cause: 'http', stage: 'query' }),
  query_body: Object.freeze({ cause: 'payload', stage: 'query' }),
  synth_http: Object.freeze({ cause: 'http', stage: 'synth' }),
  synth_body: Object.freeze({ cause: 'payload', stage: 'synth' }),
  unknown: Object.freeze({ cause: 'unknown', stage: 'synth' })
});

/**
 * 生存確認の旧失敗トークンを、原因と段階の2軸へ変換する。
 * @param {unknown} token
 * @returns {VoiceFailure|null}
 */
export function fromAliveFailure(token) {
  const key = String(token ?? '');
  if (Object.prototype.hasOwnProperty.call(ALIVE_FAILURES, key)) {
    return ALIVE_FAILURES[key];
  }
  return Object.freeze({ cause: 'unknown', stage: 'probe' });
}

/**
 * 音声合成の旧失敗トークンを、原因と段階の2軸へ変換する。
 * @param {unknown} token
 * @returns {VoiceFailure}
 */
export function fromSynthFailure(token) {
  const key = String(token ?? '');
  return SYNTH_FAILURES[key] || SYNTH_FAILURES.unknown;
}

/**
 * 2軸へ正規化した失敗を、人が読む日本語ラベルへ変換する。
 * @param {VoiceFailure|null|undefined} failure
 * @returns {string}
 */
export function canonicalLabel(failure) {
  if (!failure) return '';
  const cause = String(failure.cause || '');
  const stage = String(failure.stage || '');

  if (stage === 'probe') {
    if (cause === 'not_wired') return '拡張の通信経路が切れている(ページ再読み込みが必要)';
    if (cause === 'timeout') return 'VOICEVOXが応答しない(起動はしている)';
    if (cause === 'down') return 'VOICEVOXに接続できない(未起動の可能性)';
    if (cause === 'http') return 'VOICEVOXがエラーを返した';
    if (cause === 'payload') return 'VOICEVOXの接続確認応答が不正';
    return 'VOICEVOXの接続確認に失敗(理由不明)';
  }

  if (stage === 'query') {
    if (cause === 'timeout') return '音声解析が時間切れ';
    if (cause === 'down') return '音声解析時にVOICEVOXへ接続できない';
    if (cause === 'http') return '音声解析がエラーを返した';
    if (cause === 'payload') return '音声解析の応答が不正';
    if (cause === 'not_wired') return '音声解析の通信経路が切れている';
    return '音声解析に失敗(理由不明)';
  }

  if (stage === 'synth') {
    if (cause === 'timeout') return '音声合成が時間切れ';
    if (cause === 'down') return '音声合成時にVOICEVOXへ接続できない';
    if (cause === 'http') return '音声合成がエラーを返した';
    if (cause === 'payload') return '音声の受信に失敗';
    if (cause === 'not_wired') return '音声合成の通信経路が切れている';
    return '音声合成に失敗(理由不明)';
  }

  return '読み上げ失敗(理由不明)';
}
