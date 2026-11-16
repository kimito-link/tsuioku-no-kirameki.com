import { describe,it,expect,vi } from 'vitest';
import { wireVoiceNativeToggle } from './wireVoiceNativeToggle.js';
import { KEY_VOICE_NATIVE_ENABLED as KEY } from '../../lib/voiceKeys.js';
function setup(initial=false,granted=true){
 let change;const toggle={dataset:{},checked:false,disabled:false,addEventListener:(_name,fn)=>{change=fn;}},status={textContent:''};
 const root={getElementById:id=>id==='voiceNativeToggle'?toggle:status};
 const bag={[KEY]:initial};const storage={get:vi.fn(async()=>bag),set:vi.fn(async value=>Object.assign(bag,value))};
 const api={permissions:{request:vi.fn(async()=>granted)},runtime:{sendMessage:vi.fn(async()=>({available:false}))}};
 wireVoiceNativeToggle(root,storage,api);
 return{toggle,status,storage,api,bag,change:()=>change()};
}
describe('任意音声補助アプリの同意',()=>{
 it('初期状態OFFでは権限も起動も求めない',async()=>{const s=setup();await vi.waitFor(()=>expect(s.status.textContent).toContain('通常'));expect(s.toggle.checked).toBe(false);expect(s.api.permissions.request).not.toHaveBeenCalled();expect(s.api.runtime.sendMessage).not.toHaveBeenCalled();});
 it('クリックの同期区間で任意権限を求め、拒否はOFFへ戻す',async()=>{const s=setup(false,false);await vi.waitFor(()=>expect(s.status.textContent).toContain('通常'));s.toggle.checked=true;s.change();expect(s.api.permissions.request).toHaveBeenCalledTimes(1);await vi.waitFor(()=>expect(s.toggle.disabled).toBe(false));expect(s.bag[KEY]).toBe(false);expect(s.status.textContent).toContain('許可されなかった');});
 it('許可後に保存し、未導入でも次の手順を案内する',async()=>{const s=setup();await vi.waitFor(()=>expect(s.status.textContent).toContain('通常'));s.toggle.checked=true;s.change();await vi.waitFor(()=>expect(s.toggle.disabled).toBe(false));expect(s.bag[KEY]).toBe(true);expect(s.status.textContent).toContain('導入・更新');});
 it('OFF操作で権限を求めず、保存失敗時は前のONを正しく示す',async()=>{const s=setup(true);await vi.waitFor(()=>expect(s.status.textContent).toContain('導入・更新'));s.storage.set.mockRejectedValueOnce(Error('storage'));s.toggle.checked=false;s.change();await vi.waitFor(()=>expect(s.toggle.disabled).toBe(false));expect(s.api.permissions.request).not.toHaveBeenCalled();expect(s.toggle.checked).toBe(true);expect(s.bag[KEY]).toBe(true);expect(s.status.textContent).toContain('変更前');});
});
