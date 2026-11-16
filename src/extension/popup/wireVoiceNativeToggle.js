import { KEY_VOICE_NATIVE_ENABLED } from '../../lib/voiceKeys.js';
import { VOICE_NATIVE_MESSAGES } from '../../lib/voiceNativeProtocol.js';
/**
 * 任意の補助アプリは利用者のクリック時だけ許可を求める。
 * @param {Document|null} root
 * @param {{get:(key:string)=>Promise<Record<string,unknown>>,set:(items:Record<string,unknown>)=>Promise<unknown>}} storage
 * @param {typeof chrome} [api]
 */
export function wireVoiceNativeToggle(root,storage,api=globalThis.chrome){
 const toggle=/** @type {HTMLInputElement|null} */(root?.getElementById('voiceNativeToggle'));
 const status=root?.getElementById('voiceNativeStatus');
 if(!toggle || toggle.dataset.nlWired==='1')return;toggle.dataset.nlWired='1';
 /** @param {string} text */
 const say=text=>{if(status)status.textContent=text;};
 let savedEnabled=false;
 async function refresh(){
  try{const bag=await storage.get(KEY_VOICE_NATIVE_ENABLED);savedEnabled=bag?.[KEY_VOICE_NATIVE_ENABLED]===true;toggle.checked=savedEnabled;
   if(!toggle.checked){say('補助アプリを使わず、通常の読み上げを使います。');return;}
   const cap=await api.runtime.sendMessage({type:VOICE_NATIVE_MESSAGES.probe});
   say(cap?.available?'補助アプリを使う準備ができました。':cap?.busy?'前の読み上げ処理の終了を待っています。':'補助アプリを使えません。導入・更新方法をご確認ください。');
  }catch{say('通常の読み上げを利用できます。');}
 }
 toggle.addEventListener('change',()=>{
  const wanted=toggle.checked;toggle.disabled=true;
  // requestはユーザー操作の同期区間で呼ぶ。起動時には決して呼ばない。
  let permission;
  try{permission=wanted?api.permissions.request({permissions:['nativeMessaging']}):Promise.resolve(false);}catch{permission=Promise.resolve(false);}
  void Promise.resolve(permission).then(async granted=>{
   const enabled=wanted && granted===true;await storage.set({[KEY_VOICE_NATIVE_ENABLED]:enabled});savedEnabled=enabled;toggle.checked=enabled;
   if(wanted&&!enabled){say('許可されなかったため、通常の読み上げを使います。');return;}
   await refresh();
  }).catch(()=>{toggle.checked=savedEnabled;say('設定を保存できませんでした。変更前の設定を保っています。');}).finally(()=>{toggle.disabled=false;});
 });
 void refresh();
}
