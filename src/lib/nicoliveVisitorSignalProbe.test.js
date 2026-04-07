import { describe, expect, it } from 'vitest';
import {
  parseVisitorJoinSignal,
  VISITOR_JOIN_SIGNAL_WIRE
} from './nicoliveVisitorSignalProbe.js';

describe('nicoliveVisitorSignalProbe', () => {
  it('ペイロード未確定のためパース結果は null', () => {
    expect(parseVisitorJoinSignal(null)).toBeNull();
    expect(parseVisitorJoinSignal({})).toBeNull();
    expect(parseVisitorJoinSignal(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('配線契約は B2 まで未定（メッセージ型・storage キーは null）', () => {
    expect(VISITOR_JOIN_SIGNAL_WIRE.messageType).toBeNull();
    expect(VISITOR_JOIN_SIGNAL_WIRE.storageKey).toBeNull();
  });
});
