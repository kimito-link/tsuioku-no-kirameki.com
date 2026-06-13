import { buildVoiceReadingText, buildMergedVoiceText } from './voicevoxClient.js';
import { isVoiceItemStale } from './voiceAgeGate.js';
import {
  computeVoiceCongestion,
  isVoicePrefetchUsable,
  mergeRepeatedVoiceItem,
  pushVoiceQueue
} from './voiceReadQueue.js';

export class VoicePlayer {
  constructor(deps = {}) {
    this.storage = deps.storage;
    this.onToggle = deps.onToggle || (() => {});
    this.onStatus = deps.onStatus || (() => {});
    this.onSkip = deps.onSkip || (() => {});
    this.isObsMode = deps.isObsMode || (() => false);
    this.audioConstructor = deps.audioConstructor;
    this.createObjectURL = deps.createObjectURL;
    this.revokeObjectURL = deps.revokeObjectURL;
    this.fetchVoicevoxAlive = deps.fetchVoicevoxAlive;
    this.fetchVoiceStyleIds = deps.fetchVoiceStyleIds;
    this.fetchSynthesizeVoice = deps.fetchSynthesizeVoice;
    this.resolveVoice = deps.resolveVoice;

    this.enabled = false;
    this.readNameEnabled = false;
    this.toggleBusy = false;
    this.styleIds = [];
    this.assignments = {};
    this.queue = [];
    this.prefetch = null;
    this.playing = false;
    this.generation = 0;
    this.stopCurrent = null;
    this.skipTimer = null;
  }

  get VOICE_READING_ENABLED_KEY() { return 'nls_voice_reading_enabled_v1'; }
  get VOICE_ASSIGNMENTS_KEY() { return 'nls_voice_assignments_v1'; }
  get VOICE_READ_NAME_KEY() { return 'nls_voice_read_name_enabled_v1'; }

  async initialize() {
    if (this.isObsMode()) return;
    let bag = {};
    try {
      if (this.storage) {
        bag = await this.storage.get([
          this.VOICE_READING_ENABLED_KEY,
          this.VOICE_ASSIGNMENTS_KEY,
          this.VOICE_READ_NAME_KEY
        ]);
      }
    } catch {
      bag = {};
    }
    const rawAssignments = bag[this.VOICE_ASSIGNMENTS_KEY];
    this.assignments = (!rawAssignments || typeof rawAssignments !== 'object' || Array.isArray(rawAssignments)) ? {} : rawAssignments;
    this.readNameEnabled = bag[this.VOICE_READ_NAME_KEY] === true;
    
    this._emitToggle();

    if (bag[this.VOICE_READING_ENABLED_KEY] === true) {
      await this.enable({ persist: false });
    }
  }

  _emitToggle() {
    this.onToggle(this.enabled, this.readNameEnabled, this.toggleBusy);
  }

  _showSkipped(count) {
    if (count <= 0) return;
    this.onSkip(count);
  }

  stop() {
    this.queue = [];
    this.generation += 1;
    this.prefetch = null;
    if (typeof this.stopCurrent === 'function') this.stopCurrent();
    this.stopCurrent = null;
  }

  disable({ persist = true } = {}) {
    this.enabled = false;
    this.toggleBusy = false;
    this.stop();
    this._emitToggle();
    if (persist && this.storage) {
      this.storage.set({ [this.VOICE_READING_ENABLED_KEY]: false }).catch(() => {});
    }
  }

  async enable({ persist = true } = {}) {
    if (this.isObsMode() || this.toggleBusy) return;
    this.toggleBusy = true;
    this._emitToggle();
    this.onStatus('VOICEVOXを確認中…');
    
    const alive = await this.fetchVoicevoxAlive();
    if (!alive) {
      this.disable({ persist: true });
      this.onStatus('VOICEVOXが見つかりません(起動してください)');
      return;
    }

    this.styleIds = await this.fetchVoiceStyleIds();
    this.generation += 1;
    this.enabled = true;
    this.toggleBusy = false;
    this.onStatus('');
    this._emitToggle();
    if (persist && this.storage) {
      this.storage.set({ [this.VOICE_READING_ENABLED_KEY]: true }).catch(() => {});
    }
  }

  _voiceUserKeyForItem(item) {
    const userId = String(item?.userId || '').trim();
    const name = String(item?.nickname || '').trim();
    const key = String(item?.userKey || item?.key || '').trim();
    return userId || key || name || 'anon';
  }

