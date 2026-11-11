/**
 * voiceLoadingState.js — VOICEVOX 起動待ちのローディング表示を決める純関数群。
 *
 * 会議(2026-06-16・正本 reference_voice_loading_delight_meeting_2026-06-16.md)の収束案:
 *  - 一瞬成功(<約150ms)のときは演出を出さない(遅延ガード)=チラつき防止。
 *  - 会場(venue)とコメビュ(comeview)で別文言だが、出し分けロジックは共通。
 *  - 失敗時は楽しさを引っ込めて起動案内に切り替える。
 *
 * 実体: 読み上げONで isVoicevoxAlive() を叩く。生きてれば即(<100ms)成功・空に。
 *   起動直後/MV3 SW コールド時は数秒かかる or タイムアウト。終了時刻は予測不能なので
 *   「何%」は出せない=期待感の演出と遅延ガードで対応する。
 */

/** この時間(ms)より早く ready になったら演出を一切描かない(チラつき防止)。 */
export const VOICE_LOADING_FLICKER_GUARD_MS = 180;

/**
 * ローディングの状態。
 *  - checking:   生存確認の1回目(まだ一瞬で終わるかもしれない=遅延ガード対象)
 *  - connecting: 1回目が空振りし再試行中(もう一瞬では終わらない=即演出してよい)
 *  - ready:      成功。演出を消して空にする
 *  - notfound:   見つからない。楽しさを引っ込め起動案内に切り替える
 *  - idle:       何もしていない(初期/OFF)
 * @typedef {'idle'|'checking'|'connecting'|'ready'|'notfound'} VoiceLoadingState
 */

/**
 * 今この瞬間、ローディング演出を画面に描くべきか。
 *
 * - checking は遅延ガード: 経過時間が FLICKER_GUARD_MS 未満なら描かない(一瞬成功でチラつかせない)。
 * - connecting は再試行中=もう一瞬では終わらないので、経過時間に関わらず即描く。
 * - ready / idle / notfound は「楽しい演出」は描かない(notfound は別途エラー表示)。
 *
 * @param {string} state  VoiceLoadingState のいずれか
 * @param {number} elapsedMs  そのローディングを開始してからの経過ミリ秒
 * @returns {boolean}
 */
export function shouldRenderLoading(state, elapsedMs) {
  if (state === 'connecting') return true;
  if (state !== 'checking') return false;
  const e = typeof elapsedMs === 'number' && elapsedMs >= 0 ? elapsedMs : 0;
  return e >= VOICE_LOADING_FLICKER_GUARD_MS;
}

/**
 * 状態と画面種別から、表示すべき文言と種別(演出 or エラー or 空)を返す。
 * 文言だけを返し、アニメーション/CSS は呼び出し側(DOM)が class で当てる。
 *
 * @param {string} state  VoiceLoadingState のいずれか
 * @param {'venue'|'comeview'} surface
 * @param {'timeout'|'refused'|'http-error'|'no-fetch'|''} [reason]
 *   ★v0.1.1326: 失敗理由(probeVoicevoxAlive の戻り)。省略時は従来文言=後方互換。
 * @returns {{ kind: 'hidden'|'loading'|'error', text: string }}
 *   kind=hidden: 何も出さない(空) / loading: 楽しい演出 / error: 起動案内
 */
