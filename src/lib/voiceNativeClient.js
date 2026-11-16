/**
 * 【層】L2 実行層
 * 【この箱に入るもの】拡張の背景へ補助音声を依頼する任意アダプタ
 * 【この箱に入らないもの】DOM / storageの直接操作 / 外部送信
 * 【書けるstorageキー】なし
 * 【正本宣言】Native音声依頼の呼出側はここで正規化する
 */
import { VOICE_NATIVE_MESSAGES, VOICE_NATIVE_MAX_AUDIO, validNativeWav } from './voiceNativeProtocol.js';
/**
 * @param {unknown} text
 * @param {{styleId?:number,speedOffset?:number,pitchOffset?:number}} voice
 * @param {{sendMessage?:(message:any)=>Promise<any>,sampleRate?:number,signal?:AbortSignal,onFailure?:(info:any)=>void,onTiming?:(timing:any)=>void,onCapacity?:(cap:number)=>void}} [opts]
 */
export async function tryNativeVoiceSynthesis(text,voice,opts={}) {
 /** @type {((message:any)=>Promise<any>)|null} */
 const send=opts.sendMessage || null;
 if(!send)return {available:false};
 /** @param {{complete?:boolean,status?:number,phase?:string,code?:string}} error @returns {{available:true,wav:ArrayBuffer|null}} */
 const fail=(error)=>{
  const code=typeof error.code==='string' && /^[a-z-]{1,40}$/.test(error.code)?error.code:(error.complete?'invalid-response':'disconnected');
  try{opts.onFailure?.({stage:error.phase==='query'?'query':'synth',nativeCode:code,uncertain:error.complete!==true,...(error.complete?{httpStatus:error.status||0,bodyInvalid:!error.status}:{error:new Error(code==='timeout'?'voicevox_timeout':'native-'+code)})});}catch{/* observation only */}
  return {available:true,wav:null};
 };
 if(opts.signal?.aborted)return fail({complete:true,status:499,phase:'query'});
 /** @type {any} */
 let cap;try{cap=await send({type:VOICE_NATIVE_MESSAGES.probe});}catch{return {available:false};}
 if(opts.signal?.aborted)return fail({complete:true,status:499,phase:'query'});
 if(cap?.busy)return fail({complete:true,status:429,phase:'query',code:'engine-busy'});
 if(cap?.available!==true || cap.v!==1 || !Number.isInteger(cap.maxInflight) || cap.maxInflight<1 || cap.maxInflight>24)return {available:false};
 try{opts.onCapacity?.(cap.maxInflight);}catch{/* observation only */}
 const id=globalThis.crypto.randomUUID();
 const abort=()=>{void Promise.resolve(send({type:VOICE_NATIVE_MESSAGES.cancel,id})).catch(()=>{});};
 opts.signal?.addEventListener('abort',abort,{once:true});
 try{
  const result=await send({type:VOICE_NATIVE_MESSAGES.synth,request:{id,text:String(text),speaker:Number.isInteger(voice?.styleId)?voice.styleId:3,sampleRate:opts.sampleRate===24000?24000:16000,speedOffset:Number(voice?.speedOffset)||0,pitchOffset:Number(voice?.pitchOffset)||0}});
  if(result?.busy)return fail({complete:true,status:429,phase:'query',code:'engine-busy'});
  if(result?.available===false && result.notStarted===true)return {available:false}; // 未送信を確認した時だけHTTPへ戻す
  if(result?.available!==true)return fail({complete:false,phase:'synth'});
  if(result.error)return fail(result.error);
  if(!Number.isInteger(result.bytes)||result.bytes<44||result.bytes>VOICE_NATIVE_MAX_AUDIO||typeof result.audioBase64!=='string'||result.audioBase64.length!==Math.ceil(result.bytes/3)*4)return fail({complete:true,phase:'synth'});
  /** @type {Uint8Array} */
  let data;try{const decoded=atob(result.audioBase64);if(decoded.length!==result.bytes)throw Error('length');data=Uint8Array.from(decoded,c=>c.charCodeAt(0));}catch{return fail({complete:true,phase:'synth'});}
  if(!validNativeWav(data,opts.sampleRate===24000?24000:16000))return fail({complete:true,phase:'synth',code:'invalid-audio'});
  try{opts.onTiming?.({queryMs:result.queryMs,synthMs:result.synthMs});}catch{/* observation only */}
  return {available:true,wav:/** @type {ArrayBuffer} */(data.buffer)};
 }catch{return fail({complete:false,phase:'synth'});} // 送信後の通信断で二重に合成を頼まない
 finally{opts.signal?.removeEventListener('abort',abort);}
}