  _startPrefetch(generation) {
    const next = this.queue[0];
    if (!next || generation !== this.generation) {
      this.prefetch = null;
      return;
    }
    const congestion = computeVoiceCongestion(this.queue.length);
    const assigned = this.resolveVoice(next.userKey, this.assignments, this.styleIds);
    this.prefetch = {
      item: next,
      generation,
      promise: this.fetchSynthesizeVoice(
        buildMergedVoiceText(next, { maxChars: congestion.maxChars }),
        {
          ...assigned,
          speedOffset: assigned.speedOffset + congestion.speedBoost
        }
      ).catch(() => null)
    };
  }

  async _drainQueue() {
    if (this.playing || !this.enabled || this.isObsMode()) return;
    this.playing = true;
    try {
      while (this.enabled && this.queue.length) {
        const now = Date.now();
        let allStale = true;
        for (const qItem of this.queue) {
          if (!isVoiceItemStale(qItem.enqueuedAt, now, this.queue.length, qItem.priority === 'high').stale) {
            allStale = false;
            break;
          }
        }
        if (allStale && this.queue.length > 0) {
          const dropCount = this.queue.length;
          this.queue = [];
          this._showSkipped(dropCount);
          break;
        }

        const queueLength = this.queue.length;
        const item = this.queue.shift();
        if (!item) continue;

        const ageCheck = isVoiceItemStale(item.enqueuedAt, Date.now(), queueLength, item.priority === 'high');
        if (ageCheck.stale) {
          this._showSkipped(1);
          if (this.prefetch && this.prefetch.item === item) {
            this.prefetch = null;
          }
          continue;
        }

        const generation = this.generation;
        const congestion = computeVoiceCongestion(queueLength);
        const assigned = this.resolveVoice(item.userKey, this.assignments, this.styleIds);
        
        const pf = this.prefetch;
        this.prefetch = null;
        
        const wav = isVoicePrefetchUsable(pf, item, generation)
          ? await pf.promise
          : await this.fetchSynthesizeVoice(
              buildMergedVoiceText(item, { maxChars: congestion.maxChars }),
              {
                ...assigned,
                speedOffset: assigned.speedOffset + congestion.speedBoost
              }
            );

        if (!wav || !this.enabled || generation !== this.generation || this.isObsMode()) {
          continue;
        }

        this._startPrefetch(generation);
        
        let objectUrl = '';
        try {
          const blob = new Blob([wav], { type: 'audio/wav' });
          objectUrl = this.createObjectURL(blob);
          const AudioCtor = this.audioConstructor;
          const audio = new AudioCtor(objectUrl);
          
          await new Promise((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
              audio.removeEventListener('ended', finish);
              audio.removeEventListener('error', finish);
              if (objectUrl) this.revokeObjectURL(objectUrl);
              objectUrl = '';
              this.stopCurrent = null;
              resolve();
            };
            this.stopCurrent = () => {
              try { audio.pause(); } catch { /* no-op */ }
              finish();
            };
            audio.addEventListener('ended', finish, { once: true });
            audio.addEventListener('error', finish, { once: true });
            try {
              const playResult = audio.play();
              if (playResult && typeof playResult.catch === 'function') {
                playResult.catch(finish);
              }
            } catch {
              finish();
            }
          });
        } catch {
          if (objectUrl) this.revokeObjectURL(objectUrl);
        }
      }
    } finally {
      this.playing = false;
      if (this.enabled && this.queue.length) void this._drainQueue();
    }
  }

  enqueue(items) {
    if (!this.enabled || this.isObsMode() || !Array.isArray(items)) return;
    let droppedCount = 0;
    for (const item of items) {
      if (!item || (item.kind !== 'comment' && item.kind !== 'gift')) continue;
      
      const name = this.readNameEnabled ? String(item.nickname || '').trim() : '';
      let body = '';
      let isHighPriority = false;
      
      if (item.kind === 'gift') {
        isHighPriority = true;
        const count = item.gift?.count > 1 ? `を${item.gift.count}個` : 'を';
        body = `ギフト、${item.gift?.name || 'アイテム'}${count}贈りました。${item.gift?.message || ''}`.trim();
      } else {
        body = String(item.text || '').trim();
      }

      if (!buildVoiceReadingText({ name, text: body })) continue;
      
      const candidate = {
        userKey: this._voiceUserKeyForItem(item),
        name,
        body,
        count: 1,
        enqueuedAt: Date.now(),
        priority: isHighPriority ? 'high' : 'normal'
      };
      
      const merged = mergeRepeatedVoiceItem(this.queue, candidate);
      this.queue = merged.queue;
      if (merged.merged) continue;
      
      const pushed = pushVoiceQueue(this.queue, candidate, { max: 12 });
      this.queue = pushed.queue;
      droppedCount += pushed.dropped.length;
    }
    
    if (droppedCount > 0) this._showSkipped(droppedCount);
    if (this.queue.length) void this._drainQueue();
  }
}