export function resolveVoiceLoadingView(state, surface, reason) {
  if (state === 'ready' || state === 'idle') return { kind: 'hidden', text: '' };

  if (state === 'notfound') {
    /*
     * ★v0.1.1326: 理由で文言を出し分ける。
     *   ユーザー実機で VOICEVOX 0.25.2 が【起動しているのに】この行が
     *   「VOICEVOXが見つかりません」と出て、ユーザーに「たちあがってるけどね」と
     *   指摘された。起動しているのに応答が無い(timeout)のと、そもそも居ない(refused)
     *   のは打つ手が違うので、同じ文言で済ませてはいけない。
     */
    if (reason === 'timeout') {
      return {
        kind: 'error',
        text: 'VOICEVOXは起動していますが応答がありません(重い処理中かもしれません)'
      };
    }
    if (reason === 'http-error') {
      return {
        kind: 'error',
        text: 'VOICEVOXが応答しましたがエラーでした(バージョンを確認してください)'
      };
    }
    if (reason === 'no-fetch') {
      return {
        kind: 'error',
        text: '拡張の接続が切れています(ページを再読み込みしてください)'
      };
    }
    // refused / 不明 = エンジンに届いていない。ボタンは押したままなので「押し直して」とは言わない。
    return {
      kind: 'error',
      text: 'VOICEVOXにつながっていません'
    };
  }

  // checking / connecting = ローディング演出。connecting は「数秒かかる」兆候を添える。
  const connecting = state === 'connecting';
  if (surface === 'venue') {
    return {
      kind: 'loading',
      text: connecting ? '🎤 ステージ準備中…(起動直後は数秒かかります)' : '🎤 まもなく開演…声の準備中'
    };
  }
  // comeview = 実況の準備(マイクチェック)。
  return {
    kind: 'loading',
    text: connecting ? '🎤 接続中…(起動直後は数秒かかります)' : '🎤 マイクチェック中…'
  };
}

/**
 * VOICEVOX 0.26 の GET /supported_devices から、今の計算モードとして言い切れる範囲。
 * この API は版が cpu / cuda / dml を「使えるか」だけ返す。プロセスが --use_gpu
 * （または環境変数 VV_USE_GPU）で起動しているかは返さない。/version・/engine_manifest・
 * /setting にもその項目は無い。
 * - cuda と dml がどちらも明示の false → GPU を使えない版なので、動いているのは CPU。
 * - どちらかが true → 使えるだけで、今 CPU か GPU かは不明。true を GPU 動作中とは読まない。
 * - 項目が欠けている、形が違う → null。欠けを false と扱って CPU とは言わない。
 * @param {unknown} body
 * @returns {'cpu'|'unknown'|null}
 */
export function voiceEngineModeFromSupportedDevices(body) {
  if (!body || typeof body !== 'object') return null;
  const cuda = /** @type {{ cuda?: unknown, dml?: unknown }} */ (body).cuda;
  const dml = /** @type {{ cuda?: unknown, dml?: unknown }} */ (body).dml;
  if (cuda === true || dml === true) return 'unknown';
  if (cuda === false && dml === false) return 'cpu';
  return null;
}

/**
 * 接続済みのときに出すモード。cpu / gpu / unknown 以外（読めない）は unknown。
 * 未接続の文言はここでは出さない。この関数は gpu を受け取れるが、0.26 の API は gpu を返さない。
 * @param {unknown} info
 * @returns {'cpu'|'gpu'|'unknown'}
 */
export function voiceEngineModeFromProbe(info) {
  const mode = info && typeof info === 'object' ? /** @type {{ mode?: unknown }} */ (info).mode : null;
  if (mode === 'cpu' || mode === 'gpu' || mode === 'unknown') return mode;
  return 'unknown';
}

/**
 * 遅れの案内が使う「GPU を使えるか」。モードの表示とは別。
 * @param {unknown} info
 * @returns {boolean|null}
 */
export function voiceGpuCapableFromProbe(info) {
  const v = info && typeof info === 'object' ? /** @type {{ gpuCapable?: unknown }} */ (info).gpuCapable : null;
  return v === true || v === false ? v : null;
}

/**
 * 接続中の計算モードの一行。色や勧めは付けない。空は「まだ出さない」。
 * @param {'cpu'|'gpu'|'unknown'|null|undefined} mode
 * @returns {string}
 */
export function voiceEngineModeLabel(mode) {
  if (mode === 'cpu') return 'VOICEVOX：CPUで接続中';
  if (mode === 'gpu') return 'VOICEVOX：GPUで接続中';
  if (mode === 'unknown') return 'VOICEVOX：不明';
  return '';
}
