/**
 * 【層】L0 判定層
 * 【この箱に入るもの】ローカル補助音声の通信仕様と上限
 * 【この箱に入らないもの】chrome API / fetch / DOM
 * 【書けるstorageキー】なし
 * 【正本宣言】補助音声プロトコルv1と上限はここで定義する
 */
export const VOICE_NATIVE_HOST = 'com.kimitolink.voice_bridge';
export const VOICE_NATIVE_VERSION = 1;
export const VOICE_NATIVE_MAX_AUDIO = 2097152;
export const VOICE_NATIVE_MAX_PENDING = 32;
export const VOICE_NATIVE_MAX_INFLIGHT = 24;
export const VOICE_NATIVE_MESSAGES = Object.freeze({ probe:'nls:voice:native:probe', synth:'nls:voice:native:synth', cancel:'nls:voice:native:cancel' });
/** @param {unknown} id @returns {id is string} */
export const validNativeId = id => typeof id === 'string' && /^[a-zA-Z0-9_.:-]{1,64}$/.test(id);
/** @param {any} r */
export const validNativeRequest = r => !!r && typeof r === 'object' && validNativeId(r.id) && typeof r.text === 'string' && r.text.trim().length > 0 && r.text.length <= 512
  && Number.isInteger(r.speaker) && r.speaker >= 0 && r.speaker <= 100000
  && [16000,24000].includes(r.sampleRate) && Number.isFinite(r.speedOffset) && r.speedOffset >= -0.5 && r.speedOffset <= 2
  && Number.isFinite(r.pitchOffset) && r.pitchOffset >= -0.3 && r.pitchOffset <= 0.3;
/** @param {unknown} value */
export function nativeBase64Size(value) {
 if(typeof value !== 'string' || value.length > 65536 || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))return -1;
 return value.length / 4 * 3 - (value.endsWith('==')?2:value.endsWith('=')?1:0);
}

/** Native v1 returns whole mono PCM16 WAVs, with bounded RIFF chunks.
 * @param {Uint8Array} bytes @param {number} sampleRate
 */
export function validNativeWav(bytes,sampleRate) {
 if(bytes.length<44 || bytes.length>VOICE_NATIVE_MAX_AUDIO)return false;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const tag=(/** @type {number} */ offset)=>String.fromCharCode(...bytes.subarray(offset,offset+4));
 if(tag(0)!=='RIFF'||tag(8)!=='WAVE'||view.getUint32(4,true)!==bytes.length-8)return false;
 let offset=12,format=false,audio=false;
 while(offset+8<=bytes.length){
  const size=view.getUint32(offset+4,true),start=offset+8,end=start+size;
  if(end>bytes.length || end+(size%2)>bytes.length)return false;
  if(tag(offset)==='fmt '){
   if(format||size<16||view.getUint16(start,true)!==1||view.getUint16(start+2,true)!==1||view.getUint32(start+4,true)!==sampleRate||view.getUint32(start+8,true)!==sampleRate*2||view.getUint16(start+12,true)!==2||view.getUint16(start+14,true)!==16)return false;
   format=true;
  }else if(tag(offset)==='data'){if(audio||size<2||size%2)return false;audio=true;}
  offset=end+(size%2);
 }
 return offset===bytes.length && format && audio;
}
