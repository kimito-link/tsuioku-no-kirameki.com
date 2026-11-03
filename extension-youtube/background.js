// background.js — YouTube Live コメントのローカル記録・読み上げキュー管理バンドル
/* eslint-disable */
(() => {
  // src/lib/voiceAssignment.js
  var DEFAULT_VOICE = Object.freeze({
    styleId: 3,
    pitchOffset: 0,
    speedOffset: 0
  });
  var PITCH_OFFSETS = Object.freeze([-0.06, -0.03, 0, 0.03, 0.06]);
  var SPEED_OFFSETS = Object.freeze([0, 0.05, 0.1]);
  function fnv1a32(value) {
    const bytes = new TextEncoder().encode(String(value ?? ""));
    let hash = 2166136261;
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function normalizeStyleIds(styleIds) {
    if (!Array.isArray(styleIds)) return [];
    return styleIds.map((styleId) => Number(styleId)).filter((styleId) => Number.isInteger(styleId) && styleId >= 0);
  }
  function assignVoiceForUser(userKey, styleIds) {
    const styles = normalizeStyleIds(styleIds);
    if (!styles.length) return { ...DEFAULT_VOICE };
    const hash = fnv1a32(userKey);
    const styleBits = hash & 65535;
    const pitchBits = hash >>> 16 & 255;
    const speedBits = hash >>> 24 & 255;
    return {
      styleId: styles[styleBits % styles.length],
      pitchOffset: PITCH_OFFSETS[pitchBits % PITCH_OFFSETS.length],
      speedOffset: SPEED_OFFSETS[speedBits % SPEED_OFFSETS.length]
    };
  }
  function resolveVoiceForUser(userKey, overrides, styleIds) {
    const key = String(userKey ?? "");
    if (overrides && typeof overrides === "object" && Object.prototype.hasOwnProperty.call(overrides, key)) {
      const raw = (
        /** @type {Record<string, any>} */
        overrides[key]
      );
      if (raw && typeof raw === "object") {
        const fallback = assignVoiceForUser(key, styleIds);
        const styleId = Number(raw.styleId);
        const pitchOffset = Number(raw.pitchOffset);
        const speedOffset = Number(raw.speedOffset);
        return {
          styleId: Number.isFinite(styleId) ? styleId : fallback.styleId,
          pitchOffset: Number.isFinite(pitchOffset) ? pitchOffset : 0,
          speedOffset: Number.isFinite(speedOffset) ? speedOffset : 0
        };
      }
    }
    return assignVoiceForUser(key, styleIds);
  }

  // src/lib/voiceNarrowing.js
  var VOICE_NARROW_STYLE_IDS = Object.freeze([3, 2, 8, 10, 13, 14]);
  var VOICE_CAPPED_STYLE_IDS = Object.freeze([3, 2, 8, 10, 13, 14, 11, 21, 20, 46, 0, 4, 6, 1, 7, 5, 81, 82, 83, 84, 85, 66, 77, 78, 79, 80]);
  var VOICE_NARROW_MODES = Object.freeze(["off", "auto", "on"]);

  // src/lib/youtube/ytVoiceQueue.js
  var YT_VOICE_MODES = Object.freeze({
    ALL: "all",
    SELECT: "select"
  });
  var YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD = 8;
  var YT_VOICE_MAX_QUEUE_LENGTH = 25;
  var YT_DEFAULT_STYLE_IDS = VOICE_CAPPED_STYLE_IDS;
  function buildYtVoiceUserKey(channelId) {
    const clean = String(channelId || "").trim() || "anonymous";
    return clean.startsWith("yt:") ? clean : `yt:${clean}`;
  }
  function resolveYtVoiceForChannel(channelId, opts = {}) {
    const userKey = buildYtVoiceUserKey(channelId);
    const availableStyleIds = Array.isArray(opts.availableStyleIds) && opts.availableStyleIds.length > 0 ? opts.availableStyleIds : Array.from(YT_DEFAULT_STYLE_IDS);
    const currentMap = opts.assignments && typeof opts.assignments === "object" ? opts.assignments : {};
    const reused = Object.prototype.hasOwnProperty.call(currentMap, userKey);
    const res = resolveVoiceForUser(userKey, currentMap, availableStyleIds);
    const nextAssignments = reused ? currentMap : {
      ...currentMap,
      [userKey]: {
        styleId: res.styleId,
        pitchOffset: res.pitchOffset,
        speedOffset: res.speedOffset
      }
    };
    return {
      userKey,
      styleId: res.styleId,
      pitchOffset: res.pitchOffset,
      speedOffset: res.speedOffset,
      assignments: nextAssignments,
      reused
    };
  }
  function shouldReadYtComment(item, opts = {}) {
    if (!item || typeof item !== "object") return false;
    const kind = String(item.kind || "text").toLowerCase();
    const text = String(item.text || "").trim();
    const isSupportEvent = kind === "superchat" || kind === "sticker" || kind === "membership" || kind === "membership_gift";
    if (!text && !isSupportEvent) return false;
    const mode = opts.mode === YT_VOICE_MODES.SELECT ? YT_VOICE_MODES.SELECT : YT_VOICE_MODES.ALL;
    if (mode === YT_VOICE_MODES.ALL) {
      return true;
    }
    if (isSupportEvent) return true;
    const badges = Array.isArray(item.badges) ? item.badges.map((b) => String(b || "").toLowerCase()) : [];
    if (badges.includes("owner") || badges.includes("moderator") || badges.includes("member")) {
      return true;
    }
    const broadcasterName = String(opts.broadcasterName || "").trim();
    if (broadcasterName && text.toLowerCase().includes(broadcasterName.toLowerCase())) {
      return true;
    }
    return false;
  }
  function formatYtSpeechText(item) {
    if (!item || typeof item !== "object") return "";
    const kind = String(item.kind || "text").toLowerCase();
    const name = String(item.name || "").replace(/^@/, "").trim();
    const rawText = String(item.text || "").replace(/https?:\/\/\S+/g, "URL").replace(/\s+/g, " ").trim();
    const body = rawText.length > 100 ? `${rawText.slice(0, 100)}、以下略` : rawText;
    if (kind === "superchat") {
      const prefix = name ? `${name}さん、スーパーチャットありがとうございます。` : "スーパーチャットありがとうございます。";
      return body ? `${prefix}${body}` : prefix;
    }
    if (kind === "sticker") {
      return name ? `${name}さん、スーパーステッカーありがとうございます。` : "スーパーステッカーありがとうございます。";
    }
    if (kind === "membership") {
      return name ? `${name}さん、メンバー加入ありがとうございます。${body}` : body || "メンバー加入ありがとうございます。";
    }
    if (kind === "membership_gift") {
      return name ? `${name}さん、メンバーシップギフトありがとうございます。` : body || "メンバーシップギフトありがとうございます。";
    }
    return body;
  }
  function enqueueYtVoiceItem(queue, item, opts = {}) {
    const safeQueue = Array.isArray(queue) ? queue.slice() : [];
    const requestedMode = opts.mode === YT_VOICE_MODES.SELECT ? YT_VOICE_MODES.SELECT : YT_VOICE_MODES.ALL;
    const threshold = typeof opts.autoSelectThreshold === "number" && opts.autoSelectThreshold > 0 ? opts.autoSelectThreshold : YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD;
    const autoSwitched = requestedMode === YT_VOICE_MODES.ALL && safeQueue.length >= threshold;
    const effectiveMode = autoSwitched ? YT_VOICE_MODES.SELECT : requestedMode;
    const currentAssignments = opts.assignments || {};
    if (!shouldReadYtComment(item, { mode: effectiveMode, broadcasterName: opts.broadcasterName })) {
      return {
        queue: safeQueue,
        enqueued: false,
        entry: null,
        effectiveMode,
        autoSwitched,
        assignments: currentAssignments
      };
    }
    const speechText = formatYtSpeechText(item);
    if (!speechText) {
      return {
        queue: safeQueue,
        enqueued: false,
        entry: null,
        effectiveMode,
        autoSwitched,
        assignments: currentAssignments
      };
    }
    const channelKeySource = String(item?.channelId || item?.name || "anonymous");
    const voice = resolveYtVoiceForChannel(channelKeySource, {
      availableStyleIds: opts.availableStyleIds,
      assignments: currentAssignments,
      now: opts.now
    });
    const entry = {
      id: String(item.id || `voice-${Date.now()}`),
      userKey: voice.userKey,
      channelId: String(item.channelId || ""),
      name: String(item.name || ""),
      text: speechText,
      styleId: voice.styleId,
      kind: String(item.kind || "text"),
      ts: Number(item.ts || Date.now())
    };
    const nextQueue = [...safeQueue, entry];
    if (nextQueue.length > YT_VOICE_MAX_QUEUE_LENGTH) {
      nextQueue.splice(0, nextQueue.length - YT_VOICE_MAX_QUEUE_LENGTH);
    }
    return {
      queue: nextQueue,
      enqueued: true,
      entry,
      effectiveMode,
      autoSwitched,
      assignments: voice.assignments
    };
  }

  // extension-youtube/src/background-entry.js
  var MAX_ITEMS_PER_STREAM = 1500;
  var STORAGE_KEYS = Object.freeze({
    STREAMS: "yt_streams",
    ACTIVE_VIDEO_ID: "yt_active_video_id",
    VOICE_SETTINGS: "yt_voice_settings",
    VOICE_ASSIGNMENTS: "yt_voice_assignments",
    VOICE_QUEUE: "yt_voice_queue",
    VOICE_STATE: "yt_voice_state"
  });
  var DEFAULT_VOICE_SETTINGS = Object.freeze({
    enabled: true,
    mode: YT_VOICE_MODES.ALL,
    broadcasterNameOverride: "",
    availableStyleIds: Array.from(YT_DEFAULT_STYLE_IDS)
  });
  var storageJobChain = Promise.resolve();
  function runSerialized(fn) {
    const next = storageJobChain.then(fn, fn);
    storageJobChain = next.then(
      () => void 0,
      () => void 0
    );
    return next;
  }
  function extractVideoIdFromSender(sender) {
    try {
      const tabUrl = sender?.tab?.url || "";
      if (!tabUrl) return "";
      const u = new URL(tabUrl);
      return (u.searchParams.get("v") || "").trim();
    } catch {
      return "";
    }
  }
  function trimStreamItems(items) {
    if (!Array.isArray(items) || items.length <= MAX_ITEMS_PER_STREAM) {
      return items || [];
    }
    const excess = items.length - MAX_ITEMS_PER_STREAM;
    let removed = 0;
    return items.filter((item) => {
      if (removed >= excess) return true;
      const isSupport = item.kind === "superchat" || item.kind === "sticker" || item.kind === "membership" || item.kind === "membership_gift";
      if (isSupport) return true;
      removed += 1;
      return false;
    });
  }
  function setupSidePanelBehavior() {
    try {
      if (chrome?.sidePanel?.setPanelBehavior) {
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
        });
      }
    } catch {
    }
  }
  setupSidePanelBehavior();
  chrome.runtime.onInstalled.addListener(() => {
    setupSidePanelBehavior();
  });
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;
    if (message.type === "YT_STREAM_META") {
      runSerialized(async () => {
        const payload = message.payload || {};
        const videoId = String(payload.videoId || extractVideoIdFromSender(sender) || "").trim();
        if (!videoId) return { ok: false };
        const data = await chrome.storage.local.get([
          STORAGE_KEYS.STREAMS,
          STORAGE_KEYS.ACTIVE_VIDEO_ID
        ]);
        const streams = data[STORAGE_KEYS.STREAMS] || {};
        const current = streams[videoId] || {
          videoId,
          title: "",
          broadcasterName: "",
          broadcasterChannelId: "",
          chatFilterLabel: "",
          items: [],
          updatedAt: Date.now()
        };
        if (payload.title) current.title = String(payload.title);
        if (payload.broadcasterName) current.broadcasterName = String(payload.broadcasterName);
        if (payload.broadcasterChannelId) {
          current.broadcasterChannelId = String(payload.broadcasterChannelId);
        }
        current.updatedAt = Date.now();
        streams[videoId] = current;
        await chrome.storage.local.set({
          [STORAGE_KEYS.STREAMS]: streams,
          [STORAGE_KEYS.ACTIVE_VIDEO_ID]: videoId
        });
        return { ok: true, videoId };
      }).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message.type === "YT_CHAT_ITEMS") {
      runSerialized(async () => {
        const payload = message.payload || {};
        const videoId = String(payload.videoId || extractVideoIdFromSender(sender) || "").trim() || "live_default";
        const incoming = Array.isArray(payload.items) ? payload.items : [];
        const chatFilterLabel = String(payload.chatFilterLabel || "").trim();
        const data = await chrome.storage.local.get([
          STORAGE_KEYS.STREAMS,
          STORAGE_KEYS.ACTIVE_VIDEO_ID,
          STORAGE_KEYS.VOICE_SETTINGS,
          STORAGE_KEYS.VOICE_ASSIGNMENTS,
          STORAGE_KEYS.VOICE_QUEUE,
          STORAGE_KEYS.VOICE_STATE
        ]);
        const streams = data[STORAGE_KEYS.STREAMS] || {};
        const stream = streams[videoId] || {
          videoId,
          title: "",
          broadcasterName: "",
          broadcasterChannelId: "",
          chatFilterLabel: "",
          items: [],
          updatedAt: Date.now()
        };
        if (chatFilterLabel) {
          stream.chatFilterLabel = chatFilterLabel;
        }
        const settings = {
          ...DEFAULT_VOICE_SETTINGS,
          ...data[STORAGE_KEYS.VOICE_SETTINGS] || {}
        };
        let assignments = data[STORAGE_KEYS.VOICE_ASSIGNMENTS] || {};
        let voiceQueue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE]) ? data[STORAGE_KEYS.VOICE_QUEUE] : [];
        let voiceState = data[STORAGE_KEYS.VOICE_STATE] || {
          effectiveMode: settings.mode,
          autoSwitched: false,
          updatedAt: Date.now()
        };
        const existingIds = new Set(stream.items.map((x) => x.id));
        const broadcasterName = String(settings.broadcasterNameOverride || "").trim() || String(stream.broadcasterName || "").trim();
        let addedCount = 0;
        for (const rawItem of incoming) {
          if (!rawItem || !rawItem.id || existingIds.has(rawItem.id)) continue;
          existingIds.add(rawItem.id);
          const voice = resolveYtVoiceForChannel(rawItem.channelId || rawItem.name || "anonymous", {
            availableStyleIds: settings.availableStyleIds,
            assignments
          });
          assignments = voice.assignments;
          const enrichedItem = {
            ...rawItem,
            voiceUserKey: voice.userKey,
            voiceStyleId: voice.styleId,
            pitchOffset: voice.pitchOffset,
            speedOffset: voice.speedOffset,
            recordedAt: Date.now()
          };
          stream.items.push(enrichedItem);
          addedCount += 1;
          if (settings.enabled) {
            const enq = enqueueYtVoiceItem(voiceQueue, enrichedItem, {
              mode: settings.mode,
              broadcasterName,
              availableStyleIds: settings.availableStyleIds,
              assignments
            });
            voiceQueue = enq.queue;
            assignments = enq.assignments;
            voiceState = {
              effectiveMode: enq.effectiveMode,
              autoSwitched: enq.autoSwitched,
              updatedAt: Date.now()
            };
          }
        }
        stream.items = trimStreamItems(stream.items);
        stream.updatedAt = Date.now();
        streams[videoId] = stream;
        const updates = {
          [STORAGE_KEYS.STREAMS]: streams,
          [STORAGE_KEYS.VOICE_ASSIGNMENTS]: assignments,
          [STORAGE_KEYS.VOICE_QUEUE]: voiceQueue,
          [STORAGE_KEYS.VOICE_STATE]: voiceState
        };
        if (videoId !== "live_default" || !data[STORAGE_KEYS.ACTIVE_VIDEO_ID]) {
          updates[STORAGE_KEYS.ACTIVE_VIDEO_ID] = videoId;
        }
        await chrome.storage.local.set(updates);
        return { ok: true, addedCount, totalCount: stream.items.length, videoId };
      }).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message.type === "YT_SHIFT_VOICE_QUEUE") {
      runSerialized(async () => {
        const data = await chrome.storage.local.get([STORAGE_KEYS.VOICE_QUEUE]);
        const queue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE]) ? data[STORAGE_KEYS.VOICE_QUEUE] : [];
        if (queue.length === 0) {
          return { ok: true, entry: null, remaining: 0 };
        }
        const [entry, ...rest] = queue;
        await chrome.storage.local.set({ [STORAGE_KEYS.VOICE_QUEUE]: rest });
        return { ok: true, entry, remaining: rest.length };
      }).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message.type === "YT_UPDATE_VOICE_SETTINGS") {
      runSerialized(async () => {
        const patch = message.payload || {};
        const data = await chrome.storage.local.get([
          STORAGE_KEYS.VOICE_SETTINGS,
          STORAGE_KEYS.VOICE_QUEUE
        ]);
        const current = {
          ...DEFAULT_VOICE_SETTINGS,
          ...data[STORAGE_KEYS.VOICE_SETTINGS] || {}
        };
        const next = {
          ...current,
          ...patch
        };
        const queue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE]) ? data[STORAGE_KEYS.VOICE_QUEUE] : [];
        const nextQueue = next.enabled === false ? [] : queue;
        const isOverThreshold = next.enabled !== false && next.mode === YT_VOICE_MODES.ALL && nextQueue.length >= YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD;
        const updates = {
          [STORAGE_KEYS.VOICE_SETTINGS]: next,
          [STORAGE_KEYS.VOICE_STATE]: {
            effectiveMode: isOverThreshold ? YT_VOICE_MODES.SELECT : next.mode,
            autoSwitched: isOverThreshold,
            updatedAt: Date.now()
          }
        };
        if (next.enabled === false) {
          updates[STORAGE_KEYS.VOICE_QUEUE] = [];
        }
        await chrome.storage.local.set(updates);
        return { ok: true, settings: next };
      }).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message.type === "YT_CLEAR_VOICE_QUEUE") {
      runSerialized(async () => {
        const data = await chrome.storage.local.get([STORAGE_KEYS.VOICE_SETTINGS]);
        const settings = {
          ...DEFAULT_VOICE_SETTINGS,
          ...data[STORAGE_KEYS.VOICE_SETTINGS] || {}
        };
        await chrome.storage.local.set({
          [STORAGE_KEYS.VOICE_QUEUE]: [],
          [STORAGE_KEYS.VOICE_STATE]: {
            effectiveMode: settings.mode,
            autoSwitched: false,
            updatedAt: Date.now()
          }
        });
        return { ok: true };
      }).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    return false;
  });
})();
