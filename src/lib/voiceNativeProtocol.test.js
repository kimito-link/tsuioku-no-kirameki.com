import { describe,it,expect } from 'vitest';
import { validNativeWav } from './voiceNativeProtocol.js';
function wav(){const b=Buffer.alloc(48);b.write('RIFF');b.writeUInt32LE(40,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(4,40);return b;}
describe('Native PCM WAVの検疫',()=>{
 it('正しいPCM16 monoとHzを受け入れる',()=>expect(validNativeWav(wav(),24000)).toBe(true));
 it.each([4,16,20,22,24,28,32,34,40])('ヘッダの不整合を拒否する: offset %i',offset=>{const b=wav();b[offset]^=1;expect(validNativeWav(b,24000)).toBe(false);});
 it('magicだけ一致する壊れた音声を拒否する',()=>{const b=Buffer.alloc(48);b.write('RIFF');b.write('WAVE',8);expect(validNativeWav(b,24000)).toBe(false);});
 it('依頼したHzと異なる音声を拒否する',()=>expect(validNativeWav(wav(),16000)).toBe(false));
});
