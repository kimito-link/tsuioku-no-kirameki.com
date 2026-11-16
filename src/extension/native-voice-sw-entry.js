import { createVoiceNativeBroker } from '../lib/voiceNativeBroker.js';
import { VOICE_NATIVE_HOST,VOICE_NATIVE_MESSAGES } from '../lib/voiceNativeProtocol.js';
import { KEY_VOICE_NATIVE_ENABLED } from '../lib/voiceKeys.js';
const broker=createVoiceNativeBroker({connect:()=>chrome.runtime.connectNative(VOICE_NATIVE_HOST),getLastError:()=>chrome.runtime.lastError});
async function enabled(){try{const [p,s]=await Promise.all([chrome.permissions.contains({permissions:['nativeMessaging']}),chrome.storage.local.get(KEY_VOICE_NATIVE_ENABLED)]);return p && s[KEY_VOICE_NATIVE_ENABLED]===true;}catch{return false;}}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(sender.id!==chrome.runtime.id || !Object.values(VOICE_NATIVE_MESSAGES).includes(message?.type))return;
 const owner=String(sender.tab?.id??'extension')+':'+String(sender.frameId??0)+':'+String(sender.documentId??sender.url??'');
 if(message.type===VOICE_NATIVE_MESSAGES.cancel){reply({ok:broker.cancel(message.id,owner)});return;}
 void (async()=>{
  if(!await enabled())return {available:false,notStarted:true,busy:broker.engineBusy()};
  if(message.type===VOICE_NATIVE_MESSAGES.probe)return await broker.capabilities();
  return await broker.synthesize(message.request,owner);
 })().then(reply,()=>reply({available:true,error:{code:'adapter-failure',complete:false,status:0,phase:'synth'}}));
 return true;
});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes[KEY_VOICE_NATIVE_ENABLED]?.newValue!==true && changes[KEY_VOICE_NATIVE_ENABLED])broker.releaseWhenIdle();});
chrome.permissions.onRemoved.addListener(p=>{if(p.permissions?.includes('nativeMessaging'))broker.releaseWhenIdle();});
