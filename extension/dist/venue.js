(()=>{var GENERIC_ANON_NAMES=new Set(["\u533F\u540D","\u540D\u7121\u3057","\u540D\u7121\u3057\u3055\u3093","\u533F\u540D\u3055\u3093"]);function isGenericComeviewName(name){return GENERIC_ANON_NAMES.has(String(name||"").trim())}function resolveVenueLayoutMode(arenaCount){let n=Math.max(0,Math.floor(Number(arenaCount)||0));return n===0?"empty":n<=8?"vip":n<=30?"normal":"packed"}function venueParticipantKey(row,isGenericName,_promoteUserIds){if(!row||typeof row!="object")return null;let uid=String(row.userId||"").trim();if(uid)return`u:${uid}`;let name=String(row.name||"").trim();return!name||typeof isGenericName=="function"&&isGenericName(name)?null:uid?`u:${uid}`:`n:${name}`}function collectVenueParticipants(rows,opts={}){let list=Array.isArray(rows)?rows:[],isGenericName=opts.isGenericName,promoteUserIds=opts.promoteUserIds instanceof Set?opts.promoteUserIds:null,byKey=new Map,order=0;for(let r of list){let key=venueParticipantKey(r,isGenericName,promoteUserIds);if(!key)continue;let at=Number.isFinite(Number(r?.capturedAt))?Number(r.capturedAt):0,text=String(r?.text??"").trim(),preCount=Number.isFinite(Number(r?.preCount))?Math.max(1,Math.floor(Number(r.preCount))):1,preHasGift=r?.preHasGift===!0||!!r?.isGift,preGiftCount=Number.isFinite(Number(r?.preGiftCount))?Math.max(0,Math.floor(Number(r.preGiftCount))):0,existing=byKey.get(key);if(existing){existing.count+=preCount,existing.giftCount+=preGiftCount,at>=existing.lastAt&&(existing.lastAt=at,text&&(existing.lastText=text)),preHasGift&&(existing.hasGift=!0);let uid=String(r?.userId||"").trim();uid&&!existing.userId&&(existing.userId=uid);let name=String(r?.name||"").trim();name&&!existing.name&&(existing.name=name);let avatar=String(r?.avatar||"").trim();avatar&&!existing.avatar&&(existing.avatar=avatar)}else byKey.set(key,{key,name:String(r?.name||"").trim(),userId:String(r?.userId||"").trim(),avatar:String(r?.avatar||"").trim(),lastText:text,lastAt:at,firstAt:at,count:preCount,hasGift:preHasGift,giftCount:preGiftCount,order:order++})}let out=Array.from(byKey.values());return out.sort((a,b)=>a.order-b.order),out.map(({order:_order,...rest})=>rest)}function hasRealThumbnail(avatar){return/^https?:\/\//i.test(String(avatar||"").trim())}function deriveNicoUserIconUrl(userId){let uid=String(userId||"").trim();return/^\d{2,15}$/.test(uid)?`https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/${Math.floor(Number(uid)/1e4)}/${uid}.jpg`:""}function resolveVenueEffectiveAvatar(participant){let p=participant&&typeof participant=="object"?participant:{},stored=String(p.avatar||"").trim();return hasRealThumbnail(stored)?stored:deriveNicoUserIconUrl(p.userId)}function participantHasEffectiveThumbnail(participant){return hasRealThumbnail(resolveVenueEffectiveAvatar(participant))}function resolveVenueRegularScore(participant,opts={}){let p=participant&&typeof participant=="object"?participant:{},count=Math.max(0,Math.floor(Number(p.count)||0)),giftPoints=Math.max(0,Number(p.giftPoints)||0),commentCap=Number.isFinite(opts.commentCap)&&opts.commentCap>0?opts.commentCap:40,giftPointsCap=Number.isFinite(opts.giftPointsCap)&&opts.giftPointsCap>0?opts.giftPointsCap:5e3,log1p=v=>Math.log(1+Math.max(0,v)),commentNorm=Math.min(1,log1p(count)/log1p(commentCap)),giftFlag=p.hasGift?1:0,giftPointsNorm=giftPoints>0?Math.min(1,log1p(giftPoints)/log1p(giftPointsCap)):0,score=100*(.55*commentNorm+.3*giftFlag+.15*giftPointsNorm);return Math.max(0,Math.min(100,score))}var VENUE_VIP_REGULAR_MAX=8,VENUE_VIP_REGULAR_MIN_SCORE=1;function selectVenueVipRegularKeys(participants,opts={}){let list=Array.isArray(participants)?participants:[],max=Number.isFinite(opts.max)&&opts.max>0?Math.floor(opts.max):VENUE_VIP_REGULAR_MAX,minScore=Number.isFinite(opts.minScore)&&opts.minScore>=0?opts.minScore:Number.isFinite(opts.threshold)&&opts.threshold>=0?opts.threshold:VENUE_VIP_REGULAR_MIN_SCORE,scored=[];for(let p of list){if(!p||typeof p.key!="string"||!p.key)continue;let score=resolveVenueRegularScore(p,opts);score>=minScore&&score>0&&scored.push({key:p.key,score,count:Number(p.count)||0})}return scored.sort((a,b)=>b.score!==a.score?b.score-a.score:b.count!==a.count?b.count-a.count:a.key<b.key?-1:a.key>b.key?1:0),new Set(scored.slice(0,max).map(s=>s.key))}function rankVenueParticipants(participants,maxSeats=50,prevSeatByKey=null){let list=Array.isArray(participants)?participants.slice():[],cap=Number.isFinite(maxSeats)&&maxSeats>0?Math.floor(maxSeats):50,seated=new Set;if(prevSeatByKey instanceof Map)for(let[k,seat]of prevSeatByKey){let s=Number(seat);Number.isInteger(s)&&s>=0&&s<cap&&seated.add(String(k))}else if(prevSeatByKey&&typeof prevSeatByKey=="object")for(let[k,seat]of Object.entries(prevSeatByKey)){let s=Number(seat);Number.isInteger(s)&&s>=0&&s<cap&&seated.add(String(k))}let byCountThenRecent=(a,b)=>b.count!==a.count?b.count-a.count:b.lastAt!==a.lastAt?b.lastAt-a.lastAt:a.key<b.key?-1:a.key>b.key?1:0,byRecentThenCount=(a,b)=>b.lastAt!==a.lastAt?b.lastAt-a.lastAt:b.count!==a.count?b.count-a.count:a.key<b.key?-1:a.key>b.key?1:0,picked=new Set,out=[],fill=(pred,sorter)=>{if(out.length>=cap)return;let layer=list.filter(p=>p&&!picked.has(p.key)&&pred(p)).sort(sorter);for(let p of layer){if(out.length>=cap)break;picked.add(p.key),out.push(p)}};return fill(p=>seated.has(p.key),byCountThenRecent),fill(p=>hasRealThumbnail(p.avatar),byCountThenRecent),fill(p=>(p.count||0)>=2,byCountThenRecent),fill(()=>!0,byRecentThenCount),out.slice(0,cap)}function assignVenueSeats(ranked,prevSeatByKey,maxSeats=50,frontRow=0){let list=Array.isArray(ranked)?ranked:[],cap=Number.isFinite(maxSeats)&&maxSeats>0?Math.floor(maxSeats):50,front=Number.isFinite(frontRow)&&frontRow>0?Math.min(Math.floor(frontRow),cap):0,prev=prevSeatByKey instanceof Map?prevSeatByKey:new Map(Object.entries(prevSeatByKey||{}).map(([k,v])=>[k,Number(v)])),seatByKey=new Map,usedSeats=new Set;for(let p of list){let prevSeat=prev.get(p.key);if(Number.isInteger(prevSeat)&&prevSeat>=0&&prevSeat<cap&&!usedSeats.has(prevSeat)){if(front>0&&prevSeat<front&&!hasRealThumbnail(p.avatar))continue;seatByKey.set(p.key,prevSeat),usedSeats.add(prevSeat)}}let nextFreeFront=0,nextFreeBack=front;for(let p of list){if(seatByKey.has(p.key))continue;let seat=-1;if(front>0&&hasRealThumbnail(p.avatar)){for(;nextFreeFront<front&&usedSeats.has(nextFreeFront);)nextFreeFront+=1;nextFreeFront<front&&(seat=nextFreeFront)}if(seat<0){for(;nextFreeBack<cap&&usedSeats.has(nextFreeBack);)nextFreeBack+=1;nextFreeBack<cap&&(seat=nextFreeBack)}if(seat<0)break;seatByKey.set(p.key,seat),usedSeats.add(seat)}let seats=[];for(let p of list){let seatIndex=seatByKey.get(p.key);seatIndex!=null&&seats.push({seatIndex,participant:p})}return seats.sort((a,b)=>a.seatIndex-b.seatIndex),{seats,seatByKey}}function countAnonymousParticipants(rows,isGenericName,promoteUserIds,excludeKeys=null){let list=Array.isArray(rows)?rows:[],promote=promoteUserIds instanceof Set?promoteUserIds:null,anonUids=new Set,hasUidlessAnon=!1,exclude=excludeKeys instanceof Set?excludeKeys:null;for(let r of list){let key=venueParticipantKey(r,isGenericName,promote);if(exclude&&key&&exclude.has(key)||!exclude&&key)continue;let uid=String(r?.userId||"").trim();uid?anonUids.add(uid):hasUidlessAnon=!0}return anonUids.size+(hasUidlessAnon?1:0)}var VENUE_AUDIENCE_FACE_MAX=120;function collectAudienceFaceUserIds(rows,opts={}){let list=Array.isArray(rows)?rows:[],isGenericName=opts.isGenericName,promote=opts.promoteUserIds instanceof Set?opts.promoteUserIds:null,max=Number.isFinite(opts.max)&&opts.max>0?Math.floor(opts.max):VENUE_AUDIENCE_FACE_MAX,excludeKeys=opts.excludeKeys instanceof Set?opts.excludeKeys:null,lastAtByUid=new Map,hasUidlessAnon=!1;for(let r of list){let key=venueParticipantKey(r,isGenericName,promote);if(excludeKeys&&key&&excludeKeys.has(key)||!excludeKeys&&key)continue;let uid=String(r?.userId||"").trim();if(!uid){hasUidlessAnon=!0;continue}let at=Number.isFinite(Number(r?.capturedAt))?Number(r.capturedAt):0,prev=lastAtByUid.get(uid);(prev==null||at>=prev)&&lastAtByUid.set(uid,at)}let totalAnonymous=lastAtByUid.size+(hasUidlessAnon?1:0);return{faceUserIds:Array.from(lastAtByUid.entries()).sort((a,b)=>b[1]-a[1]).slice(0,max).map(([uid])=>uid),totalAnonymous}}function buildVenueSeating(rows,opts={}){let maxSeats=Number.isFinite(opts.maxSeats)?opts.maxSeats:50,frontRow=Number.isFinite(opts.frontRowSeats)?opts.frontRowSeats:20,promoteUserIds=opts.promoteUserIds instanceof Set?opts.promoteUserIds:null,participants=collectVenueParticipants(rows,{isGenericName:opts.isGenericName,promoteUserIds}),ranked=rankVenueParticipants(participants,maxSeats,opts.prevSeatByKey),{seats,seatByKey}=assignVenueSeats(ranked,opts.prevSeatByKey,maxSeats,frontRow),vipRegularKeys=opts.vipRegular===!1?new Set:selectVenueVipRegularKeys(participants,{threshold:opts.vipRegularThreshold,max:opts.vipRegularMax,commentCap:opts.vipRegularCommentCap,giftPointsCap:opts.vipRegularGiftPointsCap});return{seats:seats.map(s=>({...s,isFrontRow:s.seatIndex<frontRow,isVipRegular:vipRegularKeys.has(s.participant.key)})),seatByKey,participantCount:participants.length,anonymousCount:countAnonymousParticipants(rows,opts.isGenericName,promoteUserIds),layoutMode:resolveVenueLayoutMode(participants.length)}}function venueRowsFromUserLaneCandidates(candidates){let list=Array.isArray(candidates)?candidates:[],out=[];for(let c of list){if(!c||typeof c!="object")continue;let userId=String(c.userId||"").trim();if(!userId)continue;let preCount=Math.max(1,Math.floor(Number(c.commentCount)||0)||1),giftCount=Math.max(0,Math.floor(Number(c.giftCount)||0));out.push({userId,name:String(c.nickname||"").trim(),avatar:String(c.avatarUrl||"").trim(),text:"",capturedAt:Number.isFinite(Number(c._laneSortAt))?Number(c._laneSortAt):0,preCount,preHasGift:giftCount>0,preGiftCount:giftCount})}return out}function resolveVenueTierMinScale(total){let n=Math.max(0,Math.floor(Number(total)||0));return n<=16?.62:n<=64?.58:n<=150?.54:.5}function buildVenueTiers(seatCount,opts={}){let n=Math.max(0,Math.floor(Number(seatCount)||0));if(n===0)return[];let minScale=Number.isFinite(opts.minScale)&&opts.minScale>0&&opts.minScale<=1?opts.minScale:resolveVenueTierMinScale(n),frontMax=Number.isFinite(opts.maxPerFrontRow)&&opts.maxPerFrontRow>0?Math.floor(opts.maxPerFrontRow):8,maxPerRow=Number.isFinite(opts.maxPerRow)&&opts.maxPerRow>0?Math.floor(opts.maxPerRow):1/0,rowCount;n<=frontMax?rowCount=1:n<=frontMax*2?rowCount=2:n<=frontMax*4?rowCount=3:n<=frontMax*7?rowCount=4:n<=frontMax*11?rowCount=5:n<=frontMax*16?rowCount=6:n<=frontMax*22?rowCount=7:rowCount=8;let ROW_HARD_MAX=8;if(Number.isFinite(maxPerRow))for(;rowCount<ROW_HARD_MAX&&rowCount*maxPerRow<n;)rowCount+=1;let weights=[],weightSum=0;for(let r=0;r<rowCount;r+=1){let w=1+r*.25;weights.push(w),weightSum+=w}let counts=weights.map(w=>Math.floor(n*w/weightSum)),assigned=counts.reduce((a,b)=>a+b,0),idx=0;for(;assigned<n;)counts[idx%rowCount]+=1,assigned+=1,idx+=1;if(Number.isFinite(maxPerRow))for(let r=0;r<rowCount;r+=1){if(counts[r]<=maxPerRow)continue;let overflow=counts[r]-maxPerRow;counts[r]=maxPerRow;for(let t=r+1;t<rowCount&&overflow>0;t+=1){let room=maxPerRow-counts[t];if(room<=0)continue;let move=Math.min(room,overflow);counts[t]+=move,overflow-=move}for(let t=0;t<rowCount&&overflow>0;t+=1){let room=maxPerRow-counts[t];if(room<=0)continue;let move=Math.min(room,overflow);counts[t]+=move,overflow-=move}}let tiers=[];for(let r=0;r<rowCount;r+=1){if(counts[r]<=0)continue;let depth=rowCount===1?0:r/(rowCount-1),scale=1-(1-minScale)*depth;tiers.push({rowIndex:r,count:counts[r],scale,depth})}return tiers}function normalizeLv(v){let s=String(v??"").trim().toLowerCase();return s?s.startsWith("ch")||s.startsWith("lv")?s:`lv${s}`:""}function isHttpOrHttpsUrl(url){let s=String(url||"").trim();return/^https?:\/\//i.test(s)}function niconicoDefaultUserIconUrl(userId){let s=String(userId||"").trim();if(!/^\d{5,14}$/.test(s))return"";let n=Number(s);return!Number.isFinite(n)||n<1?"":`https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/${Math.max(1,Math.floor(n/1e4))}/${s}.jpg`}function isWeakNiconicoUserIconHttpUrl(url){let s=String(url||"").trim();return isHttpOrHttpsUrl(s)?/\/usericon\/defaults\//i.test(s):!1}function isNiconicoSyntheticDefaultUserIconUrl(avatarUrl,userId){let url=String(avatarUrl||"").trim(),uid=String(userId||"").trim();if(!isHttpOrHttpsUrl(url)||!/^\d{5,14}$/.test(uid))return!1;let expected=niconicoDefaultUserIconUrl(uid);return!!(expected&&url===expected)}function commentEnrichmentAvatarScore(userId,url){let c=String(url||"").trim();if(!isHttpOrHttpsUrl(c))return 0;if(isWeakNiconicoUserIconHttpUrl(c))return 1;let u=String(userId||"").trim();return/^\d{5,14}$/.test(u)&&isNiconicoSyntheticDefaultUserIconUrl(c,u)?1:2}function pickStrongestAvatarUrlForUser(userId,orderedCandidates){let u=String(userId||"").trim(),best="",bestSc=0;if(!Array.isArray(orderedCandidates))return"";for(let raw of orderedCandidates){let c=String(raw||"").trim();if(!c)continue;let sc=commentEnrichmentAvatarScore(u,c);sc>bestSc&&(bestSc=sc,best=c)}return best}function avatarCompareKey(raw){let s=String(raw??"").trim();if(!s)return"";try{let u=new URL(s);return u.search="",u.hash="",u.href}catch{return s}}function isSameAvatarUrl(a,b){let ka=avatarCompareKey(a),kb=avatarCompareKey(b);return!!(ka&&kb&&ka===kb)}function extractNiconicoUserIdFromIconUrl(raw){let s=String(raw??"").trim();if(!s)return"";let m=s.match(/\/(\d{2,15})\.(?:jpg|jpeg|png|gif|webp)(?:[?#]|$)/i);return m&&m[1]?m[1]:""}function isAvatarUrlForUserId(url,expectedUserId){let expected=String(expectedUserId??"").trim(),urlUid=extractNiconicoUserIdFromIconUrl(url);return!expected||/^a:/.test(expected)?!urlUid:!/^\d{2,15}$/.test(expected)||!urlUid?!0:urlUid===expected}var isAvatarUrlForUserId2=isAvatarUrlForUserId;function isNiconicoAnonymousUserId(userId){let s=String(userId??"").trim();return s.startsWith("a:")?s.slice(2).trim().length>=2:!1}function isNiconicoAutoUserPlaceholderNickname(nickname){let n=String(nickname??"").trim();return/^user\s+[A-Za-z0-9]+$/i.test(n)}function supportGridStrongNickname(nick,userId){let n=String(nick??"").trim();return!(!n||isNiconicoAutoUserPlaceholderNickname(n)||n==="\uFF08\u672A\u53D6\u5F97\uFF09"||n==="(\u672A\u53D6\u5F97)"||n==="\u533F\u540D"||n==="\u30B2\u30B9\u30C8"||/^guest$/i.test(n)||isNiconicoAnonymousUserId(userId)&&n.length<=1)}function isLikelyInternalNdgGiftOrCampaignLabel(s){let t=String(s||"").trim();if(!t)return!1;if(/^nicolive_/i.test(t)||/^stamp_[a-z0-9_]{2,}$/i.test(t))return!0;let hasNonAscii=[...t].some(ch=>(ch.codePointAt(0)??0)>127);return!!(/^[a-z][a-z0-9_]{22,}$/i.test(t)&&!hasNonAscii||/unei_niconico/i.test(t)||/^\d{4,}[_a-z][a-z0-9_]{8,}$/i.test(t)&&!hasNonAscii)}function isTrustworthySupportGridDisplayNickname(nick,userId){let uid=String(userId||"").trim(),n=String(nick||"").trim();return!n||isLikelyInternalNdgGiftOrCampaignLabel(n)?!1:supportGridStrongNickname(n,uid)}function containsJapaneseScriptOrFullwidthDisplayChars(s){return/[\u3040-\u30FF\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/.test(String(s||""))}function isLikelyPlainAsciiHandleNickname(s){let t=String(s||"").trim();return t.length<8?!1:/^[a-z0-9_]+$/i.test(t)}function isLikelySnakeCaseAsciiHandleNickname(s){let t=String(s||"").trim();return t.length<8||!t.includes("_")?!1:/^[a-z0-9_]+$/i.test(t)}function isShortLatinLettersOnlyNickname(s){let t=String(s||"").trim();return t.length<2||t.length>20?!1:/^[A-Za-z]+$/.test(t)}function pickBetterInterceptNickname(userId,prevNick,incomingNick){let uid=String(userId||"").trim(),prev=String(prevNick||"").trim(),next=String(incomingNick||"").trim();if(!next)return prev;if(!prev)return next;let prevInternal=isLikelyInternalNdgGiftOrCampaignLabel(prev),nextInternal=isLikelyInternalNdgGiftOrCampaignLabel(next),prevTrust=isTrustworthySupportGridDisplayNickname(prev,uid),nextTrust=isTrustworthySupportGridDisplayNickname(next,uid),preferNext=!1;return prevInternal&&!nextInternal?preferNext=!0:!prevInternal&&nextInternal||prevTrust&&!nextTrust?preferNext=!1:!prevTrust&&nextTrust||!prevInternal&&!nextInternal&&prevTrust&&nextTrust&&containsJapaneseScriptOrFullwidthDisplayChars(next)&&isLikelyPlainAsciiHandleNickname(prev)?preferNext=!0:!prevInternal&&!nextInternal&&prevTrust&&nextTrust&&containsJapaneseScriptOrFullwidthDisplayChars(prev)&&isLikelyPlainAsciiHandleNickname(next)?preferNext=!1:!prevInternal&&!nextInternal&&prevTrust&&nextTrust&&isShortLatinLettersOnlyNickname(next)&&isLikelySnakeCaseAsciiHandleNickname(prev)?preferNext=!0:!prevInternal&&!nextInternal&&prevTrust&&nextTrust&&isShortLatinLettersOnlyNickname(prev)&&isLikelySnakeCaseAsciiHandleNickname(next)?preferNext=!1:next.length>prev.length&&(preferNext=!0),preferNext?next:prev}function normalizeLv2(v){return normalizeLv(v)}function rowLiveId(row){let o=row;return String(o?.liveId??o?.lvId??"").trim()}function rowMatchesLiveFilter(row,targetNorm){if(!targetNorm)return!0;let o=row,a=normalizeLv2(o?.liveId),b=normalizeLv2(o?.lvId);return!!a&&a===targetNorm||!!b&&b===targetNorm}function rowCapturedAt(row){let n=Number(row?.capturedAt);return Number.isFinite(n)&&n>0?n:0}function userLaneCandidatesFromStorage(storedComments,liveId,opts){let filterByLive=arguments.length>=2&&liveId!=null&&String(liveId).trim()!=="",lidNorm=filterByLive?String(liveId).trim():"",targetNorm=filterByLive?normalizeLv2(lidNorm):"",broadcasterUid=String(opts?.broadcasterUid??"").trim(),broadcasterIconUrl=String(opts?.broadcasterIconUrl??"").trim(),broadcasterGuardEnabled=!!(broadcasterUid&&broadcasterIconUrl),requireText=opts?.requireText===!0,allRows=Array.isArray(storedComments)?storedComments:[],rows=filterByLive?allRows.filter(e=>rowMatchesLiveFilter(e,targetNorm)):allRows;requireText&&(rows=rows.filter(e=>!!String(e?.text??"").trim()));let useLidForOutput=filterByLive,byUid=new Map;for(let row of rows){let uid=String(row?.userId??"").trim();if(!uid)continue;let g=byUid.get(uid);g?g.push(row):byUid.set(uid,[row])}let built=[];for(let[userId,group]of byUid){let chronological=[...group].sort((a,b)=>rowCapturedAt(a)-rowCapturedAt(b)),observed=!1,urls=[],isBroadcasterHere=broadcasterGuardEnabled&&userId===broadcasterUid;for(let g of chronological){g.avatarObserved===!0&&(observed=!0);let u=String(g.avatarUrl??"").trim();u&&isAvatarUrlForUserId2(u,userId)&&(broadcasterGuardEnabled&&!isBroadcasterHere&&isSameAvatarUrl(u,broadcasterIconUrl)||urls.push(u))}let avatarUrl=pickStrongestAvatarUrlForUser(userId,urls),newestFirst=[...chronological].sort((a,b)=>rowCapturedAt(b)-rowCapturedAt(a)),nickname="";for(let g of chronological){let n=String(g.nickname??"").trim();n&&(nickname=pickBetterInterceptNickname(userId,nickname,n))}let lastCapturedAt=Math.max(0,...chronological.map(rowCapturedAt)),commentCount=chronological.length,giftCount=0;for(let g of chronological){let gg=g;(gg.isGift===!0||gg.gift!=null||gg.kind==="gift")&&(giftCount+=1)}let outLiveId=useLidForOutput?lidNorm:rowLiveId(newestFirst[0]||chronological[chronological.length-1]||{});built.push({userId,nickname,avatarUrl,avatarObserved:observed,liveId:outLiveId,commentCount,giftCount,_laneSortAt:lastCapturedAt})}return built.sort((a,b)=>(b._laneSortAt||0)-(a._laneSortAt||0)),Object.freeze(built.map(row=>Object.freeze({userId:row.userId,nickname:row.nickname,avatarUrl:row.avatarUrl,avatarObserved:row.avatarObserved,liveId:row.liveId,commentCount:row.commentCount,giftCount:row.giftCount,_laneSortAt:row._laneSortAt})))}var KEY_LIVE_BROADCASTER_CTX="nls_live_broadcaster_ctx_v1";function emptyBroadcasterCtx(){return{uid:"",iconUrl:"",liveId:"",updatedAt:0}}function normalizeBroadcasterCtx(raw){if(!raw||typeof raw!="object")return emptyBroadcasterCtx();let o=raw,updatedAtNum=Number(o.updatedAt);return{uid:String(o.uid??"").trim(),iconUrl:String(o.iconUrl??"").trim(),liveId:String(o.liveId??"").trim(),updatedAt:Number.isFinite(updatedAtNum)&&updatedAtNum>0?updatedAtNum:0}}function isBroadcasterCtxUsableForGuard(ctx,currentLiveId){if(!ctx||!ctx.uid||!ctx.iconUrl)return!1;let cur=String(currentLiveId??"").trim().toLowerCase(),own=String(ctx.liveId??"").trim().toLowerCase();return!(cur&&own&&cur!==own)}function normLid(liveId){return String(liveId||"").trim().toLowerCase()}function chunkStorageKey(liveId,seq){return`nls_cchunk_${normLid(liveId)}_${Math.max(0,Math.floor(Number(seq)||0))}`}function chunkIndexKey(liveId){return`nls_cchunk_index_${normLid(liveId)}`}function isChunkIndex(obj,liveId){if(!obj||typeof obj!="object")return!1;let o=obj;return!(Number(o.v)!==1||!Array.isArray(o.seqs)||!Number.isFinite(Number(o.total))||liveId!==void 0&&normLid(o.liveId)!==normLid(liveId))}function chunkKeysFromIndex(liveId,index){let seqs=Array.isArray(index?.seqs)?index.seqs.slice():[];return seqs.sort((a,b)=>a-b),seqs.map(seq=>chunkStorageKey(liveId,seq))}async function readChunkedComments(liveId,mainKey,getMany){let idxKey=chunkIndexKey(liveId),idxBag=await getMany([idxKey]),index=idxBag?idxBag[idxKey]:null;if(isChunkIndex(index,liveId)&&Array.isArray(index.seqs)){let keys=chunkKeysFromIndex(liveId,index);if(keys.length===0)return{rows:[],fromChunks:!0,index};let bag=await getMany(keys),rows=[];for(let key of keys){let part=bag?bag[key]:null;Array.isArray(part)&&(rows=rows.concat(part))}return{rows,fromChunks:!0,index}}let mainBag=await getMany([mainKey]),main2=mainBag?mainBag[mainKey]:null;return{rows:Array.isArray(main2)?main2:[],fromChunks:!1,index:null}}function selectNewChunkSeqs(allSeqs,processedSeqs){let all=Array.isArray(allSeqs)?allSeqs.map(n=>Math.max(0,Math.floor(Number(n)||0))):[],done=new Set(Array.isArray(processedSeqs)?processedSeqs.map(n=>Math.max(0,Math.floor(Number(n)||0))):[]);return all.filter(seq=>!done.has(seq)).sort((a,b)=>a-b)}function mergeUserLaneAggregates(existing,incoming){let byUid=new Map,ingest=list=>{if(Array.isArray(list))for(let c of list){if(!c||typeof c!="object")continue;let uid=String(c.userId||"").trim();if(!uid)continue;let prev=byUid.get(uid);if(!prev){byUid.set(uid,{userId:uid,nickname:String(c.nickname||""),avatarUrl:String(c.avatarUrl||""),avatarObserved:!!c.avatarObserved,liveId:String(c.liveId||""),commentCount:Math.max(0,Math.floor(Number(c.commentCount)||0)),giftCount:Math.max(0,Math.floor(Number(c.giftCount)||0)),_laneSortAt:Math.max(0,Number(c._laneSortAt)||0)});continue}prev.commentCount=(prev.commentCount||0)+Math.max(0,Math.floor(Number(c.commentCount)||0)),prev.giftCount=(prev.giftCount||0)+Math.max(0,Math.floor(Number(c.giftCount)||0)),prev._laneSortAt=Math.max(prev._laneSortAt||0,Math.max(0,Number(c._laneSortAt)||0)),prev.avatarObserved=prev.avatarObserved||!!c.avatarObserved,prev.nickname=pickBetterInterceptNickname(uid,prev.nickname,String(c.nickname||""));let stronger=pickStrongestAvatarUrlForUser(uid,[prev.avatarUrl,String(c.avatarUrl||"")]);stronger&&(prev.avatarUrl=stronger);let nextLid=String(c.liveId||"").trim();nextLid&&(prev.liveId=nextLid)}};ingest(existing),ingest(incoming);let out=Array.from(byUid.values());return out.sort((a,b)=>(b._laneSortAt||0)-(a._laneSortAt||0)),out}var VENUE_ROSTER_VIP_COMMENT_THRESHOLD=5,VENUE_ROSTER_WINDOW_MS=4*6e4,VENUE_ROSTER_VIP_WINDOW_MS=15*6e4,VENUE_ROSTER_MAX_SEATS=150;function isRosterEntryVip(entry){let c=Math.max(0,Math.floor(Number(entry?.commentCount)||0));return Math.max(0,Math.floor(Number(entry?.giftCount)||0))>0||c>=VENUE_ROSTER_VIP_COMMENT_THRESHOLD}function touchRoster(roster,row,nowMs,opts={}){if(!(roster instanceof Map)||!row||typeof row!="object")return null;let userId=String(row.userId??"").trim();if(!userId)return null;let requireText=opts.requireText!==!1,text=String(row.text??"").trim();if(requireText&&!text)return null;let now=Number.isFinite(Number(nowMs))?Number(nowMs):0,isGift=opts.isGift===!0,incomingName=String(row.nickname??row.name??"").trim(),incomingAvatar=String(row.avatarUrl??"").trim(),e=roster.get(userId);return e?(e.lastSeen=Math.max(e.lastSeen||0,now),e.commentCount=(e.commentCount||0)+1,isGift&&(e.giftCount=(e.giftCount||0)+1),!e.name&&incomingName&&(e.name=incomingName),(incomingAvatar&&hasRealThumbnail(incomingAvatar)&&!hasRealThumbnail(e.avatar)||!e.avatar&&incomingAvatar)&&(e.avatar=incomingAvatar),e.vip=isRosterEntryVip(e),e):(e={userId,name:incomingName,avatar:incomingAvatar,firstSeen:now,lastSeen:now,commentCount:1,giftCount:isGift?1:0,vip:!1},e.vip=isRosterEntryVip(e),roster.set(userId,e),e)}function pruneRoster(roster,nowMs,opts={}){if(!(roster instanceof Map))return roster;let now=Number.isFinite(Number(nowMs))?Number(nowMs):0,windowMs=Number.isFinite(opts.windowMs)&&opts.windowMs>0?opts.windowMs:VENUE_ROSTER_WINDOW_MS,vipWindowMs=Number.isFinite(opts.vipWindowMs)&&opts.vipWindowMs>0?opts.vipWindowMs:VENUE_ROSTER_VIP_WINDOW_MS,maxSeats=Number.isFinite(opts.maxSeats)&&opts.maxSeats>0?Math.floor(opts.maxSeats):VENUE_ROSTER_MAX_SEATS;for(let[uid,e]of roster){let win=e.vip?vipWindowMs:windowMs;now-(e.lastSeen||0)>win&&roster.delete(uid)}if(roster.size>maxSeats){let entries=Array.from(roster.values()).sort((a,b)=>(a.lastSeen||0)-(b.lastSeen||0)),order=[...entries.filter(e=>!e.vip),...entries.filter(e=>e.vip)],over=roster.size-maxSeats;for(let e of order){if(over<=0)break;roster.delete(e.userId),over-=1}}return roster}function rosterToVenueRows(roster){if(!(roster instanceof Map))return[];let out=[];for(let e of roster.values()){let giftCount=Math.max(0,Math.floor(Number(e.giftCount)||0));out.push({userId:e.userId,name:String(e.name||""),avatar:String(e.avatar||""),text:"",capturedAt:Math.max(0,Number(e.lastSeen)||0),preCount:Math.max(1,Math.floor(Number(e.commentCount)||0)||1),preHasGift:giftCount>0,preGiftCount:giftCount})}return out.sort((a,b)=>(b.capturedAt||0)-(a.capturedAt||0)),out}function hydrateRosterFromCandidates(roster,candidates,opts={}){if(!(roster instanceof Map)||!Array.isArray(candidates))return roster;for(let c of candidates){if(!c||typeof c!="object")continue;let userId=String(c.userId??"").trim();if(!userId||roster.has(userId))continue;let lastSeen=Math.max(0,Number(c._laneSortAt)||0),e={userId,name:String(c.nickname??"").trim(),avatar:String(c.avatarUrl??"").trim(),firstSeen:lastSeen,lastSeen,commentCount:Math.max(1,Math.floor(Number(c.commentCount)||0)||1),giftCount:Math.max(0,Math.floor(Number(c.giftCount)||0)),vip:!1};e.vip=isRosterEntryVip(e),roster.set(userId,e)}let maxSeats=Number.isFinite(opts.maxSeats)&&opts.maxSeats>0?Math.floor(opts.maxSeats):VENUE_ROSTER_MAX_SEATS;if(roster.size>maxSeats){let order=Array.from(roster.values()).sort((a,b)=>(a.lastSeen||0)-(b.lastSeen||0)),over=roster.size-maxSeats;for(let e of order){if(over<=0)break;e.vip||(roster.delete(e.userId),over-=1)}}return roster}function resolveDisplayRows(incoming,lastGood){let inRows=Array.isArray(incoming)?incoming:[],prev=Array.isArray(lastGood)?lastGood:[];return inRows.length>0?{rows:inRows,nextLastGood:inRows,usedFallback:!1}:prev.length>0?{rows:prev,nextLastGood:prev,usedFallback:!0}:{rows:[],nextLastGood:[],usedFallback:!1}}var STORAGE_OP_TIMED_OUT=Symbol("storage_op_timeout");async function runStorageOpWithTimeout(opFn,timeoutMs,sentinel=STORAGE_OP_TIMED_OUT){let ms=Number(timeoutMs);if(!Number.isFinite(ms)||ms<=0)return opFn();let timer=null;try{return await Promise.race([opFn(),new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(sentinel),ms)})])}finally{timer!=null&&clearTimeout(timer)}}var CHARA_IMG_BASE="images/yukkuri-charactore-english",RINKU_IMGS=Object.freeze({default:`${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-open.png`,small:`${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-closed.png`,medium:`${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-open.png`,big:`${CHARA_IMG_BASE}/link/link-yukkuri-blink-mouth-open.png`}),KONTA_IMGS=Object.freeze({default:`${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-open.png`,small:`${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-closed.png`,medium:`${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-open.png`,big:`${CHARA_IMG_BASE}/konta/kitsune-yukkuri-blink-mouth-open.png`}),TANUNEE_IMGS=Object.freeze({default:`${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.png`,small:`${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-normal-mouth-open.png`,medium:`${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.png`,big:`${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-blink-mouth-open.png`}),DELUGE_CHAR_POOLS=Object.freeze([[`${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-open.thumb128.png`,`${CHARA_IMG_BASE}/link/link-yukkuri-normal-mouth-closed.thumb128.png`,`${CHARA_IMG_BASE}/link/link-yukkuri-blink-mouth-closed.thumb128.png`,`${CHARA_IMG_BASE}/link/link-yukkuri-half-eyes-mouth-closed.thumb128.png`],[`${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-open.thumb128.png`,`${CHARA_IMG_BASE}/konta/kitsune-yukkuri-normal.thumb128.png`,`${CHARA_IMG_BASE}/konta/kitsune-yukkuri-blink-mouth-closed.thumb128.png`,`${CHARA_IMG_BASE}/konta/kitsune-yukkuri-half-eyes-mouth-closed.thumb128.png`],[`${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.thumb128.png`,`${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-normal-mouth-open.thumb128.png`,`${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-blink-mouth-closed.thumb128.png`,`${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.thumb128.png`]]);var VENUE_RESIDENT_IDS=Object.freeze(["rinku","konta","tanunee"]),RESIDENT_DEFS=Object.freeze([Object.freeze({id:"rinku",name:"\u308A\u3093\u304F",rel:RINKU_IMGS.default}),Object.freeze({id:"konta",name:"\u3053\u3093\u592A",rel:KONTA_IMGS.default}),Object.freeze({id:"tanunee",name:"\u305F\u306C\u59C9",rel:TANUNEE_IMGS.default})]);function buildVenueResidents(resolveUrl){let resolve=typeof resolveUrl=="function"?resolveUrl:rel=>rel;return RESIDENT_DEFS.map(def=>({id:def.id,name:def.name,imgSrc:resolve(def.rel)}))}function commentDbSummaryKey(liveId){return`nls_cdb_summary_${String(liveId||"").trim().toLowerCase()}`}var KEY_USER_COMMENT_PROFILE_CACHE="nls_user_comment_profile_v1";var KEY_COMMENTER_FOLLOW_CACHE="nls_commenter_follow_v1",KEY_COMMENTER_FOLLOWING_LIST_CACHE="nls_commenter_following_list_v1";var EXTENSION_SOFT_CACHE_STORAGE_KEYS=Object.freeze([KEY_USER_COMMENT_PROFILE_CACHE,KEY_COMMENTER_FOLLOW_CACHE,KEY_COMMENTER_FOLLOWING_LIST_CACHE]);function commentsStorageKey(liveId){return`nls_comments_${String(liveId||"").trim().toLowerCase()}`}function hashString(str){let h=2166136261;for(let i=0;i<str.length;i+=1)h^=str.charCodeAt(i),h=Math.imul(h,16777619);return h>>>0}var LINE="#332a26",SKIN_TONES=["#ffeede","#ffe6cf","#fdf0e4","#f8dfc8"],HAIR_COLORS=[["#f29b38","#ffc97e"],["#3a3534","#6b6360"],["#8a5a2b","#c08c50"],["#e88bb1","#ffc3da"],["#5b87c5","#9cc0ea"],["#7aa45a","#b4d59a"],["#e9c25a","#ffe6a0"],["#d4543a","#f59679"],["#8d6bb0","#c4a8e0"],["#8f8f8f","#c9c9c9"],["#4ba596","#92d5c9"],["#a4683f","#d49a6e"]],EYES=[(iris,irisDark)=>`<ellipse cx="23.5" cy="37" rx="5" ry="6.6" fill="#fff" stroke="${LINE}" stroke-width="2.2"/><ellipse cx="40.5" cy="37" rx="5" ry="6.6" fill="#fff" stroke="${LINE}" stroke-width="2.2"/><ellipse cx="23.5" cy="38" rx="3.2" ry="4.4" fill="${irisDark}"/><ellipse cx="40.5" cy="38" rx="3.2" ry="4.4" fill="${irisDark}"/><ellipse cx="23.5" cy="39.2" rx="2" ry="2.6" fill="${iris}"/><ellipse cx="40.5" cy="39.2" rx="2" ry="2.6" fill="${iris}"/><circle cx="22" cy="35.4" r="1.6" fill="#fff"/><circle cx="39" cy="35.4" r="1.6" fill="#fff"/><circle cx="25.2" cy="40.2" r="0.8" fill="#fff" opacity="0.9"/><circle cx="42.2" cy="40.2" r="0.8" fill="#fff" opacity="0.9"/>`,()=>`<path d="M18.5 38 q5 -6.5 10 0" stroke="${LINE}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M35.5 38 q5 -6.5 10 0" stroke="${LINE}" stroke-width="3" fill="none" stroke-linecap="round"/>`,(iris,irisDark)=>`<path d="M18.5 35 l10 0" stroke="${LINE}" stroke-width="2.8" stroke-linecap="round"/><path d="M35.5 35 l10 0" stroke="${LINE}" stroke-width="2.8" stroke-linecap="round"/><path d="M20.5 35.8 a3.6 4 0 0 0 7.2 0 z" fill="${irisDark}"/><path d="M37.5 35.8 a3.6 4 0 0 0 7.2 0 z" fill="${irisDark}"/><path d="M22 35.8 a2 2.2 0 0 0 4 0 z" fill="${iris}"/><path d="M39 35.8 a2 2.2 0 0 0 4 0 z" fill="${iris}"/>`],MOUTHS=[()=>`<path d="M27.5 46.5 q2.3 2.6 4.5 0 q2.2 2.6 4.5 0" stroke="${LINE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,()=>`<path d="M27 46 a5 4.6 0 0 0 10 0 z" fill="#9e3a30" stroke="${LINE}" stroke-width="1.8"/><path d="M29.5 49.2 a2.6 1.8 0 0 1 5 0 z" fill="#e9756a"/>`,()=>`<path d="M27 46 q5 4.4 10 0" stroke="${LINE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`],HAIRS=[(c,hi)=>`<path d="M8 44 q-2 -26 24 -28 q26 2 24 28 l-5 3 q3 -8 1 -14 l-3 6 -3 -8 -4 6 -4 -8 -3 7 -4 -7 -4 8 -4 -6 -3 8 -3 -6 q-2 6 1 14 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 24 q8 -7 18 -7 q10 0 18 7 q-8 -3 -18 -3 q-10 0 -18 3 z" fill="${hi}" opacity="0.85"/>`,(c,hi)=>`<path d="M9 42 q-7 -4 -3 -10 q-6 -2 0 -8 q2 -12 26 -12 q24 0 26 12 q6 6 0 8 q4 6 -3 10 l-4 1 q2 -6 0 -10 l-4 5 -3 -9 -5 6 -5 -9 -4 8 -5 -7 -4 9 -4 -5 q-2 4 0 10 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M15 22 q8 -6 17 -6 q9 0 17 6 q-8 -2.5 -17 -2.5 q-9 0 -17 2.5 z" fill="${hi}" opacity="0.85"/>`,(c,hi)=>`<path d="M10 58 q-4 -18 -2 -30 q4 -14 24 -14 q20 0 24 14 q2 12 -2 30 l-6 -2 q3 -12 2 -22 l-4 6 -3 -9 -5 6 -4 -9 -4 8 -5 -7 -4 8 -4 -5 q-1 10 2 22 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M15 23 q8 -6 17 -6 q9 0 17 6 q-8 -2.5 -17 -2.5 q-9 0 -17 2.5 z" fill="${hi}" opacity="0.85"/>`,(c,hi)=>`<path d="M8 40 q-2 -25 24 -25 q26 0 24 25 q-1 5 -5 6 q2 -5 1 -9 l-4 5 -3 -7 -5 5 -4 -7 -4 6 -4 -6 -4 7 -5 -5 -3 7 -4 -5 q-1 4 1 9 q-4 -1 -5 -6 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 24 q9 -6.5 18 -6.5 q9 0 18 6.5 q-9 -3 -18 -3 q-9 0 -18 3 z" fill="${hi}" opacity="0.85"/>`],ACCENTS=[c=>`<path d="M32 16 q-2 -8 4 -11 q-1 5 1 7 q3 -3 7 -2 q-5 2 -6 7 z" fill="${c}" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>`,c=>`<path d="M13 26 q-3 -12 3 -16 q6 3 7 13 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M51 26 q3 -12 -3 -16 q-6 3 -7 13 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M15.5 24 q-1.5 -7 1.5 -10 q3 2 4 8 z" fill="#fff" opacity="0.75"/><path d="M48.5 24 q1.5 -7 -1.5 -10 q-3 2 -4 8 z" fill="#fff" opacity="0.75"/>`,()=>""];function shade(hex,f){let m=/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);if(!m)return"#5a4636";let c=x=>Math.max(0,Math.min(255,Math.floor(parseInt(x,16)*f)));return`rgb(${c(m[1])},${c(m[2])},${c(m[3])})`}function anonymousIdenticonDataUrl(userId,sizePx=64){let s=String(userId||"").trim();if(!s)return"";let n=Math.max(16,Math.min(128,Number(sizePx)||64)),h=hashString(s),bg=`hsl(${(h>>>15)%360},55%,90%)`,skin=SKIN_TONES[h%SKIN_TONES.length],[hairC,hairHi]=HAIR_COLORS[(h>>>3)%HAIR_COLORS.length],iris=shade(hairC,.9),irisDark=shade(hairC,.45),eyes=EYES[(h>>>7)%EYES.length],mouth=MOUTHS[(h>>>10)%MOUTHS.length],hairShape=HAIRS[(h>>>12)%HAIRS.length],accent=ACCENTS[(h>>>21)%ACCENTS.length],blushStrong=(h>>>20&1)===1,blush=`<ellipse cx="17" cy="44" rx="4.4" ry="2.6" fill="#ff9d9d" opacity="${blushStrong?.8:.45}"/><ellipse cx="47" cy="44" rx="4.4" ry="2.6" fill="#ff9d9d" opacity="${blushStrong?.8:.45}"/>`,k=n/64,svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"><rect width="100%" height="100%" fill="${bg}"/><g transform="scale(${k})">`+accent(hairC)+`<path d="M13 38 a19 19 0 1 0 38 0 a19 21 0 0 0 -38 0 z" fill="${skin}" stroke="${LINE}" stroke-width="2.2"/>`+hairShape(hairC,hairHi)+blush+eyes(iris,irisDark)+mouth()+"</g></svg>";return`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}function tailStorageKey(liveId){return`nls_ctail_${String(liveId||"").trim().toLowerCase()}`}function venueSpeechKey(row){if(!row||typeof row!="object")return"";let no=row.commentNo??row.no;if(no!=null&&String(no).trim())return`no:${String(no).trim()}`;if(row.id!=null&&String(row.id).trim())return`id:${String(row.id).trim()}`;let uid=String(row.userId??"").trim(),text=String(row.text??"").trim(),cap=row.capturedAt!=null?String(row.capturedAt):"";return`c:${uid}:${text}:${cap}`}function venueSpeakerKey(row){let uid=String(row?.userId??"").trim();if(uid)return`u:${uid}`;let name=String(row?.name??"").trim();return name?`n:${name}`:""}function liveFeedSpeechRows(rows){if(!Array.isArray(rows))return[];let out=[];for(let r of rows){if(!r||typeof r!="object")continue;let no=r.commentNo??r.no;no!=null&&String(no).trim()&&out.push(r)}return out}function pickNewVenueSpeech(rows,state={},opts={}){let list=Array.isArray(rows)?rows:[],maxEmit=Number.isFinite(opts.maxEmit)&&opts.maxEmit>0?Math.floor(opts.maxEmit):8,primeEmit=Number.isFinite(opts.primeEmit)&&opts.primeEmit>0?Math.floor(opts.primeEmit):0,seen=state.seenKeys instanceof Set?new Set(state.seenKeys):new Set,wasPrimed=state.primed===!0,speakable=[];for(let r of list){if(!r||typeof r!="object")continue;let text=String(r.text??"").trim();if(!text)continue;let key=venueSpeechKey(r);key&&speakable.push({row:r,key,text})}let primeSet=null;if(!wasPrimed){primeSet=new Set(speakable.slice(Math.max(0,speakable.length-primeEmit)).map(s=>s.key));for(let s of speakable)primeSet.has(s.key)||seen.add(s.key);if(primeEmit<=0)return{speeches:[],seenKeys:seen,primed:!0}}let fresh=[];for(let s of speakable){if(seen.has(s.key))continue;seen.add(s.key);let speakerKey=venueSpeakerKey(s.row);speakerKey&&fresh.push({key:s.key,speakerKey,userId:String(s.row.userId??"").trim(),name:String(s.row.name??"").trim(),text:s.text})}let speeches=fresh.length>maxEmit?fresh.slice(fresh.length-maxEmit):fresh,SEEN_CAP=4e3;if(seen.size>SEEN_CAP){let arr=Array.from(seen);return{speeches,seenKeys:new Set(arr.slice(arr.length-SEEN_CAP)),primed:!0}}return{speeches,seenKeys:seen,primed:!0}}function mergeSpeakersIntoVenueRows(baseRows,speeches,nowMs){let base=Array.isArray(baseRows)?baseRows:[],talks=Array.isArray(speeches)?speeches:[],now=Number.isFinite(Number(nowMs))?Number(nowMs):0,byUid=new Map,out=[];for(let r of base){if(!r||typeof r!="object")continue;let uid=String(r.userId??"").trim(),row={userId:uid,name:String(r.name??"").trim(),avatar:String(r.avatar??"").trim(),text:String(r.text??""),capturedAt:Number.isFinite(Number(r.capturedAt))?Number(r.capturedAt):0};out.push(row),uid&&byUid.set(uid,row)}for(let sp of talks){if(!sp||typeof sp!="object")continue;let uid=String(sp.userId??"").trim(),name=String(sp.name??"").trim();if(!uid&&!name)continue;let existing=uid?byUid.get(uid):null;if(existing)existing.capturedAt=now,name&&!existing.name&&(existing.name=name);else{let row={userId:uid,name,avatar:"",text:"",capturedAt:now};out.push(row),uid&&byUid.set(uid,row)}}return out}function isContextInvalidatedError(err){return(err&&typeof err=="object"&&"message"in err?String(err.message||""):String(err||"")).includes("Extension context invalidated")}function updateSpeechStreak(state,speakerKey,nowMs,opts={}){let key=String(speakerKey||"").trim();if(!key||!(state instanceof Map))return{count:1,isContinuation:!1};let now=Number.isFinite(Number(nowMs))?Number(nowMs):0,gap=Number.isFinite(Number(opts.gapMs))&&opts.gapMs>0?Number(opts.gapMs):6e3,max=Number.isFinite(Number(opts.max))&&opts.max>0?Math.floor(opts.max):5,prev=state.get(key),count,isContinuation;return prev&&now-prev.lastAt<=gap?(count=Math.min(max,prev.count+1),isContinuation=!0):(count=1,isContinuation=!1),state.set(key,{count,lastAt:now}),{count,isContinuation}}function pruneSpeechStreaks(state,nowMs,ttlMs=6e3*3){if(!(state instanceof Map))return 0;let now=Number.isFinite(Number(nowMs))?Number(nowMs):0,ttl=Number.isFinite(Number(ttlMs))&&ttlMs>0?Number(ttlMs):6e3*3,removed=0;for(let[key,v]of state)now-v.lastAt>ttl&&(state.delete(key),removed+=1);return removed}function streakGlowStage(count){let c=Math.floor(Number(count)||0);return c<=1?0:Math.min(4,c-1)}function streakBubbleLifetimeMs(count,baseMs){let base=Number.isFinite(Number(baseMs))&&baseMs>0?Number(baseMs):4e3,c=Math.floor(Number(count)||0);return c<=1?base:Math.min(base*2,base+(c-1)*500)}var BUBBLE_FLOW_LIFETIME_MIN_MS=1200;function resolveBubbleFlowLifetimeMs(commentsPerSec,baseMs){let base=Number.isFinite(Number(baseMs))&&baseMs>0?Number(baseMs):4e3,rate=Number(commentsPerSec);if(!Number.isFinite(rate)||rate<=1)return base;let scaled=base/Math.sqrt(rate);return Math.max(BUBBLE_FLOW_LIFETIME_MIN_MS,Math.round(scaled))}function isHttpUrl(u){return/^https?:\/\//i.test(String(u||"").trim())}function enrichVenueRowsWithProfileAvatars(rows,profileMap){let list=Array.isArray(rows)?rows:[],map=profileMap&&typeof profileMap=="object"&&!Array.isArray(profileMap)?profileMap:{},out=[];for(let r of list){if(!r||typeof r!="object")continue;let userId=String(r.userId||"").trim(),name=String(r.name||"").trim(),capturedAt=Number.isFinite(Number(r.capturedAt))?Number(r.capturedAt):0,avatar=String(r.avatar||"").trim(),observed=isHttpUrl(avatar);if(!observed&&userId){let profileAvatar=String(map[userId]?.avatarUrl??"").trim();isHttpUrl(profileAvatar)&&isAvatarUrlForUserId2(profileAvatar,userId)&&(avatar=profileAvatar,observed=!0)}out.push({userId,name,avatar,text:String(r.text||""),capturedAt,avatarObserved:observed})}return out}function nicoUserPageUrl(userId){let uid=String(userId??"").trim();return/^\d{1,18}$/.test(uid)?`https://www.nicovideo.jp/user/${uid}`:""}function anonymousDisplayLabel(anonKey){let key=String(anonKey??"").trim(),digits=key.replace(/\D+/g,"");if(digits.length>0){let tail=digits.slice(-3),n=Number(tail);if(Number.isFinite(n)&&n>0)return`\u533F\u540D${n}`}let h=0;for(let i=0;i<key.length;i+=1)h=(h*31+key.charCodeAt(i))%1e5;return`\u533F\u540D${h%999+1}`}function seatsPerRow(availableWidthPx,seatMinWidthPx){let w=Math.max(0,Number(availableWidthPx)||0),sw=Math.max(1,Number(seatMinWidthPx)||1);return Math.max(1,Math.floor(w/sw))}function resolveDynamicArenaCap(total,opts={}){let n=Math.max(0,Math.floor(Number(total)||0)),base=Math.max(1,Math.floor(Number(opts.base??60))),ratio=Number(opts.ratio??.5)>0?Number(opts.ratio??.5):.5,max=Math.max(base,Math.floor(Number(opts.max??150))),byRatio=Math.floor(n*ratio);return Math.min(max,Math.max(base,byRatio))}function resolveVenueMaxHeightVh(total){let n=Math.max(0,Math.floor(Number(total)||0));return n<=16?48:n<=64?56:n<=150?64:72}function resolveVisibleArenaCount(opts){let total=Math.max(0,Math.floor(Number(opts?.totalCount)||0)),perRow=Math.max(1,Math.floor(Number(opts?.perRow)||1)),rows=Math.max(1,Math.floor(Number(opts?.rows??3))),hardCap=opts?.hardCap!=null?Math.max(1,Math.floor(Number(opts.hardCap))):resolveDynamicArenaCap(total),byGrid=perRow*rows;return Math.min(total,byGrid,hardCap)}function selectStableVisibleMembers(ordered,visibleCount,recentlySpokenKeys,keyOf){let list=Array.isArray(ordered)?ordered:[],cap=Math.max(0,Math.floor(Number(visibleCount)||0));if(cap===0||list.length===0)return[];if(list.length<=cap)return list.slice();let getKey=typeof keyOf=="function"?keyOf:row=>String(row?.key||row?.userId||row?.name||"").trim(),spoken=recentlySpokenKeys instanceof Set?recentlySpokenKeys:new Set(Array.isArray(recentlySpokenKeys)?recentlySpokenKeys.map(k=>String(k)):[]),picked=[],pickedIdx=new Set;if(spoken.size>0)for(let i=0;i<list.length&&picked.length<cap;i+=1){let k=getKey(list[i]);k&&spoken.has(k)&&(picked.push(i),pickedIdx.add(i))}for(let i=0;i<list.length&&picked.length<cap;i+=1)pickedIdx.has(i)||(picked.push(i),pickedIdx.add(i));return picked.sort((a,b)=>a-b),picked.map(i=>list[i])}function partitionThumbnailFirst(list,hasThumb){let arr=Array.isArray(list)?list:[],pred=typeof hasThumb=="function"?hasThumb:()=>!1,withThumb=[],without=[];for(let entry of arr)pred(entry)?withThumb.push(entry):without.push(entry);return[...withThumb,...without]}function initVenueDragState(){return{active:!1,moved:!1,startY:0,startScrollTop:0}}function beginVenueDrag(pointerY,scrollTop){return{active:!0,moved:!1,startY:Number(pointerY)||0,startScrollTop:Math.max(0,Number(scrollTop)||0)}}function updateVenueDrag(state,pointerY,maxScrollTop){if(!state||!state.active)return{state:state||initVenueDragState(),scrollTop:0};let delta=(Number(pointerY)||0)-state.startY,max=Math.max(0,Number(maxScrollTop)||0),raw=state.startScrollTop-delta,scrollTop=Math.min(max,Math.max(0,raw)),moved=state.moved||Math.abs(delta)>=6;return{state:{...state,moved},scrollTop}}function endVenueDrag(state){let wasDrag=!!(state&&state.active&&state.moved);return{state:initVenueDragState(),wasDrag}}function buildVenueRoster(input={}){let allSeats=Array.isArray(input.allSeats)?input.allSeats:[],visibleSeats=Array.isArray(input.visibleSeats)?input.visibleSeats:[],audienceCount=Math.max(0,Math.floor(Number(input.audienceCount)||0)),visibleKeys=new Set(visibleSeats.map(s=>String(s?.participant?.key||s?.participant?.userId||"").trim())),rows=allSeats.map(s=>{let p=s?.participant||{},key=String(p.key||p.userId||"").trim(),hasThumb=participantHasEffectiveThumbnail(p);return{seatIndex:Number(s?.seatIndex)||0,userId:String(p.userId||"").trim(),name:String(p.name||"").trim(),hasThumb,visible:visibleKeys.has(key),isGift:!!p.hasGift}});rows.sort((a,b)=>a.seatIndex-b.seatIndex);let withThumb=rows.filter(r=>r.hasThumb).length,thumbVisible=rows.filter(r=>r.hasThumb&&r.visible).length,visible=rows.filter(r=>r.visible).length;return{rows,summary:{total:rows.length,visible,hidden:rows.length-visible,withThumb,thumbVisible,audience:audienceCount}}}function formatVenueRosterSummary(summary){let s=summary||{},total=Number(s.total)||0,visible=Number(s.visible)||0,withThumb=Number(s.withThumb)||0,thumbVisible=Number(s.thumbVisible)||0,audience=Number(s.audience)||0;return`\u5E2D\u3092\u6301\u3064\u53C2\u52A0\u8005 ${total}\u4EBA / \u753B\u9762\u8868\u793A\u4E2D ${visible}\u4EBA / \u96A0\u308C ${total-visible}\u4EBA \u30FB\u30B5\u30E0\u30CD\u6301\u3061 ${withThumb}\u4EBA(\u3046\u3061\u8868\u793A ${thumbVisible}\u4EBA) \u30FB \u5F8C\u65B9\u89B3\u5BA2(\u70B9\u63CF) ${audience}\u4EBA`}function bubbleAnchorForSeatRect(seatRect,gap=10){let left=Number(seatRect?.left)||0,top=Number(seatRect?.top)||0,width=Number(seatRect?.width)||0,g=Number(gap)||0;return{x:Math.round(left+width/2),y:Math.round(top-g)}}function resolveBubbleY(candidate,placed,opts){let xThreshold=Number(opts?.xThreshold??120),vGap=Number(opts?.vGap??6),minY=Number(opts?.minY??8),h=Math.max(0,Number(candidate?.h)||0),y=Number(candidate?.y)||0,x=Number(candidate?.x)||0,list=Array.isArray(placed)?placed:[],moved=!0,guard=0;for(;moved&&guard<16;){moved=!1,guard+=1;for(let p of list){let px=Number(p?.x)||0;if(Math.abs(px-x)>xThreshold)continue;let pTop=(Number(p?.y)||0)-Math.max(0,Number(p?.h)||0),pBottom=Number(p?.y)||0;y-h<pBottom&&y>pTop&&(y=pTop-vGap,moved=!0)}}return y-h<minY&&(y=minY+h),Math.round(y)}function clamp01(v){let n=Number(v);return Number.isFinite(n)?n<0?0:n>1?1:n:0}function resolveCrowdMotionProfile(heatLevel){let h=clamp01(heatLevel),periodMs=3600-h*2400,swayDeg=4+h*18,breathePx=.018+h*.022,desync=h*.28;return{periodMs,swayDeg,breathePx,desync}}function resolveCrowdSpriteMotion(timeMs,unitPhase,profile){let t=Number(timeMs)||0,period=Math.max(200,profile.periodMs||3600),u=clamp01(unitPhase),phase=t/period*Math.PI*2+u*Math.PI*2*profile.desync,swayRad=Math.sin(phase)*((profile.swayDeg||0)*Math.PI/180),breathePhase=t/(period*1.7)*Math.PI*2+u*Math.PI*.5*profile.desync,breathe=-(Math.sin(breathePhase)*.5+.5)*(profile.breathePx||0);return{swayRad,breathe}}function resolveCrowdRenderPlan(count){let n=Math.max(0,Math.floor(Number(count)||0));return n<=0?{spriteCap:0,glow:!1,lightStick:!1}:n<=600?{spriteCap:n,glow:!0,lightStick:!0}:n<=1e3?{spriteCap:n,glow:!1,lightStick:!0}:n<=2048?{spriteCap:1e3,glow:!1,lightStick:!0}:{spriteCap:800,glow:!1,lightStick:!1}}function xorshift32(state){let x=state||1;return x^=x<<13,x^=x>>>17,x^=x<<5,x>>>0}var SILHOUETTES=[{type:"round"},{type:"square"}],LIGHTSTICK_COLORS=["#ff3366","#33ccff","#ffcc00","#66ff66","#cc66ff","#ff8833","#ffffff"];function drawAudience(ctx,x,y,size,depth,spriteType,lightColor,detail={},motion={}){let wantStick=detail.lightStick!==!1,wantGlow=detail.glow!==!1,swayRad=Number(motion.swayRad)||0,breatheY=(Number(motion.breathe)||0)*size;y+=breatheY;let alpha=.2+depth*.8,lightness=Math.floor(10+depth*25);if(ctx.globalAlpha=alpha,ctx.fillStyle=`rgb(${lightness}, ${lightness+5}, ${lightness+15})`,ctx.beginPath(),spriteType==="round"?(ctx.arc(x,y-size*.5,size*.45,0,Math.PI*2),ctx.moveTo(x-size*.7,y+size*.4),ctx.quadraticCurveTo(x,y-size*.2,x+size*.7,y+size*.4),ctx.lineTo(x+size*.7,y+size),ctx.lineTo(x-size*.7,y+size)):(ctx.roundRect(x-size*.4,y-size,size*.8,size*.9,size*.2),ctx.moveTo(x-size*.6,y+size*.5),ctx.lineTo(x,y-size*.1),ctx.lineTo(x+size*.6,y+size*.5),ctx.lineTo(x+size*.6,y+size),ctx.lineTo(x-size*.6,y+size)),ctx.fill(),!wantStick)return;let stickX=x+size*.4,stickY=y-size*.2,stickLength=size*.8,stickWidth=Math.max(1.5,size*.15),baseDX=size*.1,baseDY=-stickLength,cos=Math.cos(swayRad),sin=Math.sin(swayRad),tipX=stickX+(baseDX*cos-baseDY*sin),tipY=stickY+(baseDX*sin+baseDY*cos);ctx.globalAlpha=depth*.9+.1,ctx.lineCap="round",ctx.lineWidth=stickWidth,ctx.strokeStyle="#ffffff",ctx.beginPath(),ctx.moveTo(stickX,stickY),ctx.lineTo(tipX,tipY),ctx.stroke(),ctx.globalAlpha=depth*.6+.1,ctx.lineWidth=stickWidth*3,ctx.strokeStyle=lightColor,ctx.stroke(),wantGlow&&(ctx.globalCompositeOperation="screen",ctx.globalAlpha=depth*.3,ctx.lineWidth=stickWidth*6,ctx.stroke(),ctx.globalCompositeOperation="source-over")}function drawCrowdOnCanvas(canvas,count,seed=12345,anim=null){let ctx=canvas.getContext("2d",{alpha:!0});if(!ctx)return;let w=canvas.width,h=canvas.height;if(ctx.clearRect(0,0,w,h),count<=0)return;let plan=resolveCrowdRenderPlan(count),maxDraw=Math.max(0,Math.min(count,plan.spriteCap));if(maxDraw<=0)return;let detail={glow:plan.glow,lightStick:plan.lightStick},rngState=seed+count>>>0,motionProfile=anim?resolveCrowdMotionProfile(anim.heatLevel??0):null,timeMs=anim&&Number(anim.timeMs)||0,positions=[];for(let i=0;i<maxDraw;i++){rngState=xorshift32(rngState);let r=rngState/4294967295,normalizedIndex=i/maxDraw,depth=1-Math.pow(normalizedIndex,.6);rngState=xorshift32(rngState);let angleRng=rngState/4294967295,xPos=w*.5+(angleRng-.5)*w*1.8,xDist=Math.abs((xPos-w*.5)/(w*.5)),curveY=Math.pow(xDist,1.5)*depth*h*.3,yPos=depth*h*.85-curveY+r*h*.15+h*.1,size=Math.max(2,5+depth*35);rngState=xorshift32(rngState);let spriteType=SILHOUETTES[rngState%SILHOUETTES.length].type;rngState=xorshift32(rngState);let lightColor=LIGHTSTICK_COLORS[rngState%LIGHTSTICK_COLORS.length],unitPhase=(xPos/w+2)%1;positions.push({x:xPos,y:yPos,size,depth,spriteType,lightColor,unitPhase})}positions.sort((a,b)=>a.y-b.y);for(let p of positions){let motion=motionProfile?resolveCrowdSpriteMotion(timeMs,p.unitPhase,motionProfile):void 0;drawAudience(ctx,p.x,p.y,p.size,p.depth,p.spriteType,p.lightColor,detail,motion)}}function resolveVenueHeatLevel(rows,opts={}){let list=Array.isArray(rows)?rows:[],now=Number.isFinite(opts.now)?Number(opts.now):Date.now(),windowMs=Number.isFinite(opts.windowMs)&&opts.windowMs>0?Number(opts.windowMs):2e4,fullPerMin=Number.isFinite(opts.fullPerMin)&&opts.fullPerMin>0?Number(opts.fullPerMin):60,since=now-windowMs,countInWindow=0;for(let r of list){let at=Number(r?.capturedAt);if(!Number.isFinite(at))continue;(at>now?now:at)>=since&&(countInWindow+=1)}if(countInWindow<=0)return 0;let perMin=countInWindow*(6e4/windowMs),level=Math.log1p(perMin)/Math.log1p(fullPerMin);return Math.max(0,Math.min(1,level))}function heatLevelToWarmColor(level){let t=Number.isFinite(level)?Math.max(0,Math.min(1,level)):0,cool=[70,90,140],warm=[255,150,60],mix=(a,b2)=>Math.round(a+(b2-a)*t),r=mix(cool[0],warm[0]),g=mix(cool[1],warm[1]),b=mix(cool[2],warm[2]);return`rgb(${r}, ${g}, ${b})`}function heatLevelToGlowOpacity(level,opts={}){let t=Number.isFinite(level)?Math.max(0,Math.min(1,level)):0,min=Number.isFinite(opts.min)?Math.max(0,Math.min(1,opts.min)):.06,max=Number.isFinite(opts.max)?Math.max(0,Math.min(1,opts.max)):.34;return min+(max-min)*t}function heatLevelToLabel(level){let t=Number.isFinite(level)?Math.max(0,Math.min(1,level)):0;return t<.15?"\u9759\u304B":t<.45?"\u304A\u3060\u3084\u304B":t<.75?"\u76DB\u308A\u4E0A\u304C\u308A":"\u5927\u76DB\u6CC1"}var VOICEVOX_BASE_URL="http://127.0.0.1:50021";function positiveTimeout(value,fallback){let timeout=Number(value);return Number.isFinite(timeout)&&timeout>0?timeout:fallback}function isExtensionPage(){try{return typeof chrome<"u"&&chrome.runtime&&typeof chrome.runtime.getURL=="function"&&typeof location<"u"&&location.protocol==="chrome-extension:"}catch{return!1}}async function proxyFetchFn(url,init){return isExtensionPage()?globalThis.fetch(url,init):typeof chrome<"u"&&chrome.runtime&&chrome.runtime.sendMessage?new Promise((resolve,reject)=>{let safeInit={...init};"signal"in safeInit&&delete safeInit.signal,chrome.runtime.sendMessage({type:"NLS_FETCH_PROXY",url:url.toString(),init:safeInit,wantBuffer:!1},res=>{if(chrome.runtime.lastError)return reject(new Error(chrome.runtime.lastError.message));if(!res||res.error)return reject(new Error(res?.error||"Proxy fetch failed"));resolve(new Response(res.text,{status:res.status}))})}):globalThis.fetch(url,init)}async function proxyFetchBufferFn(url,init){return isExtensionPage()?globalThis.fetch(url,init):typeof chrome<"u"&&chrome.runtime&&chrome.runtime.sendMessage?new Promise((resolve,reject)=>{let safeInit={...init};"signal"in safeInit&&delete safeInit.signal,chrome.runtime.sendMessage({type:"NLS_FETCH_PROXY",url:url.toString(),init:safeInit,wantBuffer:!0},res=>{if(chrome.runtime.lastError)return reject(new Error(chrome.runtime.lastError.message));if(!res||res.error)return reject(new Error(res?.error||"Proxy fetch failed"));let uint8=new Uint8Array(res.buffer);resolve({ok:res.ok,status:res.status,arrayBuffer:async()=>uint8.buffer})})}):globalThis.fetch(url,init)}async function fetchWithTimeout(fetchFn,url,init,timeoutMs){let controller=new AbortController,timer=0,timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort(),reject(new Error("voicevox_timeout"))},timeoutMs)});try{return await Promise.race([Promise.resolve().then(()=>fetchFn(url,{...init,signal:controller.signal})),timeout])}finally{clearTimeout(timer)}}function defaultVoicevoxAliveTimeoutMs(viaProxy){return viaProxy?5e3:1500}async function isVoicevoxAlive(opts={}){let fetchFn=opts.fetchFn||proxyFetchFn;if(typeof fetchFn!="function")return!1;let baseUrl=String(opts.baseUrl||VOICEVOX_BASE_URL).replace(/\/+$/,""),viaProxy=!opts.fetchFn&&!isExtensionPage(),fallbackTimeout=defaultVoicevoxAliveTimeoutMs(viaProxy);try{return(await fetchWithTimeout(fetchFn,`${baseUrl}/version`,{method:"GET"},positiveTimeout(opts.timeoutMs,fallbackTimeout)))?.ok!==!1}catch{return!1}}function isWhisperStyleName(styleName){let name=String(styleName||"");return/ささやき|囁き|ウィスパ|whisper/i.test(name)}async function listVoicevoxStyleIds(opts={}){let fetchFn=opts.fetchFn||proxyFetchFn;if(typeof fetchFn!="function")return[];let baseUrl=String(opts.baseUrl||VOICEVOX_BASE_URL).replace(/\/+$/,"");try{let response=await fetchWithTimeout(fetchFn,`${baseUrl}/speakers`,{method:"GET"},positiveTimeout(opts.timeoutMs,3e3));if(!response||response.ok===!1)return[];let speakers=await response.json();if(!Array.isArray(speakers))return[];let ids=[],seen=new Set;for(let speaker of speakers)if(!(!speaker||typeof speaker!="object"||!Array.isArray(speaker.styles)))for(let style of speaker.styles){let id=Number(style?.id);!Number.isInteger(id)||id<0||seen.has(id)||isWhisperStyleName(style?.name)||(seen.add(id),ids.push(id))}return ids}catch{return[]}}async function synthesizeVoice(text,voice,opts={}){let readingText=String(text||"").trim(),fetchFn=opts.fetchFn||proxyFetchFn,fetchBufferFn=opts.fetchFn?opts.fetchFn:proxyFetchBufferFn;if(!readingText||typeof fetchFn!="function")return null;let baseUrl=String(opts.baseUrl||VOICEVOX_BASE_URL).replace(/\/+$/,""),styleId=Number.isFinite(Number(voice?.styleId))?Number(voice.styleId):3,pitchOffset=Number.isFinite(Number(voice?.pitchOffset))?Number(voice.pitchOffset):0,speedOffset=Number.isFinite(Number(voice?.speedOffset))?Number(voice.speedOffset):0,query=new URLSearchParams({text:readingText,speaker:String(styleId)});try{let queryResponse=await fetchWithTimeout(fetchFn,`${baseUrl}/audio_query?${query}`,{method:"POST"},positiveTimeout(opts.audioQueryTimeoutMs,3e3));if(!queryResponse||queryResponse.ok===!1)return null;let audioQuery=await queryResponse.json();if(!audioQuery||typeof audioQuery!="object")return null;let pitchScale=Number(audioQuery.pitchScale),speedScale=Number(audioQuery.speedScale);audioQuery.pitchScale=(Number.isFinite(pitchScale)?pitchScale:0)+pitchOffset,audioQuery.speedScale=(Number.isFinite(speedScale)?speedScale:1)+speedOffset;let synthesisRes=await fetchWithTimeout(fetchBufferFn,`${baseUrl}/synthesis?speaker=${styleId}`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"audio/wav"},body:JSON.stringify(audioQuery)},positiveTimeout(opts.synthesisTimeoutMs,8e3));return!synthesisRes||synthesisRes.ok===!1?null:await synthesisRes.arrayBuffer()}catch{return null}}function buildVoiceReadingText(row,{maxChars=60}={}){let rawText=String(row?.text||"").trim();if(!rawText)return"";let rawMaxChars=Number(maxChars),limit=Number.isFinite(rawMaxChars)&&rawMaxChars>=1?Math.floor(rawMaxChars):60,body=Array.from(rawText.replace(/(?:https?:\/\/|www\.)[^\s]+/gi,"URL\u7701\u7565").replace(/\s+/g," ").trim()).slice(0,limit).join("");if(!body)return"";let name=String(row?.name||"").trim();return name?`${name}\u3001${body}`:body}function buildMergedVoiceText(item,{maxChars}={}){let text=buildVoiceReadingText({name:item?.name,text:item?.body},{maxChars});if(!text)return"";let rawCount=Number(item?.count),count=Number.isFinite(rawCount)&&rawCount>=1?Math.floor(rawCount):1;return count>1?`${text}\u3001\u307B\u304B${count-1}\u4EF6`:text}var VOICE_STALE_BACKLOG_QUEUE=Number.POSITIVE_INFINITY,VOICE_STALE_MS_HIGH_PRIORITY=1e4;function isVoiceItemStale(enqueuedAt,now,queueLength,isHighPriority=!1){if(typeof enqueuedAt!="number"||typeof now!="number"||typeof queueLength!="number")return{stale:!1,reason:""};if(enqueuedAt>now||enqueuedAt<=0)return{stale:!1,reason:""};let ageMs=now-enqueuedAt;if(isHighPriority)return ageMs>VOICE_STALE_MS_HIGH_PRIORITY?{stale:!0,reason:`age ${ageMs}ms > ${VOICE_STALE_MS_HIGH_PRIORITY}ms (high priority)`}:{stale:!1,reason:""};let thresholdMs=8e3;return ageMs>thresholdMs?{stale:!0,reason:`age ${ageMs}ms > ${thresholdMs}ms (q: ${queueLength})`}:{stale:!1,reason:""}}function pushVoiceQueue(queue,item,{max=5}={}){let current=Array.isArray(queue)?[...queue]:[];if(item&&typeof item=="object"&&item.priority==="high"){let insertIdx=current.findIndex(x=>!x||typeof x!="object"||x.priority!=="high");insertIdx<0?current.push(item):current.splice(insertIdx,0,item)}else current.push(item);let rawMax=Number(max),limit=Number.isFinite(rawMax)?Math.max(0,Math.floor(rawMax)):5,dropCount=Math.max(0,current.length-limit);return{queue:current.slice(dropCount),dropped:current.slice(0,dropCount)}}function mergeRepeatedVoiceItem(queue,candidate){let current=Array.isArray(queue)?[...queue]:[];if(!candidate||typeof candidate!="object")return{queue:current,merged:!1};let index=current.findIndex(existing2=>existing2&&typeof existing2=="object"&&existing2.body===candidate.body);if(index<0)return{queue:current,merged:!1};let existing=current[index],rawCount=Number(existing.count),count=Number.isFinite(rawCount)&&rawCount>=1?Math.floor(rawCount):1;return current[index]={...existing,count:count+1},{queue:current,merged:!0}}function computeVoiceCongestion(queueLength){let rawLength=Number(queueLength),length=Number.isFinite(rawLength)&&rawLength>=0?Math.floor(rawLength):0;return length>=8?{speedBoost:.8,maxChars:30}:length>=5?{speedBoost:.5,maxChars:40}:length>=3?{speedBoost:.3,maxChars:50}:length>=2?{speedBoost:.15,maxChars:60}:{speedBoost:0,maxChars:60}}function resolveVoiceSynthDepth(queueLength,opts={}){let rawLength=Number(queueLength),length=Number.isFinite(rawLength)&&rawLength>=0?Math.floor(rawLength):0,depth;length>=5?depth=3:length>=3?depth=2:depth=1;let rawPending=Number(opts?.pending);return Number.isFinite(rawPending)&&rawPending>=0&&(depth=Math.min(depth,Math.floor(rawPending))),depth}var VoicePlayer=class{constructor(deps={}){this.storage=deps.storage,this.onToggle=deps.onToggle||(()=>{}),this.onStatus=deps.onStatus||(()=>{}),this.onLoadingState=deps.onLoadingState||(()=>{}),this.onSkip=deps.onSkip||(()=>{}),this.isObsMode=deps.isObsMode||(()=>!1),this.audioConstructor=deps.audioConstructor,this.createObjectURL=deps.createObjectURL,this.revokeObjectURL=deps.revokeObjectURL,this.fetchVoicevoxAlive=deps.fetchVoicevoxAlive,this.fetchVoiceStyleIds=deps.fetchVoiceStyleIds,this.fetchSynthesizeVoice=deps.fetchSynthesizeVoice,this.resolveVoice=deps.resolveVoice,this.enabled=!1,this.readNameEnabled=!1,this.toggleBusy=!1,this.styleIds=[],this.assignments={},this.queue=[],this.prefetches=new Map,this.playing=!1,this.generation=0,this.stopCurrent=null,this.skipTimer=null}get VOICE_READING_ENABLED_KEY(){return"nls_voice_reading_enabled_v1"}get VOICE_ASSIGNMENTS_KEY(){return"nls_voice_assignments_v1"}get VOICE_READ_NAME_KEY(){return"nls_voice_read_name_enabled_v1"}async initialize(opts={}){if(this.isObsMode())return;let bag={};try{this.storage&&(bag=await this.storage.get([this.VOICE_READING_ENABLED_KEY,this.VOICE_ASSIGNMENTS_KEY,this.VOICE_READ_NAME_KEY]))}catch{bag={}}let rawAssignments=bag[this.VOICE_ASSIGNMENTS_KEY];this.assignments=!rawAssignments||typeof rawAssignments!="object"||Array.isArray(rawAssignments)?{}:rawAssignments,this.readNameEnabled=bag[this.VOICE_READ_NAME_KEY]===!0,this._emitToggle();let forceOn=opts.forceOn===!0;(forceOn||bag[this.VOICE_READING_ENABLED_KEY]===!0)&&await this.enable({persist:forceOn})}_emitToggle(){this.onToggle(this.enabled,this.readNameEnabled,this.toggleBusy)}_showSkipped(count){count<=0||this.onSkip(count)}_notifyDropped(item){if(item&&typeof item.onDropped=="function")try{item.onDropped()}catch{}}stop(){let dropped=this.queue;this.queue=[],this.generation+=1,this.prefetches.clear();for(let item of dropped)this._notifyDropped(item);typeof this.stopCurrent=="function"&&this.stopCurrent(),this.stopCurrent=null}flushPendingQueue(){let dropped=this.queue;this.queue=[],this.prefetches.clear();for(let item of dropped)item&&typeof item.onPlayStart=="function"&&item.onPlayStart(),this._notifyDropped(item);return dropped.length>0&&this._showSkipped(dropped.length),dropped.length}disable({persist=!0}={}){this.enabled=!1,this.toggleBusy=!1,this.stop(),this.onLoadingState("idle"),this._emitToggle(),persist&&this.storage&&this.storage.set({[this.VOICE_READING_ENABLED_KEY]:!1}).catch(()=>{})}async enable({persist=!0}={}){if(this.isObsMode()||this.toggleBusy)return;this.toggleBusy=!0,this._emitToggle(),this.onLoadingState("checking");let alive=await this.fetchVoicevoxAlive();if(alive||(this.onLoadingState("connecting"),alive=await this.fetchVoicevoxAlive()),!alive){this.disable({persist:!0}),this.onLoadingState("notfound");return}this.styleIds=await this.fetchVoiceStyleIds(),this.generation+=1,this.enabled=!0,this.toggleBusy=!1,this.onLoadingState("ready"),this._emitToggle(),persist&&this.storage&&this.storage.set({[this.VOICE_READING_ENABLED_KEY]:!0}).catch(()=>{})}_voiceUserKeyForItem(item){let userId=String(item?.userId||"").trim(),name=String(item?.nickname||"").trim(),key=String(item?.userKey||item?.key||"").trim();return userId||key||name||"anon"}_ensurePrefetch(item,generation){if(!item||generation!==this.generation)return null;let existing=this.prefetches.get(item);if(existing&&existing.generation===generation)return existing.promise;let congestion=computeVoiceCongestion(this.queue.length),assigned=this.resolveVoice(item.userKey,this.assignments,this.styleIds),promise=this.fetchSynthesizeVoice(buildMergedVoiceText(item,{maxChars:congestion.maxChars}),{...assigned,speedOffset:assigned.speedOffset+congestion.speedBoost}).catch(()=>null);return this.prefetches.set(item,{generation,promise}),promise}_startPrefetch(generation){if(generation!==this.generation){this.prefetches.clear();return}let depth=resolveVoiceSynthDepth(this.queue.length,{pending:this.queue.length}),wanted=new Set;for(let i=0;i<depth&&i<this.queue.length;i++){let item=this.queue[i];item&&(wanted.add(item),this._ensurePrefetch(item,generation))}for(let key of this.prefetches.keys())wanted.has(key)||this.prefetches.delete(key)}async _drainQueue(){if(!(this.playing||!this.enabled||this.isObsMode())){this.playing=!0;try{for(;this.enabled&&this.queue.length;){let now=Date.now(),allStale=!0;for(let qItem of this.queue)if(!isVoiceItemStale(qItem.enqueuedAt,now,this.queue.length,qItem.priority==="high").stale){allStale=!1;break}if(allStale&&this.queue.length>0){let newest=this.queue[this.queue.length-1],dropped=this.queue.slice(0,this.queue.length-1);for(let d of dropped)typeof d.onPlayStart=="function"&&d.onPlayStart(),this._notifyDropped(d);this.queue=[newest],dropped.length>0&&this._showSkipped(dropped.length)}let queueLength=this.queue.length,generation=this.generation;this._startPrefetch(generation);let item=this.queue.shift();if(!item)continue;if(isVoiceItemStale(item.enqueuedAt,Date.now(),queueLength,item.priority==="high").stale){typeof item.onPlayStart=="function"&&item.onPlayStart(),this._notifyDropped(item),this._showSkipped(1),this.prefetches.delete(item);continue}let congestion=computeVoiceCongestion(queueLength),assigned=this.resolveVoice(item.userKey,this.assignments,this.styleIds),pf=this.prefetches.get(item);this.prefetches.delete(item);let wav=pf?await pf.promise:await this.fetchSynthesizeVoice(buildMergedVoiceText(item,{maxChars:congestion.maxChars}),{...assigned,speedOffset:assigned.speedOffset+congestion.speedBoost});if(!wav||!this.enabled||generation!==this.generation||this.isObsMode()){typeof item.onPlayStart=="function"&&item.onPlayStart(),this._notifyDropped(item);continue}this._startPrefetch(generation);let objectUrl="";try{let blob=new Blob([wav],{type:"audio/wav"});objectUrl=this.createObjectURL(blob);let AudioCtor=this.audioConstructor,audio=new AudioCtor(objectUrl);await new Promise(resolve=>{let settled=!1,finish=()=>{settled||(settled=!0,audio.removeEventListener("ended",finish),audio.removeEventListener("error",finish),objectUrl&&this.revokeObjectURL(objectUrl),objectUrl="",this.stopCurrent=null,typeof item.onAudioEnd=="function"&&item.onAudioEnd(),resolve())};this.stopCurrent=()=>{try{audio.pause()}catch{}finish()},audio.addEventListener("ended",finish,{once:!0}),audio.addEventListener("error",finish,{once:!0});try{let playResult=audio.play();typeof item.onPlayStart=="function"&&item.onPlayStart(),typeof item.onAudioStart=="function"&&item.onAudioStart(),playResult&&typeof playResult.catch=="function"&&playResult.catch(err=>{err&&err.name==="NotAllowedError"&&(this.onStatus("\u26A0\uFE0F\u30D6\u30E9\u30A6\u30B6\u306B\u3088\u308A\u97F3\u58F0\u304C\u30D6\u30ED\u30C3\u30AF\u3055\u308C\u307E\u3057\u305F\u3002\u30DC\u30BF\u30F3\u3092\u62BC\u3057\u76F4\u3057\u3066\u304F\u3060\u3055\u3044"),this.disable({persist:!1})),finish()})}catch{finish()}})}catch{typeof item.onPlayStart=="function"&&item.onPlayStart(),this._notifyDropped(item),objectUrl&&this.revokeObjectURL(objectUrl)}}}finally{this.playing=!1,this.enabled&&this.queue.length&&this._drainQueue()}}}enqueue(items){if(!this.enabled||this.isObsMode()||!Array.isArray(items))return;let droppedCount=0;for(let item of items){if(!item||item.kind!=="comment"&&item.kind!=="gift")continue;let name=this.readNameEnabled?String(item.nickname||"").trim():"",body="",isHighPriority=!1;if(item.kind==="gift"){isHighPriority=!0;let count=item.gift?.count>1?`\u3092${item.gift.count}\u500B`:"\u3092";body=`\u30AE\u30D5\u30C8\u3001${item.gift?.name||"\u30A2\u30A4\u30C6\u30E0"}${count}\u8D08\u308A\u307E\u3057\u305F\u3002${item.gift?.message||""}`.trim()}else body=String(item.text||"").trim();if(!buildVoiceReadingText({name,text:body}))continue;let candidate={userKey:this._voiceUserKeyForItem(item),name,body,count:1,enqueuedAt:Date.now(),priority:isHighPriority?"high":"normal",onPlayStart:item.onPlayStart,onAudioStart:item.onAudioStart,onAudioEnd:item.onAudioEnd,onDropped:item.onDropped},merged=mergeRepeatedVoiceItem(this.queue,candidate);if(this.queue=merged.queue,merged.merged){typeof candidate.onPlayStart=="function"&&candidate.onPlayStart(),this._notifyDropped(candidate);continue}let pushed=pushVoiceQueue(this.queue,candidate,{max:8});if(this.queue=pushed.queue,pushed.dropped&&pushed.dropped.length>0){for(let dropped of pushed.dropped)typeof dropped.onPlayStart=="function"&&dropped.onPlayStart(),this._notifyDropped(dropped);droppedCount+=pushed.dropped.length}}if(droppedCount>0&&this._showSkipped(droppedCount),this.enabled&&!this.isObsMode()&&this.queue.length)try{this._startPrefetch(this.generation)}catch{}this.queue.length&&this._drainQueue()}kickPrefetch(){if(!(!this.enabled||this.isObsMode()||!this.queue.length))try{this._startPrefetch(this.generation)}catch{}}};function shouldRenderLoading(state,elapsedMs){return state==="connecting"?!0:state!=="checking"?!1:(typeof elapsedMs=="number"&&elapsedMs>=0?elapsedMs:0)>=180}function resolveVoiceLoadingView(state,surface){if(state==="ready"||state==="idle")return{kind:"hidden",text:""};if(state==="notfound")return{kind:"error",text:"VOICEVOX\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093(\u8D77\u52D5\u3057\u3066\u8AAD\u307F\u4E0A\u3052\u3092\u62BC\u3057\u76F4\u3057\u3066\u304F\u3060\u3055\u3044)"};let connecting=state==="connecting";return surface==="venue"?{kind:"loading",text:connecting?"\u{1F3A4} \u30B9\u30C6\u30FC\u30B8\u6E96\u5099\u4E2D\u2026(\u8D77\u52D5\u76F4\u5F8C\u306F\u6570\u79D2\u304B\u304B\u308A\u307E\u3059)":"\u{1F3A4} \u307E\u3082\u306A\u304F\u958B\u6F14\u2026\u58F0\u306E\u6E96\u5099\u4E2D"}:{kind:"loading",text:connecting?"\u{1F3A4} \u63A5\u7D9A\u4E2D\u2026(\u8D77\u52D5\u76F4\u5F8C\u306F\u6570\u79D2\u304B\u304B\u308A\u307E\u3059)":"\u{1F3A4} \u30DE\u30A4\u30AF\u30C1\u30A7\u30C3\u30AF\u4E2D\u2026"}}var BUBBLE_VOICE_AFTERGLOW_MS=500,BUBBLE_PENDING_VOICE_FLOOR_MS=8e3;function resolvePendingLifetimeMs(flowLifetimeMs,voiceEnabled){let flow=typeof flowLifetimeMs=="number"&&flowLifetimeMs>0?flowLifetimeMs:0;return voiceEnabled?Math.max(flow,BUBBLE_PENDING_VOICE_FLOOR_MS):flow}var BUBBLE_VOICE_SPEAKING_CAP_MS=12e3;function nextBubbleVoiceState(current,event){let state=current==="speaking"||current==="done"||current==="unvoiced"?current:"pending";return event==="audioStart"?state==="pending"?"speaking":state:event==="audioEnd"?state==="speaking"||state==="pending"?"done":state:event==="resolved"&&state==="pending"?"unvoiced":state}function bubbleEvictionScore(bubble,now){let state=bubble&&typeof bubble.voiceState=="string"?bubble.voiceState:"pending",createdAt=bubble&&typeof bubble.createdAt=="number"?bubble.createdAt:now,age=Math.max(0,now-createdAt),rank;state==="speaking"?rank=3:state==="done"?rank=2:state==="pending"?rank=1:rank=0;let ageComponent=Math.min(age,1e9);return rank*1e10-ageComponent}function selectBubblesToEvict(bubbles,max,now){let list=Array.isArray(bubbles)?bubbles.slice():[],limit=typeof max=="number"&&max>0?max:0;if(list.length<=limit)return[];let sorted=list.map(b=>({b,score:bubbleEvictionScore(b,now)})).sort((a,b)=>a.score-b.score),evictCount=list.length-limit;return sorted.slice(0,evictCount).map(x=>x.b)}var DEFAULT_VOICE=Object.freeze({styleId:3,pitchOffset:0,speedOffset:0}),PITCH_OFFSETS=Object.freeze([-.06,-.03,0,.03,.06]),SPEED_OFFSETS=Object.freeze([0,.05,.1]);function fnv1a32(value){let bytes=new TextEncoder().encode(String(value??"")),hash=2166136261;for(let byte of bytes)hash^=byte,hash=Math.imul(hash,16777619);return hash>>>0}function normalizeStyleIds(styleIds){return Array.isArray(styleIds)?styleIds.map(styleId=>Number(styleId)).filter(styleId=>Number.isInteger(styleId)&&styleId>=0):[]}function assignVoiceForUser(userKey,styleIds){let styles=normalizeStyleIds(styleIds);if(!styles.length)return{...DEFAULT_VOICE};let hash=fnv1a32(userKey),styleBits=hash&65535,pitchBits=hash>>>16&255,speedBits=hash>>>24&255;return{styleId:styles[styleBits%styles.length],pitchOffset:PITCH_OFFSETS[pitchBits%PITCH_OFFSETS.length],speedOffset:SPEED_OFFSETS[speedBits%SPEED_OFFSETS.length]}}function resolveVoiceForUser(userKey,overrides,styleIds){let key=String(userKey??"");if(overrides&&typeof overrides=="object"&&Object.prototype.hasOwnProperty.call(overrides,key)){let raw=overrides[key];if(raw&&typeof raw=="object"){let fallback=assignVoiceForUser(key,styleIds),styleId=Number(raw.styleId),pitchOffset=Number(raw.pitchOffset),speedOffset=Number(raw.speedOffset);return{styleId:Number.isFinite(styleId)?styleId:fallback.styleId,pitchOffset:Number.isFinite(pitchOffset)?pitchOffset:0,speedOffset:Number.isFinite(speedOffset)?speedOffset:0}}}return assignVoiceForUser(key,styleIds)}var BASE="images/yukkuri-charactore-english",VENUE_FRAME_CHARACTER_THUMBS=Object.freeze({rinku:Object.freeze([`${BASE}/link/link-yukkuri-smile-mouth-open.thumb128.png`,`${BASE}/link/link-yukkuri-normal-mouth-open.thumb128.png`,`${BASE}/link/link-yukkuri-normal-mouth-closed.thumb128.png`,`${BASE}/link/link-yukkuri-blink-mouth-closed.thumb128.png`,`${BASE}/link/link-yukkuri-half-eyes-mouth-closed.thumb128.png`]),konta:Object.freeze([`${BASE}/konta/kitsune-yukkuri-smile-mouth-open.thumb128.png`,`${BASE}/konta/kitsune-yukkuri-normal.thumb128.png`,`${BASE}/konta/kitsune-yukkuri-blink-mouth-closed.thumb128.png`,`${BASE}/konta/kitsune-yukkuri-half-eyes-mouth-closed.thumb128.png`]),tanunee:Object.freeze([`${BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.thumb128.png`,`${BASE}/tanunee/tanuki-yukkuri-normal-mouth-open.thumb128.png`,`${BASE}/tanunee/tanuki-yukkuri-normal-mouth-closed.thumb128.png`,`${BASE}/tanunee/tanuki-yukkuri-blink-mouth-closed.thumb128.png`,`${BASE}/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.thumb128.png`])}),VENUE_FRAME_EDGES=Object.freeze(["top","right","bottom","left"]);function interleaveFrameThumbs(){let lists=[VENUE_FRAME_CHARACTER_THUMBS.rinku,VENUE_FRAME_CHARACTER_THUMBS.konta,VENUE_FRAME_CHARACTER_THUMBS.tanunee],out=[],maxLen=Math.max(...lists.map(l=>l.length));for(let i=0;i<maxLen;i+=1)for(let list of lists)i<list.length&&out.push(list[i]);return out}function distributeFrameSlots(count){let n=Math.max(0,Math.floor(count));if(!n)return[];let per=Math.floor(n/4),extra=n%4,slots=[];for(let e=0;e<4;e+=1){let edge=VENUE_FRAME_EDGES[e],onThisEdge=per+(e<extra?1:0);for(let k=0;k<onThisEdge;k+=1){let pos=onThisEdge===1?.5:.06+k/(onThisEdge-1)*.88;slots.push({edge,pos,edgeIndex:e})}}return slots}function buildVenueCharacterFrame(resolveUrl){let resolve=typeof resolveUrl=="function"?resolveUrl:rel=>rel,thumbs=interleaveFrameThumbs(),slots=distributeFrameSlots(thumbs.length);return thumbs.map((rel,i)=>({src:resolve(rel),edge:slots[i].edge,pos:slots[i].pos}))}function parseGiftCommentText(text){if(typeof text!="string")return null;let trimmed=text.trim();if(!trimmed)return null;let re=/^(?:【[^】]*】\s*)*(.+?)さんがギフト[「『](.+?)[（(](\d+)\s*pt[)）][」』]を贈りました/,m=trimmed.match(re);if(!m)return null;let sender=m[1].trim(),item=m[2].trim(),point=parseInt(m[3],10);if(!sender||!item||!Number.isFinite(point)||point<0)return null;let rankMatch=trimmed.match(/【ギフト貢献(\d+)位】/);if(rankMatch){let rank=parseInt(rankMatch[1],10);if(Number.isFinite(rank)&&rank>0)return{sender,item,point,rank}}return{sender,item,point}}function parseNicoadPointToken(raw){let normalized=String(raw||"").replace(/,/g,"").replace(/[０-９]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-65248)),point=parseInt(normalized,10);return Number.isFinite(point)&&point>0?point:null}function parseNicoadCommentText(text){if(typeof text!="string")return null;let trimmed=text.trim();if(!trimmed)return null;let re=/^(?:【[^】]*】\s*)*(.+?)さんが([\d,０-９]+)\s*pt(?:広告しました|の(?:ニコニコ)?広告)/i,m=trimmed.match(re);if(!m)return null;let sender=m[1].trim(),point=parseNicoadPointToken(m[2]);return!sender||point==null?null:{sender,point}}var GIFT_THROW_DURATION_MS=Object.freeze({small:1500,medium:1750,large:2050,mega:2400}),GIFT_THUMBNAIL_BASE="https://secure-dcdn.cdn.nimg.jp/nicoad/res/nage/thumbnail/";function resolveGiftImageUrl(itemId){let s=String(itemId??"").trim();return!s||!/^[a-zA-Z][a-zA-Z0-9_-]{2,79}$/.test(s)?"":`${GIFT_THUMBNAIL_BASE}${s}.png`}function tierFromPoints(point){let pt=Number(point)||0;return pt>=5e3?"mega":pt>=500?"large":pt>=50?"medium":"small"}function clampLabel(s,max=14){let str=String(s||"").trim(),chars=Array.from(str);return chars.length<=max?str:`${chars.slice(0,max).join("")}\u2026`}function resolveGiftProjectile(parsed,kind){if(!parsed||typeof parsed!="object")return null;let point=Number(parsed.point)||0,tier=tierFromPoints(point),durationMs=GIFT_THROW_DURATION_MS[tier];if(kind==="ad")return point<=0?null:{kind:"ad",emoji:"\u{1F4E3}",label:`${point.toLocaleString("ja-JP")}pt`,point,tier,durationMs,imageUrl:""};let item=String(parsed.item||"").trim();return item?{kind:"gift",emoji:"\u{1F381}",label:clampLabel(item),point,tier,durationMs,imageUrl:resolveGiftImageUrl(parsed.itemId)}:null}function resolveGiftThrowPath(start,target,lift=90){let sx=Number(start?.x)||0,sy=Number(start?.y)||0,tx=Number(target?.x)||0,ty=Number(target?.y)||0,dx=tx-sx,dy=ty-sy,midX=dx*.6,midY=dy*.6-(Number(lift)||0);return{startX:sx,startY:sy,dx,dy,midX,midY}}function canLaunchGiftThrow(activeCount,max=8){let n=Number(activeCount)||0,cap=Number(max)||0;return n<cap}var VENUE_ROSTER_ENABLED=!1,ROOT_ID="nlsb-venue-root",STYLE_ID="nlsb-venue-style";var AGGREGATE_INTERVAL_MS=3e4,SPEECH_INTERVAL_MS=800,BUBBLE_LIFETIME_MS=4e3,BUBBLE_FADE_MS=600,BUBBLE_MAX=12,BUBBLE_FLOW_WINDOW_MS=3e3,BUBBLE_TEXT_MAX=36,VENUE_LAYOUT_CLASSES=["nlsb-mode-empty","nlsb-mode-vip","nlsb-mode-normal","nlsb-mode-packed"],VENUE_MAX_TIER_NODES=8;function escapeHtml(s){return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}var VENUE_CSS=`
  .nlsb-root {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    pointer-events: none;
    color: #f7f7f7;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .nlsb-root.nlsb-is-open {
    pointer-events: auto;
  }
  .nlsb-toggle {
    position: absolute;
    right: 16px;
    bottom: 16px;
    z-index: 3;
    min-height: 34px;
    padding: 7px 12px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 999px;
    background: rgba(20, 24, 30, 0.82);
    color: #fff;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.24);
    cursor: pointer;
    pointer-events: auto;
    font: inherit;
    font-size: 13px;
    line-height: 1;
    transition: background-color 180ms ease;
  }
  .nlsb-toggle:hover {
    background: rgba(36, 43, 53, 0.94);
  }
  .nlsb-toggle:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
  }
  .nlsb-stage {
    position: fixed;
    inset: 0;
    z-index: 1;
    display: grid;
    box-sizing: border-box;
    padding: clamp(52px, 7vh, 76px) clamp(14px, 3vw, 44px) 64px;
    overflow: hidden;
    /* FX(\u30D3\u30CD\u30C3\u30C8\u7B49)\u306E mix-blend \u3092\u4E2D\u592E\u6620\u50CF\u3078\u6F0F\u3089\u3055\u306A\u3044\u305F\u3081\u72EC\u7ACB\u30B9\u30BF\u30C3\u30AD\u30F3\u30B0(\u4F1A\u8B70\u78BA\u5B9A)\u3002 */
    isolation: isolate;
    /*
     * \u30E6\u30FC\u30B6\u30FC\u65B9\u91DD(2026-06-13 \u5F37)\u300C\u914D\u4FE1\u306E\u753B\u9762\u3068\u5B9F\u969B\u306E\u753B\u9762\u306B\u30B9\u30E2\u30FC\u30AF\u3092\u304B\u3051\u306A\u3044\u3067\u30FB\u3061\u3083\u3093\u3068
     * \u898B\u305F\u3044\u300D: \u5168\u9762\u3092\u8986\u3046\u6697\u5E55(linear-gradient)\u3092\u64A4\u53BB\u3002\u80CC\u666F\u306F\u900F\u660E\u306B\u3057\u3066\u3001\u5F8C\u308D\u306E\u30CB\u30B3\u751F\u6620\u50CF\u3068
     * \u672C\u5BB6UI\u3092\u305D\u306E\u307E\u307E\u898B\u305B\u308B\u3002\u4F1A\u5834\u306E\u96F0\u56F2\u6C17\u306F\u4E0A\u7AEF\u30FB\u4E0B\u7AEF\u306E\u6DE1\u3044\u30B9\u30C6\u30FC\u30B8\u7167\u660E\u3060\u3051\u3067\u51FA\u3057\u3001\u4E2D\u592E\u306E
     * \u6620\u50CF\u306B\u306F\u304B\u3051\u306A\u3044(\u4E0A\u4E0B\u306E\u30B0\u30E9\u30C7\u306F\u753B\u9762\u7AEF\u3067 transparent \u306B\u6D88\u3048\u308B\u306E\u3067\u6620\u50CF\u672C\u4F53\u306F\u7D20\u901A\u3057)\u3002
     */
    /*
     * 2026-06-14 \u661F\u91CE\u30A2\u30A4\u30C7\u30A2\u4F1A\u8B702\u300C\u71B1\u91CF\u306E\u8272\u6E29\u5EA6\u300D: \u4E0B\u7AEF(\u5BA2\u5E2D)\u306E\u7167\u660E\u8272\u3092\u30B3\u30E1\u30F3\u30C8\u901F\u5EA6\u9023\u52D5\u3067
     * \u6CE8\u5165\u3059\u308B\u3002--nlsb-heat-color(\u6DBC=\u9752\u7D2B\u2192\u6696=\u30AA\u30EC\u30F3\u30B8)/ --nlsb-heat-opacity(\u904E\u758E=\u307B\u307C\u900F\u660E\u2192
     * \u6012\u6D9B=\u6FC3\u3044)\u3092 JS \u304C\u66F4\u65B0\u3002\u6620\u50CF\u4E2D\u592E\u306F\u7D20\u901A\u3057\u306E\u307E\u307E(\u4E0B\u7AEF\u3060\u3051\u8272\u6E29\u5EA6\u304C\u5909\u308F\u308B)\u3002
     * \u65E2\u5B9A\u306F\u6DBC\u8272\u30FB\u8584\u3081\u306B\u3057\u3066\u672A\u8A2D\u5B9A\u6642\u3082\u5F93\u6765\u306E\u96F0\u56F2\u6C17\u3092\u58CA\u3055\u306A\u3044\u3002
     */
    --nlsb-heat-color: rgb(120, 130, 200);
    --nlsb-heat-opacity: 0.12;
    background:
      radial-gradient(ellipse 70% 24% at 50% 0%, rgba(120, 165, 224, 0.16), transparent 70%),
      radial-gradient(
        ellipse 96% 30% at 50% 100%,
        color-mix(in srgb, var(--nlsb-heat-color) calc(var(--nlsb-heat-opacity) * 100%), transparent),
        transparent 74%
      );
    opacity: 0;
    transform: translateY(18px);
    visibility: hidden;
    pointer-events: none;
    overscroll-behavior: contain;
    transition:
      opacity 180ms ease,
      transform 180ms ease,
      visibility 0s linear 180ms,
      background 800ms ease;
  }
  .nlsb-root.nlsb-is-open .nlsb-stage {
    opacity: 1;
    transform: translateY(0);
    visibility: visible;
    pointer-events: auto;
    transition-delay: 0s;
  }
  /*
   * \u5F8C\u65B9\u30D3\u30CD\u30C3\u30C8(\u30E9\u30A4\u30D6\u6F14\u51FA\u4F1A\u8B70 \u78BA\u5B9A\u2460\u30FB\u30D7\u30ED\u306E\u300C\u7A7A\u5E2D\u3092\u95C7\u306B\u6C88\u3081\u308B\u300D\u8853\u306EWeb\u518D\u73FE)\u3002
   * \u26A0\uFE0F\u30E6\u30FC\u30B6\u30FC\u65B9\u91DD\u300C\u4E2D\u592E\u306E\u914D\u4FE1\u6620\u50CF\u306B\u30B9\u30E2\u30FC\u30AF\u3092\u304B\u3051\u306A\u3044\u300D\u3092\u53B3\u5B88: \u4E2D\u592E\u306F\u5927\u304D\u304F transparent \u3067
   * \u304F\u308A\u629C\u304D\u3001\u6697\u304F\u3059\u308B\u306E\u306F\u3010\u56DB\u9685\u3011\u3068\u3010\u4E0B\u7AEF\u306E\u5E2D\u30A8\u30EA\u30A2\u5F8C\u65B9\u3011\u3060\u3051\u3002\u3053\u308C\u3067\u7A7A\u5E2D/\u9699\u9593\u304C\u95C7\u306B\u6EB6\u3051\u3066
   * \u300C\u5965\u307E\u3067\u6E80\u54E1\u300D\u306B\u898B\u3048\u3064\u3064\u3001\u914D\u4FE1\u6620\u50CF(\u4E2D\u592E\u30BB\u30FC\u30D5\u30A8\u30EA\u30A2)\u306F\u7D20\u901A\u3057\u306E\u307E\u307E\u3002
   * pointer-events:none \u3067\u30AF\u30EA\u30C3\u30AF\u900F\u904E\u30FB\u5439\u304D\u51FA\u3057\u30EC\u30A4\u30E4\u30FC(z5)\u3088\u308A\u4E0B(z0)\u3002
   */
  .nlsb-stage::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background:
      radial-gradient(ellipse 78% 64% at 50% 46%, transparent 52%, rgba(2, 4, 10, 0.55) 100%),
      linear-gradient(to bottom, transparent 64%, rgba(2, 4, 12, 0.5) 100%);
  }
  /* v0.1.772: \u9589\u3058\u308B\u306F\u53F3\u4E0A\u9685(absolute)\u3067\u306A\u304F\u30D8\u30C3\u30C0\u30FC\u53F3\u7AEF\u306E\u4ED6\u30DC\u30BF\u30F3\u3068\u4E26\u3079\u308B(nlsb-comeview-btn \u6D41\u7528)\u3002
     \u9589\u3058\u308B\u5C02\u7528\u306B\u8584\u8D64\u306E\u898B\u305F\u76EE\u3092\u4E0A\u66F8\u304D\u3057\u3066\u300C\u9589\u3058\u308B\u300D\u3068\u5206\u304B\u308A\u3084\u3059\u304F\u3059\u308B\u3002 */
  .nlsb-close-btn {
    border-color: rgba(255, 150, 150, 0.45);
    background: rgba(60, 30, 34, 0.7);
    color: #ffd2cf;
  }
  .nlsb-close-btn:hover {
    background: rgba(90, 40, 46, 0.92);
    border-color: rgba(255, 170, 170, 0.7);
  }
  .nlsb-close-btn:focus-visible {
    outline: 2px solid #ffb4a2;
    outline-offset: 2px;
  }
  /* v0.1.770 VOICEVOX \u8D77\u52D5\u5F85\u3061\u306E\u300C\u697D\u3057\u3044\u30ED\u30FC\u30C7\u30A3\u30F3\u30B0\u300D(\u4F1A\u8B70 2026-06-16):
     \u4F1A\u5834\u306F\u300E\u958B\u6F14\u524D\u306E\u671F\u5F85\u611F\u300F\u3002\u63A7\u3048\u3081\u306B\u3075\u308F\u3063\u3068\u8108\u52D5\u3059\u308B(\u6D3E\u624B\u3059\u304E\u53B3\u7981=\u904E\u53BB\u306B\u30EA\u30D0\u30FC\u30D6\u7B49\u306F\u5374\u4E0B)\u3002
     \u9045\u5EF6\u30AC\u30FC\u30C9(180ms)\u306F JS \u5074\u3067\u5236\u5FA1\u3057\u3001\u4E00\u77AC\u6210\u529F\u3067\u306F\u3053\u306E class \u304C\u4ED8\u304B\u306A\u3044=\u30C1\u30E9\u3064\u304B\u306A\u3044\u3002 */
  .nlsb-voice-status.is-loading {
    color: #ffd98a;
    animation: nlsb-voice-loading 1.25s ease-in-out infinite;
  }
  .nlsb-voice-status.is-error {
    color: #ffb4a2;
    animation: none;
  }
  @keyframes nlsb-voice-loading {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-voice-status.is-loading {
      animation: none;
      opacity: 0.92;
    }
  }
  /*
   * \u4F1A\u8B70\u78BA\u5B9AB(2026-06-13): \u4E2D\u592E\u306B\u300C\u6620\u50CF\u30BB\u30FC\u30D5\u30A8\u30EA\u30A2\u300D\u3092\u78BA\u4FDD\u3057\u3066\u914D\u4FE1\u6620\u50CF\u3092\u898B\u305B\u308B\u3002
   *   \u4E0A\u7AEF=\u306A\u3057(\u80CC\u666F\u306E\u5149\u306E\u6D77)\u3001\u4E2D\u592E=\u4F55\u3082\u7F6E\u304B\u306A\u3044\u7A7A\u304D(\u6620\u50CF\u304C\u900F\u3051\u308B)\u3001\u4E0B\u7AEF=\u3072\u306A\u58C7\u3002
   *   \u3072\u306A\u58C7\u3092\u753B\u9762\u306E\u4E0B\u306B\u9003\u304C\u3057\u3001\u4E2D\u592E 1fr \u3092\u7A7A\u3051\u308B\u3053\u3068\u3067\u6620\u50CF\u304C\u5E38\u306B\u898B\u3048\u308B\u3002
   */
  .nlsb-stage-layout {
    position: relative;
    z-index: 1;
    display: grid;
    width: min(1500px, 100%);
    height: 100%;
    min-height: 0;
    margin: 0 auto;
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas:
      "safe"
      "seating";
    gap: clamp(8px, 1.5vh, 16px);
    /*
     * \u89AA\u306F pointer-events:auto \u306E\u307E\u307E(none \u306B\u3059\u308B\u3068\u5B9F\u30DE\u30A6\u30B9\u306E\u30D2\u30C3\u30C8\u30C6\u30B9\u30C8\u304C\u89AA\u3067\u6B62\u307E\u308A\u3001
     * \u5B50\u306E <a> \u30EA\u30F3\u30AF\u304C\u300C\u30AF\u30EA\u30C3\u30AF\u3067\u304D\u306A\u3044\u300D\u306B\u306A\u308B=\u30E6\u30FC\u30B6\u30FC\u4E0D\u6E80\u306E\u539F\u56E0\u3060\u3063\u305F)\u3002
     * \u4E2D\u592E\u306E\u6620\u50CF\u3092\u89E6\u308A\u305F\u3044\u3068\u304D\u306F\u4E0B\u306E .nlsb-safe-area \u3060\u3051 none \u3067\u900F\u904E\u3055\u305B\u308B\u3002
     */
    pointer-events: auto;
  }
  /* \u4E2D\u592E\u306E\u6620\u50CF\u30BB\u30FC\u30D5\u30A8\u30EA\u30A2: UI \u3092\u4E00\u5207\u7F6E\u304B\u305A\u3001\u30AF\u30EA\u30C3\u30AF\u3092\u900F\u904E\u3057\u3066\u6620\u50CF/\u672C\u5BB6UI\u3092\u76F4\u63A5\u89E6\u308C\u308B\u3002 */
  .nlsb-safe-area {
    grid-area: safe;
    min-height: 0;
    pointer-events: none;
  }
  /* \u914D\u4FE1\u8005\u30B9\u30C6\u30FC\u30B8\u30AB\u30FC\u30C9\u306F\u6620\u50CF\u3092\u8986\u3046\u306E\u3067\u64A4\u53BB(\u4E2D\u592E\u306F\u6620\u50CF\u305D\u306E\u3082\u306E\u3092\u898B\u305B\u308B)\u3002 */
  .nlsb-center {
    display: none;
  }
  .nlsb-center-label {
    color: #9fd1ff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
  }
  .nlsb-center-title {
    overflow: hidden;
    font-size: clamp(18px, 2.4vw, 28px);
    font-weight: 700;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-center-meta {
    color: rgba(255, 255, 255, 0.62);
    font-size: 12px;
    letter-spacing: 0.08em;
  }
  /*
   * \u4F1A\u5834\u5E2D\u306F\u753B\u9762\u4E0B\u7AEF\u306E\u3072\u306A\u58C7\u3060\u3051\u306B\u3059\u308B(\u4E2D\u592E\u306E\u6620\u50CF\u30BB\u30FC\u30D5\u30A8\u30EA\u30A2\u306F\u7A7A\u3051\u308B)\u3002\u9AD8\u3055\u306F
   * \u4E0B\u7AEF max 35vh \u306B\u5236\u9650\u3057\u3001\u914D\u4FE1\u6620\u50CF\u3092\u8986\u308F\u306A\u3044(\u4F1A\u8B70\u78BA\u5B9AB\u300C\u3072\u306A\u58C7\u306F\u4E0B\u7AEF 30\u301C35vh\u300D)\u3002
   */
  .nlsb-seating {
    grid-area: seating;
    align-self: end;
    display: grid;
    width: 100%;
    /* 2026-06-14 \u4F1A\u8B70(\u8868\u793A\u9818\u57DF\u62E1\u5927): \u9AD8\u3055\u3092\u4EBA\u6570\u9023\u52D5\u3067\u53EF\u5909\u3002\u5C11\u4EBA\u6570\u306F\u4F4E\u304F\u6620\u50CF\u3092\u5E83\u304F\u898B\u305B\u3001
       \u6E80\u54E1\u306F\u9AD8\u304F\u3057\u3066\u5BA2\u5E2D\u3092\u5965\u307E\u3067\u898B\u305B\u308B\u3002JS \u304C --nlsb-venue-max-h \u3092\u4EBA\u6570\u3067\u6CE8\u5165(\u65E2\u5B9A55vh)\u3002 */
    max-height: var(--nlsb-venue-max-h, 55vh);
    min-height: 0;
    box-sizing: border-box;
    grid-template-areas:
      "header"
      "seats";
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    position: relative; /* 3\u30AD\u30E3\u30E9\u5E38\u99D0\u30EC\u30A4\u30E4\u30FC(.nlsb-residents)\u306E\u7D76\u5BFE\u914D\u7F6E\u306E\u57FA\u6E96 */
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    /* \u30B9\u30E2\u30FC\u30AF\u3092\u8584\u304F: \u540D\u524D\u304C\u8AAD\u3081\u308B\u6700\u4F4E\u9650\u306E\u6697\u3055\u3060\u3051\u6B8B\u3057\u3001\u4E0B\u306E\u6620\u50CF\u3092\u6975\u529B\u900F\u3051\u3055\u305B\u308B\u3002 */
    background: rgba(9, 13, 19, 0.28);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    overscroll-behavior: contain;
    pointer-events: auto;
  }
  /* 3\u30AD\u30E3\u30E9\u5E38\u99D0(\u308A\u3093\u304F\u30FB\u3053\u3093\u592A\u30FB\u305F\u306C\u59C9): \u914D\u4FE1\u753B\u9762\u306E\u300C\u307E\u308F\u308A(\u5DE6\u53F3\u306E\u7E01)\u300D\u306B\u51FA\u3059\u3002\u4F1A\u5834\u306E\u5E2D\u3068\u306F
     \u91CD\u306D\u306A\u3044=\u6E80\u54E1\u3067\u3082\u90AA\u9B54\u306B\u3057\u306A\u3044(\u30E6\u30FC\u30B6\u30FC\u5B9F\u6A5F\u6307\u6458\u306E\u6839\u6CBB)\u30023\u4EBA\u304C\u753B\u9762\u3092\u56F2\u3093\u3067\u4E00\u7DD2\u306B\u89B3\u3066\u308B\u611F\u3002
     stageLayout \u5168\u9762\u3092\u8986\u3046\u900F\u660E\u30EC\u30A4\u30E4\u30FC\u30FBpointer-events:none \u3067\u6620\u50CF/\u30AF\u30EA\u30C3\u30AF/\u5E2D\u30EA\u30F3\u30AF\u3092\u90AA\u9B54\u3057\u306A\u3044\u3002 */
  .nlsb-residents {
    position: absolute;
    inset: 0;
    z-index: 6;
    pointer-events: none;
  }
  .nlsb-resident {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: clamp(40px, 4.4vw, 64px);
  }
  /* \u914D\u7F6E: \u308A\u3093\u304F=\u5DE6\u4E0A\u30FB\u305F\u306C\u59C9=\u5DE6\u4E0B(\u7E26\u306B2\u4EBA)\u30FB\u3053\u3093\u592A=\u53F3\u4E2D\u592E\u3002\u6620\u50CF\u306E\u5DE6\u53F3\u306E\u7E01\u306B\u5BC4\u305B\u4E2D\u592E\u306F\u7A7A\u3051\u308B\u3002 */
  .nlsb-resident-rinku   { left: 6px;  top: 8%; }
  .nlsb-resident-tanunee { left: 6px;  top: 34%; }
  .nlsb-resident-konta   { right: 6px; top: 18%; }
  .nlsb-resident-img {
    width: 100%;
    height: auto;
    object-fit: contain;
    /* \u5B9F\u8996\u8074\u8005\u3068\u533A\u5225\u3059\u308B\u91D1\u8272\u306E\u5149\u3002reduced-motion \u3067\u3082\u9759\u7684\u30B0\u30ED\u30FC\u306F\u6B8B\u3059\u3002 */
    filter: drop-shadow(0 0 6px rgba(255, 206, 96, 0.9)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
    animation: nlsb-resident-glow 2.8s ease-in-out infinite;
  }
  .nlsb-resident-name {
    margin-top: 1px;
    font-size: 10px;
    font-weight: 700;
    color: #ffe7b0;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
    white-space: nowrap;
  }
  @keyframes nlsb-resident-glow {
    0%, 100% { filter: drop-shadow(0 0 5px rgba(255, 206, 96, 0.7)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6)); }
    50% { filter: drop-shadow(0 0 9px rgba(255, 220, 120, 1)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-resident-img { animation: none; }
  }
  /* v0.1.777 \u984D\u7E01\u30D5\u30EC\u30FC\u30E0: 3\u30AD\u30E3\u30E9\u5168\u8868\u60C5\u30B5\u30E0\u30CD\u3092\u56DB\u8FBA\u306B\u6CBF\u3063\u3066\u4E26\u3079\u4F1A\u5834\u3092\u56F2\u3080\u3002\u4E2D\u592E(\u6620\u50CF)\u3068
     \u30B3\u30E1\u30F3\u30C8\u6B04\u306F\u89E6\u3089\u306A\u3044\u3002\u5404\u30BF\u30A4\u30EB\u306F JS \u304C edge(top/right/bottom/left)\u3068 pos(0..1)\u3092 data \u5C5E\u6027\u3067\u6E21\u3057\u3001
     \u3053\u3053\u3067\u8FBA\u306B\u8CBC\u308A\u4ED8\u3051\u308B\u3002\u8EFD\u91CF .thumb128 \u3092\u4F7F\u3044\u8CA0\u8377\u3092\u6291\u3048\u308B\u3002 */
  .nlsb-charframe {
    position: absolute;
    inset: 0;
    z-index: 4; /* \u5BA2\u5E2D(seats)\u3088\u308A\u80CC\u9762\u30FB\u6620\u50CF\u30BB\u30FC\u30D5\u30A8\u30EA\u30A2\u3088\u308A\u524D\u3002\u5439\u304D\u51FA\u3057(z5)/\u5E38\u99D0(z6)\u3088\u308A\u80CC\u9762 */
    pointer-events: none;
    overflow: hidden;
  }
  .nlsb-charframe-tile {
    position: absolute;
    width: clamp(26px, 2.6vw, 40px);
    height: auto;
    opacity: 0.85;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.6));
  }
  .nlsb-charframe-tile[data-edge="top"]    { top: 2px; transform: translateX(-50%); }
  .nlsb-charframe-tile[data-edge="bottom"] { bottom: 2px; transform: translateX(-50%); }
  .nlsb-charframe-tile[data-edge="left"]   { left: 2px; transform: translateY(-50%); }
  .nlsb-charframe-tile[data-edge="right"]  { right: 2px; transform: translateY(-50%); }
  /* v0.1.778 \u30AE\u30D5\u30C8/\u5E83\u544A\u306E\u6295\u3052\u6F14\u51FA: \u6295\u3052\u4E3B\u306E\u30B5\u30E0\u30CD\u5EA7\u6A19\u304B\u3089\u4E2D\u592E\u6620\u50CF\u3078\u653E\u7269\u7DDA\u3067\u98DB\u3076\u3002
     bubbleLayer(\u6700\u524D\u9762\u30FBoverflow\u5916)\u306B\u4E57\u305B\u3001JS \u306F\u8D77\u70B9 left/top \u3068 --dx/--dy/--mid* \u3092 CSS \u5909\u6570\u3067
     \u6E21\u3059\u3060\u3051=GPU \u30A2\u30CB\u30E1\u3067\u6BCE\u30D5\u30EC\u30FC\u30E0 JS \u8A08\u7B97\u3057\u306A\u3044\u3002\u30D7\u30FC\u30EB\u518D\u5229\u7528+\u540C\u6642\u4E0A\u9650\u3067\u4F1A\u5834\u3092\u91CD\u304F\u3057\u306A\u3044\u3002 */
  .nlsb-gift-proj {
    position: absolute;
    z-index: 7; /* \u5439\u304D\u51FA\u3057(z5)\u30FB\u5E38\u99D0(z6)\u3088\u308A\u524D=\u6295\u3052\u7269\u306F\u6700\u524D\u9762\u3067\u6620\u50CF\u3078\u98DB\u3076 */
    display: none;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(20, 24, 32, 0.82);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
    will-change: transform, opacity;
    /* v0.1.783: \u30C6\u30AD\u30B9\u30C8\u6295\u3052\u7269\u306E\u307F screen \u5408\u6210(\u4E2D\u592E\u6620\u50CF\u3092\u96A0\u3057\u3059\u304E\u306A\u3044)\u3002
       \u5B9F\u753B\u50CF(is-image)\u306F\u5199\u771F\u8ABF\u306A\u306E\u3067 screen \u3092\u5916\u3057\u3001\u306F\u3063\u304D\u308A\u898B\u305B\u308B\u3002 */
    mix-blend-mode: screen;
    transform: translate(-50%, -50%);
  }
  /* v0.1.783: \u5B9F\u753B\u50CF\u306E\u6295\u3052\u7269\u3002pill \u80CC\u666F\u3092\u6D88\u3057\u3066\u753B\u50CF\u305D\u306E\u3082\u306E\u3092\u5927\u304D\u304F\u98DB\u3070\u3059\u3002 */
  .nlsb-gift-proj.is-image {
    padding: 0;
    background: transparent;
    border-radius: 0;
    mix-blend-mode: normal;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.55));
  }
  .nlsb-gift-proj-img {
    width: 56px;
    height: 56px;
    object-fit: contain;
    display: block;
  }
  .nlsb-gift-proj.is-flying {
    display: inline-flex;
    animation: nlsb-gift-fly var(--nlsb-gift-dur, 1500ms) cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
  }
  .nlsb-gift-proj-emoji { font-size: 18px; }
  /* v0.1.783\u300C\u4E00\u77AC\u3067\u898B\u3048\u306A\u3044\u300D\u6539\u5584: \u7740\u5F3E(70%)\u3067\u4E00\u5EA6\u5927\u304D\u304F\u898B\u305B\u3066(\u30D0\u30FC\u30B9\u30C8)\u304B\u3089\u3001
     \u4F59\u97FB\u3092\u6B8B\u3057\u3066\u30D5\u30A7\u30FC\u30C9\u3002\u4EE5\u524D\u306F\u7D42\u7AEF\u3067 scale(0.45)+opacity0 \u306B\u7E2E\u3093\u3067\u6D88\u3048\u3001\u898B\u308B\u9593\u3082\u306A\u304B\u3063\u305F\u3002 */
  @keyframes nlsb-gift-fly {
    0%   { transform: translate(-50%, -50%) scale(0.6); opacity: 0; }
    10%  { transform: translate(-50%, -50%) scale(1.08); opacity: 1; }
    55%  { transform: translate(calc(-50% + var(--nlsb-gift-mx)), calc(-50% + var(--nlsb-gift-my))) scale(1.14) rotate(7deg); opacity: 1; }
    72%  { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1.35) rotate(-3deg); opacity: 1; }
    100% { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1.05) rotate(-2deg); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-gift-proj.is-flying {
      animation: nlsb-gift-fade var(--nlsb-gift-dur, 1500ms) ease-out forwards;
    }
    /* reduced-motion: \u98DB\u3070\u3055\u305A\u3001\u7740\u5F3E\u70B9\u3067\u3075\u308F\u3063\u3068\u51FA\u3057\u3066\u6D88\u3048\u308B(\u4F59\u97FB\u306F\u6B8B\u3059)\u3002 */
    @keyframes nlsb-gift-fade {
      0%   { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1); opacity: 0; }
      20%  { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1); opacity: 0.95; }
      80%  { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1); opacity: 0.95; }
      100% { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1); opacity: 0; }
    }
  }
  .nlsb-header {
    grid-area: header;
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 38px;
    box-sizing: border-box;
    padding: 7px 14px;
    gap: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(14, 19, 27, 0.55);
  }
  .nlsb-title {
    overflow: hidden;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-note {
    color: rgba(255, 255, 255, 0.62);
    font-size: 10px;
    white-space: nowrap;
  }
  .nlsb-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 0 0 auto;
  }
  /* \u30B3\u30E1\u30D3\u30E5\u8D77\u52D5\u30DC\u30BF\u30F3(\u4F1A\u5834\u30D8\u30C3\u30C0\u30FC\u53F3)\u3002\u8AAD\u307F\u4E0A\u3052\u4ED8\u304D\u30B3\u30E1\u30F3\u30C8\u30D3\u30E5\u30FC\u30A2\u3092\u5225\u7A93\u3067\u958B\u304F\u3002 */
  .nlsb-comeview-btn {
    flex: 0 0 auto;
    min-height: 28px;
    padding: 4px 11px;
    border: 1px solid rgba(141, 200, 255, 0.4);
    border-radius: 999px;
    background: rgba(30, 41, 56, 0.7);
    color: #cfe6ff;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    pointer-events: auto;
  }
  .nlsb-comeview-btn:hover {
    background: rgba(48, 64, 86, 0.92);
    border-color: rgba(141, 200, 255, 0.6);
  }
  .nlsb-comeview-btn:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
  }
  .nlsb-seats {
    grid-area: seats;
    position: relative;
    display: flex;
    flex-direction: column-reverse;
    align-items: stretch;
    justify-content: flex-end;
    gap: clamp(0px, 0.2vh, 4px);
    min-height: 0;
    box-sizing: border-box;
    padding: clamp(10px, 2vh, 22px) 14px;
    /*
     * \u6A2A\u30B9\u30AF\u30ED\u30FC\u30EB\u30D0\u30FC\u6839\u7D76(\u30E6\u30FC\u30B6\u30FC\u4E0D\u6E80\u300C\u4F4D\u7F6E\u304C\u305A\u308C\u3066\u30B9\u30AF\u30ED\u30FC\u30EB\u30D0\u30FC\u304C\u51FA\u3066\u5909\u306A\u52D5\u304D\u3067
     * \u898B\u3048\u306A\u304F\u306A\u308B\u300D): \u540C\u6642\u8868\u793A\u4EBA\u6570\u306F selectStableVisibleMembers \u3067\u884C\u306B\u53CE\u307E\u308B\u6570\u306B\u5236\u9650\u6E08\u307F
     * \u306A\u306E\u3067\u6A2A\u6EA2\u308C\u306F\u8D77\u304D\u306A\u3044\u304C\u3001\u4FDD\u967A\u3068\u3057\u3066 overflow-x:hidden \u3067\u6A2A\u30B9\u30AF\u30ED\u30FC\u30EB\u3092\u69CB\u9020\u7684\u306B\u6BBA\u3059\u3002
     * \u7E26\u3082 clip(\u6BB5\u6570\u304C\u5897\u3048\u3066\u3082\u4E0B\u7AEF 35vh \u306B\u53CE\u3081\u3001\u6620\u50CF\u3078\u306F\u307F\u51FA\u3055\u306A\u3044)\u3002 -> \u898B\u5207\u308C\u308B\u4E0D\u6E80\u89E3\u6D88\u306E\u305F\u3081 auto \u306B\u5909\u66F4
     */
    overflow-x: hidden;
    overflow-y: auto;
    /* 2026-06-14 \u4F1A\u8B70(\u6469\u64E6\u30BC\u30EDUI): \u4F1A\u5834\u306F\u5DE6\u30C9\u30E9\u30C3\u30B0\u3067\u30D1\u30F3\u3067\u304D\u308B=grab \u30AB\u30FC\u30BD\u30EB\u3067\u63B4\u3081\u308B\u3068\u793A\u3059\u3002
       \u5E2D\u30EA\u30F3\u30AF(.nlsb-seat-link)\u4E0A\u306F\u30EA\u30F3\u30AF\u30AB\u30FC\u30BD\u30EB\u3092\u512A\u5148(\u4E0B\u306E\u30BB\u30EC\u30AF\u30BF\u3067\u4E0A\u66F8\u304D)\u3002
       v0.1.738: \u30D1\u30F3\u3067\u304D\u308B(\u7E26\u306B\u6EA2\u308C\u3066\u3044\u308B)\u6642\u3060\u3051 grab \u3092\u51FA\u3059=\u63B4\u3081\u308B\u306E\u306B\u52D5\u304B\u306A\u3044\u8AA4\u89E3\u3092\u9632\u3050\u3002
       \u5168\u5E2D\u304C\u753B\u9762\u306B\u53CE\u307E\u308B\u6642\u306F\u901A\u5E38\u30AB\u30FC\u30BD\u30EB\u3002.nlsb-can-pan \u3092 renderSeats \u304C\u6EA2\u308C\u6642\u306B\u4ED8\u4E0E\u3002 */
    cursor: default;
    touch-action: pan-y;
    background:
      radial-gradient(ellipse at 50% 100%, rgba(102, 144, 190, 0.16), transparent 62%);
    overscroll-behavior: contain;
    perspective: clamp(680px, 75vw, 1200px);
    perspective-origin: 50% 12%;
    transform-style: preserve-3d;
    contain: layout paint;
  }
  /*
   * \u524D\u5217\u3092\u4E0B\u3001\u5F8C\u5217\u3092\u4E0A\u306B\u7A4D\u3080\u3072\u306A\u58C7\u3002\u6BB5\u6570\u3068\u4EBA\u6570\u306F buildVenueTiers \u304C\u6C7A\u3081\u3001
   * transform \u306F\u5965\u884C\u304D\u306E\u88DC\u52A9\u3060\u3051\u306B\u3059\u308B\u305F\u3081 reduced-motion \u3067\u3082\u6BB5\u7D44\u307F\u306F\u5D29\u308C\u306A\u3044\u3002
   */
  .nlsb-tier {
    display: flex;
    width: 100%;
    max-width: 100%;
    flex: 0 1 auto;
    /* \u7E26\u6EA2\u308C\u9632\u6B62(\u898B\u5207\u308C\u6839\u7D76): wrap\u3055\u305B\u305A\u7E2E\u5C0F\u3055\u305B\u30661\u6BB5\u306B\u53CE\u3081\u3001SHOWROOM\u7684\u306A\u5BC6\u96C6\u611F\u3092\u51FA\u3059 */
    flex-wrap: nowrap;
    align-items: flex-end;
    justify-content: center;
    box-sizing: border-box;
    transform-origin: 50% 100%;
    transform-style: preserve-3d;
    transform:
      translateY(var(--nlsb-tier-y, 0))
      translateZ(var(--nlsb-tier-z, 0))
      scale(var(--nlsb-tier-scale, 1));
  }
  .nlsb-tier[hidden] {
    display: none;
  }
  .nlsb-seats.nlsb-mode-normal .nlsb-tier {
    gap: clamp(0px, 0.5vw, 8px);
  }
  .nlsb-seats.nlsb-mode-vip .nlsb-tier {
    gap: clamp(18px, 3vw, 52px);
  }
  .nlsb-seats.nlsb-mode-normal .nlsb-seat {
    width: clamp(48px, 8vw, 100px);
    flex: 0 1 auto;
    /* justify-content: center \u3067\u5DE6\u53F3\u4F59\u767D\u304C\u3067\u304D\u308B\u306E\u3067\u3001\u8A70\u3081\u308B\u5834\u5408\u306F\u30DE\u30A4\u30CA\u30B9\u30DE\u30FC\u30B8\u30F3\u3067\u91CD\u306D\u308B\u306E\u3082\u624B */
  }
  .nlsb-seats.nlsb-mode-packed .nlsb-tier {
    gap: 8px;
  }
  .nlsb-seats.nlsb-mode-empty {
    display: grid;
    place-items: center;
  }
  .nlsb-seat {
    position: relative;
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    overflow: visible;
  }
  .nlsb-seats.nlsb-can-pan {
    cursor: grab;
  }
  .nlsb-seats.nlsb-is-grabbing {
    cursor: grabbing;
    user-select: none;
  }
  /* \u8A3A\u65AD: \u30E1\u30F3\u30D0\u30FC\u4E00\u89A7\u30D1\u30CD\u30EB(\u30E2\u30FC\u30C0\u30EB\u98A8)\u3002\u4F1A\u5834\u306E\u4E0A\u306B\u91CD\u306D\u3066\u51FA\u3059\u3002 */
  .nlsb-roster-panel {
    position: absolute;
    top: 8%;
    left: 50%;
    transform: translateX(-50%);
    width: min(560px, 92vw);
    max-height: 72vh;
    z-index: 6;
    display: flex;
    flex-direction: column;
    background: rgba(18, 22, 30, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 14px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    color: #eef1f6;
    font-size: 13px;
    overflow: hidden;
  }
  .nlsb-roster-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  }
  .nlsb-roster-close {
    /* v0.1.738: \u5F53\u305F\u308A\u5224\u5B9A\u3092\u5E83\u3052(36x36)\u78BA\u5B9F\u306B\u62BC\u305B\u308B\u3088\u3046\u306B\u3002\u80CC\u666F\u3092\u8584\u304F\u4ED8\u3051\u3066\u5B58\u5728\u3092\u660E\u793A\u3002 */
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    min-height: 36px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    color: #eef1f6;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 8px;
  }
  .nlsb-roster-close:hover {
    background: rgba(255, 255, 255, 0.16);
  }
  .nlsb-roster-close:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
  }
  .nlsb-roster-summary {
    padding: 8px 14px;
    font-size: 12px;
    color: #b9c2d0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .nlsb-roster-list {
    overflow-y: auto;
    padding: 6px 0;
  }
  .nlsb-roster-row {
    display: grid;
    grid-template-columns: 44px 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 5px 14px;
  }
  .nlsb-roster-row:nth-child(odd) {
    background: rgba(255, 255, 255, 0.03);
  }
  .nlsb-roster-seat {
    color: #8b94a3;
    font-variant-numeric: tabular-nums;
  }
  .nlsb-roster-who {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-roster-badge {
    display: inline-block;
    margin-left: 4px;
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 11px;
  }
  .nlsb-roster-badge.thumb { background: rgba(255, 200, 90, 0.25); color: #ffd66f; }
  .nlsb-roster-badge.gift { background: rgba(120, 200, 255, 0.22); color: #9fd4ff; }
  .nlsb-roster-badge.on { background: rgba(120, 220, 140, 0.22); color: #9fe6af; }
  .nlsb-roster-badge.off { background: rgba(255, 255, 255, 0.08); color: #99a2b0; }
  .nlsb-roster-empty {
    padding: 24px 14px;
    text-align: center;
    color: #99a2b0;
  }
  .nlsb-seat.nlsb-is-empty {
    /* display: none; */
    opacity: 0.12;
    pointer-events: none;
    filter: blur(0.5px);
  }
  .nlsb-seat.nlsb-is-empty .nlsb-icon {
    background-color: rgba(255, 255, 255, 0.05);
    border-color: transparent;
    box-shadow: none;
    background-image: 
      radial-gradient(circle at 50% 35%, #fff 25%, transparent 26%),
      radial-gradient(circle at 50% 120%, #fff 55%, transparent 56%);
  }
  .nlsb-seat.nlsb-is-empty .nlsb-name {
    display: none;
  }
  .nlsb-seats.nlsb-mode-packed .nlsb-seat {
    width: 68px;
    flex: 0 0 68px;
    gap: 4px;
  }
  /* VIP(\u22648\u4EBA): \u7279\u5927\u30A2\u30D0\u30BF\u30FC\u3067\u3086\u3063\u305F\u308A=\u4E3B\u5F79\u611F\u3002 */
  .nlsb-seats.nlsb-mode-vip .nlsb-seat {
    width: clamp(120px, 14vw, 168px);
  }
  /* \u901A\u5E38(\u226430\u4EBA): \u5927\u304D\u3081\u30A2\u30D0\u30BF\u30FC\u3092\u753B\u9762\u3044\u3063\u3071\u3044\u306B\u6577\u304D\u8A70\u3081\u308B\u3002\u306F\u307F\u51FA\u3057\u6642\u306F\u7E2E\u5C0F\u3055\u305B\u308B */
  .nlsb-seats.nlsb-mode-normal .nlsb-seat {
    width: clamp(48px, 9vw, 120px);
  }
  /* 2026-06-15 \u661F\u91CE\u30ED\u30DF\u4F1A\u8B70(\u30B5\u30E0\u30CD\u512A\u9047\u3092"\u4E00\u76EE\u3067\u7279\u5225"\u306B): 1.12\u500D\u3067\u306F\u8133\u304C\u6BD4\u8F03\u3092\u8981\u6C42\u3057
     \u30CE\u30A4\u30BA\u3068\u3057\u3066\u51E6\u7406\u3055\u308C\u308B(\u30E6\u30FC\u30B6\u30FC\u5B9F\u6A5F\u300C\u7279\u5225\u306B\u306A\u3063\u3066\u306A\u3044\u300D)\u2192\u500D\u7387\u306E"\u65AD\u7D76"\u3092\u4F5C\u308B\u3002
     \u4F1A\u8B707\u4F53\u4E00\u81F4=scale 1.45(28\u2192\u7D0440px)\u3067\u300C\u5927\u304D\u3044=\u91CD\u8981\u300D\u3092\u672C\u80FD\u3067\u8A8D\u8B58\u3055\u305B\u308B\u3002\u91D1\u7E01\u3092\u592A\u304F
     \u306F\u3063\u304D\u308A+\u660E\u308B\u3055+12%\u3002\u8108\u52D5\u306F\u4ED8\u3051\u306A\u3044(\u6B62\u307E\u3063\u305F\u5927\u304D\u3055=\u5B58\u5728\u305D\u306E\u3082\u306E\u30FB\u4E0A\u54C1\u3055\u3092\u4FDD\u3064)\u3002 */
  .nlsb-seat.nlsb-seat-vip .nlsb-icon {
    transform: scale(1.45);
    filter: brightness(1.12);
    border-color: rgba(255, 220, 130, 1);
    box-shadow: 0 0 0 2px rgba(255, 206, 96, 0.95), 0 0 12px 2px rgba(255, 190, 70, 0.85), inset 0 0 0 1px rgba(0, 0, 0, 0.14);
    z-index: 5;
  }
  /* 2026-06-14 \u661F\u91CE\u30A2\u30A4\u30C7\u30A2\u4F1A\u8B702(VIP\u5E38\u9023\u5149\u3089\u305B): \u767A\u8A00\u6570+\u30AE\u30D5\u30C8\u306E\u30B9\u30B3\u30A2\u304C\u9AD8\u3044\u300C\u652F\u3048\u3066\u308B\u4EBA\u300D\u3092
     \u91D1\u8272\u30AA\u30FC\u30E9\u3067\u3084\u308F\u3089\u304B\u304F\u8108\u52D5\u3055\u305B\u3066\u5F15\u304D\u7ACB\u3066\u308B\u3002\u5B9F\u30B5\u30E0\u30CD\u512A\u9047(.nlsb-seat-vip)\u3068\u72EC\u7ACB=
     \u3086\u3063\u304F\u308A\u9854/\u533F\u540D\u306E\u5E38\u9023\u3067\u3082\u5149\u308B\u3002\u3084\u308A\u3059\u304E\u306A\u3044\u4E0A\u54C1\u306A\u7BC4\u56F2(2.4\u79D2\u306E\u7DE9\u3044\u8108\u52D5)\u3002 */
  .nlsb-seat.nlsb-seat-regular .nlsb-icon {
    border-color: rgba(255, 226, 150, 0.95);
    box-shadow: 0 0 10px 2px rgba(255, 196, 84, 0.7), inset 0 0 0 1px rgba(0, 0, 0, 0.12);
    animation: nlsb-vip-glow 2.4s ease-in-out infinite;
    z-index: 3;
  }
  /* \u5B9F\u30B5\u30E0\u30CD\u5E38\u9023\u306F\u4E21\u65B9\u4ED8\u304F\u306E\u3067\u3001scale \u306F\u30B5\u30E0\u30CD\u5074(\u5927\u304D\u3044\u65B9)\u3092\u6D3B\u304B\u3057\u3064\u3064\u91D1\u30AA\u30FC\u30E9\u3092\u91CD\u306D\u308B\u3002 */
  .nlsb-seat.nlsb-seat-vip.nlsb-seat-regular .nlsb-icon {
    transform: scale(1.45);
  }
  @keyframes nlsb-vip-glow {
    0%,
    100% {
      box-shadow: 0 0 8px 1px rgba(255, 196, 84, 0.55), inset 0 0 0 1px rgba(0, 0, 0, 0.12);
    }
    50% {
      box-shadow: 0 0 14px 4px rgba(255, 210, 110, 0.92), inset 0 0 0 1px rgba(0, 0, 0, 0.12);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-seat.nlsb-seat-regular .nlsb-icon {
      animation: none;
    }
  }
  /* v0.1.742 \u4E00\u7DD2\u306B\u904E\u3054\u3057\u3066\u3044\u308B\u611F(co-presence): \u8AB0\u304B\u304C\u30B3\u30E1\u30F3\u30C8\u3057\u305F\u77AC\u9593\u3001\u305D\u306E\u4EBA\u306E\u5E2D\u304C
     \u3075\u308F\u3063\u3068\u4E00\u5EA6\u3060\u3051\u53CD\u5FDC\u3059\u308B\u3002\u5439\u304D\u51FA\u3057\u3060\u3051\u3067\u306A\u304F\u300C\u4F1A\u5834\u304C\u4E00\u4EBA\u3072\u3068\u308A\u306E\u767A\u8A00\u306B\u53CD\u5FDC\u3059\u308B\u300D\u3053\u3068\u3067
     \u4E00\u7DD2\u306B\u3044\u308B\u611F\u3092\u5F37\u3081\u308B(\u661F\u91CE\u5F0F\u30FB\u6469\u64E6\u30BC\u30ED=\u81EA\u52D5\u30FB\u8A2D\u5B9A\u4E0D\u8981)\u30020.6\u79D2\u30671\u56DE\u3060\u3051\u30FB\u4E0A\u54C1\u306B\u3002 */
  .nlsb-seat.nlsb-seat-speaking .nlsb-icon {
    animation: nlsb-seat-speak 0.6s ease-out;
  }
  @keyframes nlsb-seat-speak {
    0% {
      transform: scale(1);
    }
    35% {
      transform: scale(1.18);
      filter: brightness(1.15);
    }
    100% {
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-seat.nlsb-seat-speaking .nlsb-icon {
      animation: none;
    }
  }
  /* v0.1.743 \u300C\u4F1A\u8A71\u306E\u9023\u9396\u300D(\u4F1A\u8B70\u306E\u6700\u5927\u591A\u6570\u6C7A\u306E\u672C\u547D\u30FB\u5F31\u70B9A/C): \u540C\u3058\u4EBA\u304C\u77ED\u3044\u9593\u9694\u3067\u7D9A\u3051\u3066\u558B\u308B\u3068\u3001
     \u305D\u306E\u5E2D\u304C\u6BB5\u968E\u7684\u306B\u6696\u8272(\u30B3\u30FC\u30E9\u30EB)\u3067\u8F1D\u304D\u3001\u9023\u7D9A\u3059\u308B\u307B\u3069\u5F37\u304F\u901F\u304F\u8108\u52D5\u3059\u308B=\u300C\u6E9C\u307E\u3063\u3066\u3044\u304F\u611F\u300D\u3002
     \u91D1\u8272\u30AA\u30FC\u30E9(.nlsb-seat-regular=\u652F\u3048\u3066\u308B\u4EBA)\u3068\u306F\u5225\u8EF8\u306E\u300C\u3044\u307E\u76DB\u308A\u4E0A\u3052\u3066\u308B\u4EBA\u300D\u3092\u5F15\u304D\u7ACB\u3066\u308B\u3002
     data-streak=1..4 \u3092 JS \u304C\u5E2D\u306B\u4ED8\u3051\u3001\u6BB5\u968E\u3054\u3068\u306B\u8272\u306E\u5F37\u3055/\u8108\u52D5\u901F\u5EA6\u304C\u4E0A\u304C\u308B\u3002\u767A\u8A00\u304C\u9014\u5207\u308C\u308B\u3068
     prune \u3067 data-streak \u304C\u5916\u308C\u3066\u81EA\u7136\u306B\u6D88\u3048\u308B\u3002*/
  .nlsb-seat[data-streak] .nlsb-icon {
    box-shadow: 0 0 9px 2px rgba(255, 138, 92, 0.6), inset 0 0 0 1px rgba(0, 0, 0, 0.12);
    animation: nlsb-seat-streak 1.4s ease-in-out infinite;
    z-index: 4;
  }
  .nlsb-seat[data-streak="2"] .nlsb-icon { box-shadow: 0 0 11px 3px rgba(255, 132, 86, 0.72), inset 0 0 0 1px rgba(0, 0, 0, 0.12); animation-duration: 1.2s; }
  .nlsb-seat[data-streak="3"] .nlsb-icon { box-shadow: 0 0 13px 4px rgba(255, 120, 80, 0.82), inset 0 0 0 1px rgba(0, 0, 0, 0.12); animation-duration: 1.0s; }
  .nlsb-seat[data-streak="4"] .nlsb-icon { box-shadow: 0 0 16px 5px rgba(255, 108, 74, 0.92), inset 0 0 0 1px rgba(0, 0, 0, 0.12); animation-duration: 0.85s; }
  @keyframes nlsb-seat-streak {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.18); }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-seat[data-streak] .nlsb-icon {
      animation: none;
    }
  }
  .nlsb-icon {
    position: relative;
    display: grid;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 50%;
    color: #fff;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
    overflow: hidden;
  }
  .nlsb-avatar,
  .nlsb-icon-fallback {
    width: 100%;
    height: 100%;
    border-radius: inherit;
  }
  .nlsb-avatar {
    display: block;
    object-fit: cover;
  }
  .nlsb-avatar[hidden],
  .nlsb-icon-fallback[hidden] {
    display: none;
  }
  .nlsb-icon-fallback {
    display: grid;
    place-items: center;
  }
  .nlsb-name {
    display: block;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    color: rgba(255, 255, 255, 0.9);
    font-size: 10px;
    line-height: 1.2;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* \u6570\u5024 ID \u6301\u3061=\u30AF\u30EA\u30C3\u30AF\u3067\u30E6\u30FC\u30B6\u30FC\u30DA\u30FC\u30B8\u3078\u98DB\u3079\u308B\u30EA\u30F3\u30AF\u3002\u4F1A\u5834\u306F\u958B\u6642\u306E\u307F\u64CD\u4F5C\u53EF\u80FD\u3002 */
  a.nlsb-seat-link,
  .nlsb-seat.nlsb-seat-link {
    cursor: pointer;
    pointer-events: auto;
  }
  .nlsb-seat-link:hover .nlsb-name {
    color: #bfe1ff;
    text-decoration: underline;
  }
  .nlsb-seat-link:hover .nlsb-icon {
    border-color: rgba(191, 225, 255, 0.6);
  }
  .nlsb-seat-link:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
    border-radius: 3px;
  }
  .nlsb-seats.nlsb-mode-vip .nlsb-icon {
    width: clamp(96px, 11vw, 132px);
    height: clamp(96px, 11vw, 132px);
    flex-basis: auto;
    font-size: clamp(32px, 4vw, 44px);
  }
  .nlsb-seats.nlsb-mode-vip .nlsb-name {
    max-width: 100%;
    font-size: 15px;
    font-weight: 700;
    text-align: center;
  }
  .nlsb-seats.nlsb-mode-normal .nlsb-icon {
    width: clamp(32px, 7vw, 92px);
    height: clamp(32px, 7vw, 92px);
    flex-basis: auto;
    font-size: clamp(14px, 3vw, 32px);
  }
  .nlsb-seats.nlsb-mode-normal .nlsb-name {
    max-width: 100%;
    font-size: 12px;
    text-align: center;
  }
  .nlsb-seats.nlsb-mode-packed .nlsb-icon {
    width: 38px;
    height: 38px;
    flex-basis: 38px;
    font-size: 14px;
  }
  .nlsb-seats.nlsb-mode-packed .nlsb-name {
    max-width: 68px;
    text-align: center;
  }
  /*
   * \u4F1A\u8B70\u78BA\u5B9AA: \u5439\u304D\u51FA\u3057\u5C02\u7528\u306E\u6700\u4E0A\u4F4D\u30EC\u30A4\u30E4\u30FC\u3002\u5E2D\u30B3\u30F3\u30C6\u30CA(.nlsb-seats overflow:hidden)\u306E
   * \u5916\u30FBstage \u76F4\u4E0B\u306B\u7F6E\u304D\u3001\u30BB\u30EA\u30D5\u304C\u30AF\u30EA\u30C3\u30D7\u3055\u308C\u306A\u3044/\u30A2\u30D0\u30BF\u30FC\u306B\u6F5C\u3089\u306A\u3044\u3002
   */
  .nlsb-bubble-layer {
    position: absolute;
    inset: 0;
    z-index: 5;
    overflow: visible;
    pointer-events: none;
  }
  /*
   * \u5439\u304D\u51FA\u3057\u672C\u4F53\u3002\u30EC\u30A4\u30E4\u30FC\u57FA\u6E96\u3067 left/top \u3092 JS \u304C\u5E2D\u982D\u4E0A\u306B\u30BB\u30C3\u30C8\u3059\u308B\u3002
   * translate(-50%, -100%) \u3067\u300C\u6307\u5B9A\u70B9\u304C\u5439\u304D\u51FA\u3057\u306E\u4E0B\u8FBA\u4E2D\u592E\u300D\u306B\u306A\u308B\u3002
   * \u4F1A\u8B70\u78BA\u5B9AB: font 18px(12px \u304B\u3089\u5927\u5E45\u62E1\u5927)\u30FB\u6700\u59272\u884C\u30FB\u8AAD\u307F\u3084\u3059\u3055\u6700\u512A\u5148(\u661F\u91CE\u30ED\u30DF\u6D41)\u3002
   */
  .nlsb-bubble {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 5;
    box-sizing: border-box;
    width: max-content;
    max-width: min(30ch, 40vw);
    padding: 9px 13px;
    overflow: hidden;
    border: 1px solid rgba(20, 29, 42, 0.16);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.97);
    color: #141d28;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34);
    font-size: clamp(16px, 1.4vw, 20px);
    font-weight: 700;
    line-height: 1.4;
    opacity: 1;
    overflow-wrap: anywhere;
    word-break: break-all;
    pointer-events: none;
    text-shadow: none;
    transform: translateY(-100%);
    white-space: normal;
    animation: nlsb-bubble-pop 160ms ease-out;
    transition: opacity ${BUBBLE_FADE_MS}ms ease;
  }
  .nlsb-bubble::after {
    position: absolute;
    top: 100%;
    left: var(--nlsb-bubble-tail-x, 50%);
    width: 0;
    height: 0;
    border: 7px solid transparent;
    border-top-color: rgba(255, 255, 255, 0.97);
    content: "";
    transform: translateX(-50%);
  }
  .nlsb-bubble.nlsb-is-leaving {
    opacity: 0;
  }
  /* v0.1.800\u300C\u5439\u304D\u51FA\u3057\u3068\u8AAD\u307F\u4E0A\u3052\u3092\u540C\u6642\u306B\u7ACB\u3061\u4E0A\u3052\u308B\u300D(\u4F1A\u8B70 \u6848C\u30FB2\u6BB5\u968E\u8868\u793A):
     \u8AAD\u307F\u4E0A\u3052ON\u306E\u3068\u304D\u3001\u58F0\u304C\u9CF4\u308A\u59CB\u3081\u308B\u524D\u306F\u300C\u4EEE(\u6DE1\u3044\u30FB\u5C11\u3057\u5C0F\u3055\u3044)\u300D\u3067\u51FA\u3057\u3001onAudioStart \u3067
     \u4EEE class \u3092\u5916\u3059\u77AC\u9593\u306B\u300C\u672C(\u9BAE\u660E\u30FB\u7B49\u500D)\u300D\u3078\u77AC\u6642\u6607\u683C=\u58F0\u3068\u540C\u6642\u306B\u7ACB\u3061\u4E0A\u304C\u3063\u305F\u4F53\u611F\u3092\u4F5C\u308B\u3002
     \u58F0\u975E\u4F9D\u5B58(v0.1.757)\u306F\u4E0D\u5909: \u4EEE\u3067\u3082\u5FC5\u305A\u5373\u51FA\u308B\u30FB\u58F0\u304C\u6765\u306A\u3051\u308C\u3070\u4EEE\u306E\u307E\u307E\u6D41\u901F\u5BFF\u547D\u3067\u6D88\u3048\u308B\u3002
     transition \u306F\u77ED\u304F(120ms)=\u300C\u9045\u5EF6\u300D\u3068\u611F\u3058\u306A\u3044\u7BC4\u56F2\u3067\u6607\u683C\u306E\u30E1\u30EA\u30CF\u30EA\u3060\u3051\u4ED8\u3051\u308B\u3002 */
  .nlsb-bubble.nlsb-bubble-previoice {
    opacity: 0.78;
    transform: translateY(-100%) scale(0.965);
    transform-origin: bottom center;
    transition:
      opacity 120ms ease,
      transform 120ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-bubble.nlsb-bubble-previoice {
      transform: translateY(-100%);
      transition: none;
    }
  }
  /* v0.1.773 \u8EFD\u3044\u540C\u671F: \u8AAD\u307F\u4E0A\u3052\u304C\u9CF4\u308A\u59CB\u3081\u305F\u77AC\u9593\u306B\u4E00\u5EA6\u3060\u3051\u6DE1\u304F\u5149\u3089\u305B\u300C\u58F0\uFF1D\u3053\u306E\u5439\u304D\u51FA\u3057\u300D\u3092\u7D50\u3076\u3002
     \u4E0A\u54C1\u306B1\u56DE\u3060\u3051(\u6D3E\u624B\u3059\u304E\u53B3\u7981)\u3002\u5373\u6642\u8868\u793A\u306F\u5909\u3048\u306A\u3044=\u5373\u6642\u6027\u306F\u7DAD\u6301\u3002 */
  .nlsb-bubble.nlsb-bubble-voiced {
    animation: nlsb-bubble-voiced 620ms ease-out;
  }
  @keyframes nlsb-bubble-voiced {
    0% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34), 0 0 0 0 rgba(141, 200, 255, 0.55); }
    40% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34), 0 0 0 5px rgba(141, 200, 255, 0.32); }
    100% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34), 0 0 0 0 rgba(141, 200, 255, 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-bubble.nlsb-bubble-voiced { animation: none; }
  }
  @keyframes nlsb-bubble-pop {
    from {
      opacity: 0;
      transform: translateY(calc(-100% + 6px)) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(-100%);
    }
  }
  .nlsb-bubble-text {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .nlsb-empty-message {
    display: none;
    color: rgba(255, 255, 255, 0.52);
    font-size: 12px;
    letter-spacing: 0.02em;
  }
  .nlsb-seats.nlsb-mode-empty .nlsb-empty-message {
    display: block;
  }
  .nlsb-crowd-canvas {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: clamp(200px, 40vh, 350px);
    z-index: 0; /* \u3072\u306A\u58C7(.nlsb-seating z:1)\u306E\u88CF */
    pointer-events: none;
    opacity: 0;
    transition: opacity 1200ms ease-in-out;
    mix-blend-mode: screen; /* \u30B5\u30A4\u30EA\u30A6\u30E0\u3092\u7F8E\u3057\u304F\u5149\u3089\u305B\u308B */
  }
  .nlsb-crowd-canvas.nlsb-is-visible {
    opacity: 1;
  }
  @media (max-width: 900px) {
    .nlsb-toggle {
      right: 10px;
    }
    .nlsb-stage {
      padding-right: 10px;
      padding-left: 10px;
    }
    .nlsb-stage-layout {
      grid-template-rows: minmax(120px, 22vh) minmax(0, 1fr);
    }
    .nlsb-center {
      width: min(620px, 92vw);
      border-radius: 14px;
    }
    .nlsb-seats {
      padding-right: 10px;
      padding-left: 10px;
    }
    .nlsb-seats.nlsb-mode-packed .nlsb-tier {
      gap: 4px;
    }
    .nlsb-seats.nlsb-mode-packed .nlsb-seat {
      width: 54px;
      flex-basis: 54px;
    }
    .nlsb-seats.nlsb-mode-packed .nlsb-icon {
      width: 32px;
      height: 32px;
      flex-basis: 32px;
      font-size: 11px;
    }
    .nlsb-seats.nlsb-mode-packed .nlsb-name,
    .nlsb-seats.nlsb-mode-normal .nlsb-name {
      display: none;
    }
    .nlsb-seats.nlsb-mode-normal .nlsb-seat {
      min-width: 44px;
    }
  }
  @media (max-height: 560px) {
    .nlsb-stage {
      padding-top: 48px;
      padding-bottom: 54px;
    }
    .nlsb-stage-layout {
      grid-template-rows: minmax(100px, 22vh) minmax(0, 1fr);
      gap: 10px;
    }
    .nlsb-center {
      gap: 5px;
      padding-top: 14px;
      padding-bottom: 14px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-toggle,
    .nlsb-stage,
    .nlsb-seat,
    .nlsb-bubble {
      transition: none;
    }
    .nlsb-tier {
      transform: none;
    }
    .nlsb-bubble {
      animation: none;
    }
  }
`;function colorFromKey(key){let value=String(key||"venue"),hash=2166136261;for(let i=0;i<value.length;i+=1)hash^=value.charCodeAt(i),hash=Math.imul(hash,16777619);return`hsl(${(hash>>>0)%360}, 68%, 46%)`}var _forcedLiveId=null;function liveIdFromPathname(){if(_forcedLiveId)return _forcedLiveId;let match=String(location.pathname||"").match(/^\/watch\/(lv\d{1,15})(?:\/|$)/i);return match?match[1].toLowerCase():""}function ensureVenueStyle(){if(document.getElementById(STYLE_ID))return;let style=document.createElement("style");style.id=STYLE_ID,style.textContent=VENUE_CSS,(document.head||document.documentElement).appendChild(style)}function createSeatNode(seatIndex){let seat=document.createElement("a");seat.className="nlsb-seat nlsb-is-empty",seat.dataset.seatIndex=String(seatIndex),seat.setAttribute("aria-hidden","true"),seat.target="_blank",seat.rel="noopener noreferrer",seat.style.textDecoration="none",seat.style.color="inherit";let icon=document.createElement("div");icon.className="nlsb-icon";let avatar=document.createElement("img");avatar.className="nlsb-avatar",avatar.alt="",avatar.decoding="async",avatar.referrerPolicy="no-referrer",avatar.hidden=!0;let fallback=document.createElement("div");fallback.className="nlsb-icon-fallback",icon.append(avatar,fallback);let name=document.createElement("span");return name.className="nlsb-name",seat.append(icon,name),avatar.addEventListener("load",()=>{avatar.dataset.avatar===avatar.getAttribute("src")&&(avatar.hidden=!1,fallback.hidden=!0)}),avatar.addEventListener("error",()=>{if(avatar.dataset.avatar!==avatar.getAttribute("src"))return;let face="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg";if(avatar.getAttribute("src")!==face){avatar.dataset.avatar=face,avatar.src=face,avatar.hidden=!1,fallback.hidden=!0;return}avatar.hidden=!0,fallback.hidden=!1}),{seat,icon,avatar,fallback,name}}function hasVenueExtensionContext(){try{return!!(chrome?.runtime?.id&&chrome?.storage?.local)}catch{return!1}}function mountVenueBarButton(options={}){let isStandalone=!!options.standalone,NOOP_API={onLiveComments:()=>{}};if(!liveIdFromPathname()||document.getElementById(ROOT_ID))return NOOP_API;let parent=isStandalone?document.body:document.documentElement;if(!parent)return NOOP_API;ensureVenueStyle();let root=document.createElement("div");root.id=ROOT_ID,root.className="nlsb-root nlsb-full";let toggle=document.createElement("button");toggle.type="button",toggle.className="nlsb-toggle",toggle.textContent="\u{1F3DF} \u4F1A\u5834\u30E2\u30FC\u30C9",toggle.setAttribute("aria-expanded","false"),toggle.setAttribute("aria-controls","nlsb-venue-stage");let stage=document.createElement("section");stage.id="nlsb-venue-stage",stage.className="nlsb-stage",stage.setAttribute("role","dialog"),stage.setAttribute("aria-modal","true"),stage.setAttribute("aria-label","\u5168\u753B\u9762\u4F1A\u5834\u30E2\u30FC\u30C9"),stage.setAttribute("aria-hidden","true");let close=document.createElement("button");close.type="button",close.className="nlsb-comeview-btn nlsb-close-btn",close.textContent="\u2715 \u9589\u3058\u308B",close.title="\u4F1A\u5834\u30E2\u30FC\u30C9\u3092\u9589\u3058\u307E\u3059";let isObsCapture=(window.name||"").includes("OBS")||window.location.search.includes("obs=");isStandalone&&(toggle.style.display="none",isObsCapture?close.style.display="none":(close.textContent="\u2715 \u30BF\u30D6\u3092\u9589\u3058\u308B",close.title="\u4F1A\u5834\u30BF\u30D6\u3092\u9589\u3058\u307E\u3059"),root.style.background="#0a0b0c");let crowdCanvas=document.createElement("canvas");crowdCanvas.className="nlsb-crowd-canvas",crowdCanvas.width=1200,crowdCanvas.height=350;let stageLayout=document.createElement("div");stageLayout.className="nlsb-stage-layout",stageLayout.appendChild(crowdCanvas);let center=document.createElement("div");center.className="nlsb-center";let centerLabel=document.createElement("div");centerLabel.className="nlsb-center-label",centerLabel.textContent="\u914D\u4FE1\u8005\u30B9\u30C6\u30FC\u30B8";let centerTitle=document.createElement("div");centerTitle.className="nlsb-center-title",centerTitle.textContent=String(document.title||"").trim()||"\u914D\u4FE1\u4E2D\u306E\u756A\u7D44";let centerMeta=document.createElement("div");centerMeta.className="nlsb-center-meta",centerMeta.textContent=liveIdFromPathname(),center.append(centerLabel,centerTitle,centerMeta);let seating=document.createElement("div");seating.className="nlsb-seating";let header=document.createElement("div");header.className="nlsb-header";let title=document.createElement("div");title.className="nlsb-title",title.textContent="\u4F1A\u5834\u53C2\u52A0\u8005 0\u4EBA";let headerRight=document.createElement("div");headerRight.className="nlsb-header-right";let rosterBtn=document.createElement("button");rosterBtn.type="button",rosterBtn.className="nlsb-comeview-btn",rosterBtn.textContent="\u{1F465} \u4E00\u89A7",rosterBtn.title="\u4ECA\u3053\u306E\u4F1A\u5834\u306B\u3044\u308B\u30E1\u30F3\u30D0\u30FC\u306E\u4E00\u89A7(\u8A3A\u65AD)\u3092\u958B\u304F",rosterBtn.addEventListener("click",()=>toggleRosterPanel());let comeviewBtn=document.createElement("button");comeviewBtn.type="button",comeviewBtn.className="nlsb-comeview-btn",comeviewBtn.textContent="\u{1F4AC} \u30B3\u30E1\u30D3\u30E5",comeviewBtn.title="\u8AAD\u307F\u4E0A\u3052\u4ED8\u304D\u30B3\u30E1\u30F3\u30C8\u30D3\u30E5\u30FC\u30A2(\u5225\u30A6\u30A3\u30F3\u30C9\u30A6)\u3092\u958B\u304F",comeviewBtn.addEventListener("click",()=>{try{chrome.runtime.sendMessage({type:"NLS_OPEN_COMEVIEW",liveId:liveIdFromPathname()})}catch{}});let voiceBtn=document.createElement("button");voiceBtn.type="button",voiceBtn.className="nlsb-comeview-btn nlsb-voice-btn",voiceBtn.style.marginLeft="8px",voiceBtn.textContent="\u{1F508} \u8AAD\u307F\u4E0A\u3052: OFF";let voiceStatus=document.createElement("span");voiceStatus.className="nlsb-voice-status",voiceStatus.style.marginLeft="8px",voiceStatus.style.fontSize="12px",voiceStatus.style.color="#7a828e";let venueWindowBtn=null;isStandalone||(venueWindowBtn=document.createElement("button"),venueWindowBtn.type="button",venueWindowBtn.className="nlsb-comeview-btn",venueWindowBtn.textContent="\u2197 \u5225\u7A93\u5316",venueWindowBtn.title="\u4F1A\u5834\u30E2\u30FC\u30C9\u3092\u5225\u30A6\u30A3\u30F3\u30C9\u30A6(OBS\u7B49\u7528)\u3067\u958B\u304F",venueWindowBtn.style.marginLeft="8px",venueWindowBtn.addEventListener("click",()=>{try{chrome.runtime.sendMessage({type:"NLS_OPEN_VENUE",liveId:liveIdFromPathname()}),userChangedOpen=!0,setOpen(!1,!0)}catch{}}));let note=document.createElement("div");note.className="nlsb-note",note.textContent="\u5168\u30B3\u30E1\u30F3\u30C8\u96C6\u8A08\u30FB\u6700\u5927150\u5E2D",venueWindowBtn?headerRight.append(rosterBtn,comeviewBtn,voiceBtn,voiceStatus,venueWindowBtn,note,close):headerRight.append(rosterBtn,comeviewBtn,voiceBtn,voiceStatus,note,close),header.append(title,headerRight);let seatsHost=document.createElement("div");seatsHost.className="nlsb-seats nlsb-mode-empty";let tierNodes=[];for(let i=0;i<VENUE_MAX_TIER_NODES;i+=1){let tier=document.createElement("div");tier.className="nlsb-tier",tier.dataset.tierIndex=String(i),tier.hidden=!0,tierNodes.push(tier),seatsHost.appendChild(tier)}let seatNodes=[];for(let i=0;i<150;i+=1){let node=createSeatNode(i);seatNodes.push(node),tierNodes[0].appendChild(node.seat)}let emptyMessage=document.createElement("div");emptyMessage.className="nlsb-empty-message",emptyMessage.textContent="\u307E\u3060\u540D\u524D\u4ED8\u304D\u306E\u53C2\u52A0\u8005\u304C\u3044\u307E\u305B\u3093",seatsHost.appendChild(emptyMessage);let venueDrag=initVenueDragState(),venueDragMaxScroll=()=>Math.max(0,seatsHost.scrollHeight-seatsHost.clientHeight);seatsHost.addEventListener("pointerdown",e=>{e.button===0&&(venueDrag=beginVenueDrag(e.clientY,seatsHost.scrollTop),seatsHost.classList.add("nlsb-is-grabbing"))}),seatsHost.addEventListener("pointermove",e=>{if(!venueDrag.active)return;let r=updateVenueDrag(venueDrag,e.clientY,venueDragMaxScroll());venueDrag=r.state,venueDrag.moved&&(seatsHost.scrollTop=r.scrollTop,typeof e.preventDefault=="function"&&e.preventDefault())});let endVenueDragHandler=()=>{let{state,wasDrag}=endVenueDrag(venueDrag);if(venueDrag=state,seatsHost.classList.remove("nlsb-is-grabbing"),wasDrag){let swallow=ev=>{ev.stopPropagation(),typeof ev.preventDefault=="function"&&ev.preventDefault(),seatsHost.removeEventListener("click",swallow,!0)};seatsHost.addEventListener("click",swallow,!0)}};seatsHost.addEventListener("pointerup",endVenueDragHandler),seatsHost.addEventListener("pointerleave",endVenueDragHandler),seatsHost.addEventListener("pointercancel",endVenueDragHandler);let safeArea=document.createElement("div");if(safeArea.className="nlsb-safe-area",safeArea.setAttribute("aria-hidden","true"),isStandalone&&liveIdFromPathname()){let iframe=document.createElement("iframe");iframe.src=`https://live.nicovideo.jp/embed/${liveIdFromPathname()}`,iframe.style.width="100%",iframe.style.height="100%",iframe.style.border="none",iframe.style.pointerEvents="auto",safeArea.appendChild(iframe),safeArea.style.pointerEvents="auto"}let residentsLayer=document.createElement("div");residentsLayer.className="nlsb-residents",residentsLayer.setAttribute("aria-hidden","false");let charFrameLayer=document.createElement("div");charFrameLayer.className="nlsb-charframe",charFrameLayer.setAttribute("aria-hidden","true"),seating.append(header,seatsHost),stageLayout.append(crowdCanvas,safeArea,charFrameLayer,seating,center,residentsLayer);let bubbleLayer=document.createElement("div");bubbleLayer.className="nlsb-bubble-layer",bubbleLayer.setAttribute("aria-live","polite");let rosterPanel=document.createElement("div");rosterPanel.className="nlsb-roster-panel",rosterPanel.hidden=!0,stage.append(stageLayout,bubbleLayer,rosterPanel),root.append(toggle,stage),parent.appendChild(root);let open=!1,userChangedOpen=!1,voiceLoadingTimer=0,renderVoiceLoading=state=>{let view=resolveVoiceLoadingView(state,"venue");voiceStatus.classList.toggle("is-loading",view.kind==="loading"),voiceStatus.classList.toggle("is-error",view.kind==="error"),voiceStatus.textContent=view.text},driveVoiceLoading=state=>{if(voiceLoadingTimer&&(window.clearTimeout(voiceLoadingTimer),voiceLoadingTimer=0),state==="checking"){voiceStatus.classList.remove("is-loading","is-error"),voiceStatus.textContent="",voiceLoadingTimer=window.setTimeout(()=>{voiceLoadingTimer=0,shouldRenderLoading("checking",180)&&renderVoiceLoading("checking")},180);return}renderVoiceLoading(state)},voicePlayer=new VoicePlayer({storage:typeof chrome<"u"&&chrome.storage?chrome.storage.local:null,onToggle:(enabled,readNameEnabled,toggleBusy)=>{voiceBtn.disabled=toggleBusy,voiceBtn.classList.toggle("is-on",enabled),voiceBtn.textContent=enabled?"\u{1F50A} \u8AAD\u307F\u4E0A\u3052: ON":"\u{1F508} \u8AAD\u307F\u4E0A\u3052: OFF"},onStatus:msg=>{msg&&(voiceStatus.classList.remove("is-loading"),voiceStatus.classList.toggle("is-error",/見つかりません|ブロック/.test(msg)),voiceStatus.textContent=msg)},onLoadingState:state=>driveVoiceLoading(state),onSkip:()=>{},isObsMode:()=>(window.name||"").includes("OBS")||window.location.search.includes("obs="),audioConstructor:typeof window<"u"?window.Audio:null,createObjectURL:typeof URL<"u"?URL.createObjectURL.bind(URL):null,revokeObjectURL:typeof URL<"u"?URL.revokeObjectURL.bind(URL):null,fetchVoicevoxAlive:isVoicevoxAlive,fetchVoiceStyleIds:listVoicevoxStyleIds,fetchSynthesizeVoice:synthesizeVoice,resolveVoice:resolveVoiceForUser});voiceBtn.addEventListener("click",()=>{voicePlayer.enabled?voicePlayer.disable():voicePlayer.enable()}),voicePlayer.initialize({forceOn:!0});let aggregateTimer=0,aggregateInFlight=!1,speechTimer=0,speechInFlight=!1,speechGeneration=0,speechLiveId="",speechState={seenKeys:null,primed:!1},speechStreaks=new Map,activeLiveId="",escapeListening=!1,lastCrowdCount=-1,lastCrowdSeed=NaN,crowdAnimCount=0,crowdAnimSeed=0,crowdHeatLevel=0,crowdRaf=0,crowdLastDrawMs=0,crowdReducedMotion=typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches,baseRows=[],aggregatedChunkSeqs=[],aggregatedCandidates=[],liveRoster=new Map,rosterDriven=VENUE_ROSTER_ENABLED&&!isStandalone,rosterCommitRaf=0,rosterPruneTimer=0,lastGoodRows=[],hasRenderedNonEmpty=!1,lastRosterInput={allSeats:[],visibleSeats:[],audienceCount:0},renderRosterPanel=()=>{let roster=buildVenueRoster(lastRosterInput),summaryLine=formatVenueRosterSummary(roster.summary),head=`<div class="nlsb-roster-head"><strong>\u4F1A\u5834\u30E1\u30F3\u30D0\u30FC\u4E00\u89A7\uFF08\u8A3A\u65AD\uFF09</strong><button type="button" class="nlsb-roster-close" aria-label="\u9589\u3058\u308B">\xD7</button></div><div class="nlsb-roster-summary">${escapeHtml(summaryLine)}</div>`,rowsHtml=roster.rows.map(r=>{let who=r.name||(r.userId?`id:${r.userId}`:"\u533F\u540D"),badges=(r.hasThumb?'<span class="nlsb-roster-badge thumb">\u30B5\u30E0\u30CD</span>':"")+(r.isGift?'<span class="nlsb-roster-badge gift">\u30AE\u30D5\u30C8</span>':"")+(r.visible?'<span class="nlsb-roster-badge on">\u8868\u793A\u4E2D</span>':'<span class="nlsb-roster-badge off">\u96A0\u308C</span>');return`<div class="nlsb-roster-row"><span class="nlsb-roster-seat">#${r.seatIndex+1}</span><span class="nlsb-roster-who">${escapeHtml(who)}</span><span class="nlsb-roster-badges">${badges}</span></div>`}).join("");rosterPanel.innerHTML=head+`<div class="nlsb-roster-list">${rowsHtml||'<div class="nlsb-roster-empty">\u307E\u3060\u8AB0\u3082\u3044\u307E\u305B\u3093</div>'}</div>`;let closeBtn=rosterPanel.querySelector(".nlsb-roster-close");closeBtn&&closeBtn.addEventListener("click",()=>toggleRosterPanel(!1))},onRosterOutsideClick=event=>{if(rosterPanel.hidden)return;let target=event.target;target&&rosterPanel.contains(target)||toggleRosterPanel(!1)},toggleRosterPanel=force=>{let next=typeof force=="boolean"?force:rosterPanel.hidden;next&&renderRosterPanel(),rosterPanel.hidden=!next,next?setTimeout(()=>{rosterPanel.hidden||stage.addEventListener("click",onRosterOutsideClick)},0):stage.removeEventListener("click",onRosterOutsideClick)},spokenUserIds=new Set,seatByKey=new Map,bubbleBySeat=new Map,activeBubbles=[],bubbleFlowTimestamps=[],recordBubbleFlow=nowMs2=>{bubbleFlowTimestamps.push(nowMs2);let cutoff=nowMs2-BUBBLE_FLOW_WINDOW_MS;(bubbleFlowTimestamps.length>256||bubbleFlowTimestamps[0]<cutoff)&&(bubbleFlowTimestamps=bubbleFlowTimestamps.filter(t=>t>=cutoff))},currentBubbleFlowPerSec=nowMs2=>{let cutoff=nowMs2-BUBBLE_FLOW_WINDOW_MS;return bubbleFlowTimestamps.filter(t=>t>=cutoff).length/BUBBLE_FLOW_WINDOW_MS*1e3},removeBubble=bubble=>{if(!bubble||bubble.removed)return;bubble.removed=!0,bubble.fadeTimer&&clearTimeout(bubble.fadeTimer),bubble.removeTimer&&clearTimeout(bubble.removeTimer),bubble.speakingCapTimer&&clearTimeout(bubble.speakingCapTimer);let key=bubble.bubbleKey!=null?bubble.bubbleKey:bubble.seatIndex;bubbleBySeat.get(key)===bubble&&bubbleBySeat.delete(key);let index=activeBubbles.indexOf(bubble);index>=0&&activeBubbles.splice(index,1),bubble.element.remove()},crowdBubbleAnchor=speakerKey=>{let h=2166136261,s=String(speakerKey||"");for(let i=0;i<s.length;i+=1)h^=s.charCodeAt(i),h=Math.imul(h,16777619);let frac=(h>>>0)%1e3/1e3,w=800,bottom=560;try{let r=bubbleLayer.getBoundingClientRect();r&&r.width>0&&(w=r.width),r&&r.height>0&&(bottom=r.height-80)}catch{}return{x:Math.round(40+frac*Math.max(80,w-200)),y:Math.max(40,bottom)}},clearBubbles=()=>{for(let bubble of[...activeBubbles])removeBubble(bubble)},truncateBubbleText=text=>{let chars=Array.from(String(text||"").trim());return chars.length<=BUBBLE_TEXT_MAX?chars.join(""):`${chars.slice(0,BUBBLE_TEXT_MAX).join("")}\u2026`},showSpeechBubble=speech=>{let seatIndex=seatByKey.get(speech.speakerKey),hasSeat=typeof seatIndex=="number"&&Number.isInteger(seatIndex),node=hasSeat?seatNodes[seatIndex]:null,seatUsable=hasSeat&&node&&!node.seat.classList.contains("nlsb-is-empty"),streak=updateSpeechStreak(speechStreaks,speech.speakerKey,Date.now());if(seatUsable){node.seat.classList.remove("nlsb-seat-speaking"),node.seat.offsetWidth,node.seat.classList.add("nlsb-seat-speaking"),window.setTimeout(()=>node.seat.classList.remove("nlsb-seat-speaking"),650);let streakStage=streakGlowStage(streak.count);streakStage>0?node.seat.dataset.streak=String(streakStage):delete node.seat.dataset.streak}let text=truncateBubbleText(speech.text);if(!text)return;let bubbleKey=seatUsable?seatIndex:`nf:${speech.speakerKey}`,previous=bubbleBySeat.get(bubbleKey);if(previous&&removeBubble(previous),activeBubbles.length>=BUBBLE_MAX){let toEvict=selectBubblesToEvict(activeBubbles,BUBBLE_MAX-1,Date.now());for(let victim of toEvict)removeBubble(victim)}let element=document.createElement("div");element.className="nlsb-bubble";let textSpan=document.createElement("span");textSpan.className="nlsb-bubble-text",textSpan.textContent=text,element.appendChild(textSpan),element.setAttribute("aria-hidden","true"),bubbleLayer.appendChild(element);let now=Date.now();recordBubbleFlow(now);let flowBase=resolveBubbleFlowLifetimeMs(currentBubbleFlowPerSec(now),BUBBLE_LIFETIME_MS),lifetimeMs=Math.max(flowBase,streakBubbleLifetimeMs(streak.count,flowBase)),reducedMotion=typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches,bubble={bubbleKey,seatIndex:seatUsable?seatIndex:-1,fallbackAnchor:seatUsable?null:crowdBubbleAnchor(speech.speakerKey),element,fadeTimer:0,removeTimer:0,removed:!1,voiceState:"pending",createdAt:now,flowLifetimeMs:lifetimeMs,reducedMotion,speakingCapTimer:0};return bubbleBySeat.set(bubbleKey,bubble),activeBubbles.push(bubble),positionBubble(bubble),scheduleBubbleFade(bubble,resolvePendingLifetimeMs(lifetimeMs,voicePlayer.enabled)),voicePlayer.enabled&&element.classList.add("nlsb-bubble-previoice"),bubble},scheduleBubbleFade=(bubble,lifetimeMs)=>{if(!bubble||bubble.removed)return;bubble.fadeTimer&&(clearTimeout(bubble.fadeTimer),bubble.fadeTimer=0),bubble.removeTimer&&(clearTimeout(bubble.removeTimer),bubble.removeTimer=0);let ms=Math.max(0,lifetimeMs);bubble.reducedMotion||(bubble.fadeTimer=window.setTimeout(()=>{bubble.fadeTimer=0,bubble.removed||bubble.element.classList.add("nlsb-is-leaving")},Math.max(0,ms-BUBBLE_FADE_MS))),bubble.removeTimer=window.setTimeout(()=>{bubble.removeTimer=0,removeBubble(bubble)},ms)},markBubbleSpeaking=bubble=>{if(!bubble||bubble.removed)return;let next=nextBubbleVoiceState(bubble.voiceState,"audioStart");if(next!=="speaking"||bubble.voiceState==="speaking"){bubble.voiceState=next;return}bubble.voiceState="speaking",bubble.fadeTimer&&(clearTimeout(bubble.fadeTimer),bubble.fadeTimer=0),bubble.removeTimer&&(clearTimeout(bubble.removeTimer),bubble.removeTimer=0),bubble.element.classList.remove("nlsb-is-leaving"),bubble.element.classList.remove("nlsb-bubble-previoice"),bubble.element.classList.add("nlsb-bubble-voiced"),bubble.speakingCapTimer&&clearTimeout(bubble.speakingCapTimer),bubble.speakingCapTimer=window.setTimeout(()=>{bubble.speakingCapTimer=0,markBubbleDone(bubble)},BUBBLE_VOICE_SPEAKING_CAP_MS)},markBubbleDone=bubble=>{if(!bubble||bubble.removed)return;let next=nextBubbleVoiceState(bubble.voiceState,"audioEnd");bubble.voiceState=next,bubble.element.classList.remove("nlsb-bubble-previoice"),bubble.speakingCapTimer&&(clearTimeout(bubble.speakingCapTimer),bubble.speakingCapTimer=0),next==="done"&&scheduleBubbleFade(bubble,BUBBLE_VOICE_AFTERGLOW_MS)},markBubbleResolved=bubble=>{if(!bubble||bubble.removed)return;let next=nextBubbleVoiceState(bubble.voiceState,"resolved");if(next===bubble.voiceState)return;bubble.voiceState=next,bubble.element.classList.remove("nlsb-bubble-previoice");let flow=typeof bubble.flowLifetimeMs=="number"&&bubble.flowLifetimeMs>0?bubble.flowLifetimeMs:0,age=Date.now()-(bubble.createdAt||Date.now());scheduleBubbleFade(bubble,Math.max(0,flow-age))},giftProjPool=[],giftProjActive=0,GIFT_PROJ_POOL_SIZE=10,giftThrowOriginForSpeaker=speakerKey=>{let seatIndex=seatByKey.get(speakerKey),node=typeof seatIndex=="number"?seatNodes[seatIndex]:null;if(node&&node.icon&&node.icon.isConnected)try{let layerRect=bubbleLayer.getBoundingClientRect(),r=node.icon.getBoundingClientRect();if(r.width>0)return{x:r.left-layerRect.left+r.width/2,y:r.top-layerRect.top+r.height/2}}catch{}return crowdBubbleAnchor(speakerKey)},giftThrowTarget=()=>{try{let layerRect=bubbleLayer.getBoundingClientRect(),r=safeArea.getBoundingClientRect();if(r.width>0)return{x:r.left-layerRect.left+r.width/2,y:r.top-layerRect.top+r.height/2}}catch{}let lr=bubbleLayer.getBoundingClientRect();return{x:lr.width/2,y:lr.height*.4}},launchGiftThrow=(speakerKey,proj)=>{if(!proj||!open||!canLaunchGiftThrow(giftProjActive))return;let el=giftProjPool.pop()||(()=>{let d=document.createElement("div");return d.className="nlsb-gift-proj",bubbleLayer.appendChild(d),d})(),origin=giftThrowOriginForSpeaker(speakerKey),target=giftThrowTarget(),path=resolveGiftThrowPath(origin,target);el.innerHTML="";let imageUrl=String(proj.imageUrl||"");if(el.classList.toggle("is-image",!!imageUrl),imageUrl){let img=document.createElement("img");img.className="nlsb-gift-proj-img",img.alt="",img.decoding="async",img.loading="eager",img.addEventListener("error",()=>{el.classList.remove("is-image"),img.remove();let emoji=document.createElement("span");emoji.className="nlsb-gift-proj-emoji",emoji.textContent=proj.emoji;let label=document.createElement("span");label.textContent=proj.label,el.prepend(label),el.prepend(emoji)},{once:!0}),img.src=imageUrl,el.append(img)}else{let emoji=document.createElement("span");emoji.className="nlsb-gift-proj-emoji",emoji.textContent=proj.emoji;let label=document.createElement("span");label.textContent=proj.label,el.append(emoji,label)}el.style.left=`${path.startX}px`,el.style.top=`${path.startY}px`,el.style.setProperty("--nlsb-gift-dx",`${path.dx}px`),el.style.setProperty("--nlsb-gift-dy",`${path.dy}px`),el.style.setProperty("--nlsb-gift-mx",`${path.midX}px`),el.style.setProperty("--nlsb-gift-my",`${path.midY}px`),el.style.setProperty("--nlsb-gift-dur",`${proj.durationMs}ms`),giftProjActive+=1;let recycle=()=>{el.removeEventListener("animationend",recycle),el.classList.remove("is-flying","is-image"),el.style.cssText="",el.textContent="",giftProjActive=Math.max(0,giftProjActive-1),giftProjPool.length<GIFT_PROJ_POOL_SIZE?giftProjPool.push(el):el.remove()};el.addEventListener("animationend",recycle,{once:!0}),window.setTimeout(recycle,proj.durationMs+400),el.offsetWidth,el.classList.add("is-flying")},maybeThrowGiftFromSpeech=speech=>{let text=String(speech?.text||"");if(!text)return;let gift=parseGiftCommentText(text);if(gift){let p=resolveGiftProjectile(gift,"gift");p&&launchGiftThrow(speech.speakerKey,p);return}let ad=parseNicoadCommentText(text);if(ad){let p=resolveGiftProjectile(ad,"ad");p&&launchGiftThrow(speech.speakerKey,p)}},thrownGiftEventKeys=new Set,handleNewGiftEvents=events=>{if(!(!open||!Array.isArray(events)))for(let ev of events){if(!ev||typeof ev!="object")continue;let uid=String(ev.userId||"").trim(),item=String(ev.itemName||"").trim(),point=Number(ev.point)||0,itemId=String(ev.itemId||"").trim(),key=`${uid}|${ev.capturedAt||""}|${item}|${point}`;if(thrownGiftEventKeys.has(key))continue;if(thrownGiftEventKeys.add(key),thrownGiftEventKeys.size>400){let arr=[...thrownGiftEventKeys];thrownGiftEventKeys.clear();for(let k of arr.slice(-200))thrownGiftEventKeys.add(k)}let proj=resolveGiftProjectile({item,point,itemId},"gift");proj&&launchGiftThrow(uid?`u:${uid}`:"",proj)}},positionBubble=bubble=>{if(!bubble||bubble.removed)return;let anchor,node=bubble.seatIndex>=0?seatNodes[bubble.seatIndex]:null;if(node){if(!node.seat.isConnected||!node.icon.isConnected){bubble.element.style.visibility="hidden";return}bubble.element.style.visibility="";let layerRect=bubbleLayer.getBoundingClientRect(),seatRect=node.icon.getBoundingClientRect(),rel={left:seatRect.left-layerRect.left,top:seatRect.top-layerRect.top,width:seatRect.width,height:seatRect.height};anchor=bubbleAnchorForSeatRect(rel,10)}else if(bubble.fallbackAnchor)bubble.element.style.visibility="",anchor=bubble.fallbackAnchor;else return;let h=bubble.element.offsetHeight||40,bw=bubble.element.offsetWidth||160,placed=[];for(let b of activeBubbles)b===bubble||b.removed||!b._x||placed.push({x:b._x,y:b._y,h:b._h||40});let y=resolveBubbleY({x:anchor.x,y:anchor.y,h},placed,{xThreshold:130,vGap:8,minY:8}),targetLeft=anchor.x-bw/2,maxLeft=window.innerWidth-bw-8;targetLeft<8&&(targetLeft=8),targetLeft>maxLeft&&(targetLeft=maxLeft);let tailOffset=anchor.x-targetLeft;bubble._x=anchor.x,bubble._y=y,bubble._h=h,bubble.element.style.setProperty("--nlsb-bubble-tail-x",`${tailOffset}px`),bubble.element.style.left=`${targetLeft}px`,bubble.element.style.top=`${y}px`},repositionAllBubbles=()=>{for(let b of[...activeBubbles])positionBubble(b)},resetSpeechTracking=(nextLiveId="")=>{speechGeneration+=1,speechLiveId=nextLiveId,speechState={seenKeys:null,primed:!1},speechStreaks.clear(),lastGoodRows=[],hasRenderedNonEmpty=!1,liveRoster.clear(),clearBubbles()},applyVenueHeat=commentRows=>{let level=resolveVenueHeatLevel(commentRows,{now:Date.now()});stage.style.setProperty("--nlsb-heat-color",heatLevelToWarmColor(level)),stage.style.setProperty("--nlsb-heat-opacity",String(heatLevelToGlowOpacity(level))),stage.setAttribute("data-nls-heat",heatLevelToLabel(level)),crowdHeatLevel=level},nowMs=()=>typeof performance<"u"&&typeof performance.now=="function"?performance.now():Date.now(),crowdMotionTick=()=>{if(crowdRaf=0,!open||crowdReducedMotion||crowdAnimCount<=0)return;let t=nowMs();t-crowdLastDrawMs>=55&&(crowdLastDrawMs=t,drawCrowdOnCanvas(crowdCanvas,crowdAnimCount,crowdAnimSeed,{timeMs:t,heatLevel:crowdHeatLevel})),typeof requestAnimationFrame=="function"&&(crowdRaf=requestAnimationFrame(crowdMotionTick))},startCrowdMotion=()=>{crowdReducedMotion||crowdRaf||!open||crowdAnimCount<=0||typeof requestAnimationFrame=="function"&&(crowdLastDrawMs=0,crowdRaf=requestAnimationFrame(crowdMotionTick))},stopCrowdMotion=()=>{crowdRaf&&typeof cancelAnimationFrame=="function"&&cancelAnimationFrame(crowdRaf),crowdRaf=0},commitDisplay=incoming=>{let resolved=resolveDisplayRows(incoming,lastGoodRows);lastGoodRows=resolved.nextLastGood,renderSeats(resolved.rows)},clearDisplay=()=>{lastGoodRows=[],hasRenderedNonEmpty=!1,renderSeats([])},residentsRendered=!1,renderResidents=()=>{if(residentsRendered)return;let resolveUrl=typeof chrome<"u"&&chrome.runtime&&typeof chrome.runtime.getURL=="function"?rel=>chrome.runtime.getURL(rel):rel=>rel,residents=buildVenueResidents(resolveUrl);residentsLayer.textContent="";for(let r of residents){let cell=document.createElement("div");cell.className=`nlsb-resident nlsb-resident-${r.id}`;let img=document.createElement("img");img.className="nlsb-resident-img",img.src=r.imgSrc,img.alt=`${r.name}(\u4F1A\u5834\u306E\u6848\u5185\u5F79)`,img.addEventListener("error",()=>{img.style.display="none"});let label=document.createElement("div");label.className="nlsb-resident-name",label.textContent=r.name,cell.append(img,label),residentsLayer.appendChild(cell)}residentsRendered=!0},charFrameRendered=!1,renderCharFrame=()=>{if(charFrameRendered)return;let resolveUrl=typeof chrome<"u"&&chrome.runtime&&typeof chrome.runtime.getURL=="function"?rel=>chrome.runtime.getURL(rel):rel=>rel,tiles=buildVenueCharacterFrame(resolveUrl);charFrameLayer.textContent="";for(let t of tiles){let img=document.createElement("img");img.className="nlsb-charframe-tile",img.src=t.src,img.alt="",img.dataset.edge=t.edge,t.edge==="top"||t.edge==="bottom"?img.style.left=`${(t.pos*100).toFixed(2)}%`:img.style.top=`${(t.pos*100).toFixed(2)}%`,img.addEventListener("error",()=>{img.style.display="none"}),charFrameLayer.appendChild(img)}charFrameRendered=!0},renderSeats=rows=>{let incomingRows=Array.isArray(rows)?rows:[];if(incomingRows.length===0&&hasRenderedNonEmpty)return;let seating2=buildVenueSeating(incomingRows,{maxSeats:150,prevSeatByKey:seatByKey,isGenericName:isGenericComeviewName,promoteUserIds:spokenUserIds});seating2.participantCount>0&&(hasRenderedNonEmpty=!0),seatByKey=seating2.seatByKey,seatsHost.classList.remove(...VENUE_LAYOUT_CLASSES),seatsHost.classList.add(`nlsb-mode-${seating2.layoutMode}`);let seatingHostEl=seatsHost.parentElement;seatingHostEl&&seatingHostEl.style.setProperty("--nlsb-venue-max-h",`${resolveVenueMaxHeightVh(seating2.participantCount)}vh`);let seatAreaWidth=seatsHost.clientWidth||window.innerWidth||1280,seatMinWidth=seating2.layoutMode==="vip"?158:seating2.layoutMode==="normal"?92:76,perRow=seatsPerRow(seatAreaWidth-28,seatMinWidth),visibleSeatCount=resolveVisibleArenaCount({totalCount:seating2.seats.length,perRow,rows:8}),visibleSeatsRaw=selectStableVisibleMembers(seating2.seats,visibleSeatCount,spokenUserIds,entry=>String(entry?.participant?.userId||entry?.participant?.key||"").trim()),visibleSeats=partitionThumbnailFirst(visibleSeatsRaw,entry=>{let p=entry?.participant||{},avatarUrl=String(p.avatar||"").trim(),derived=deriveNicoUserIconUrl(String(p.userId||"").trim());return hasRealThumbnail(avatarUrl)||hasRealThumbnail(derived)}),visibleSeatKeys=new Set(visibleSeats.map(entry=>entry.participant.key)),{totalAnonymous}=collectAudienceFaceUserIds(rows,{isGenericName:isGenericComeviewName,promoteUserIds:spokenUserIds,excludeKeys:visibleSeatKeys});if(lastRosterInput={allSeats:seating2.seats,visibleSeats,audienceCount:totalAnonymous},title.textContent=totalAnonymous>0?`\u4F1A\u5834\u53C2\u52A0\u8005 ${seating2.participantCount}\u4EBA \u30FB \u307B\u304B\u89B3\u5BA2 ${totalAnonymous}\u4EBA`:`\u4F1A\u5834\u53C2\u52A0\u8005 ${seating2.participantCount}\u4EBA`,totalAnonymous>0){crowdCanvas.classList.add("nlsb-is-visible");let seed=Array.from(activeLiveId).reduce((hash,char)=>(hash<<5)-hash+char.charCodeAt(0),0);crowdAnimCount=totalAnonymous,crowdAnimSeed=seed,(totalAnonymous!==lastCrowdCount||seed!==lastCrowdSeed)&&(drawCrowdOnCanvas(crowdCanvas,totalAnonymous,seed,crowdReducedMotion?null:{timeMs:nowMs(),heatLevel:crowdHeatLevel}),lastCrowdCount=totalAnonymous,lastCrowdSeed=seed),startCrowdMotion()}else crowdCanvas.classList.remove("nlsb-is-visible"),lastCrowdCount=-1,crowdAnimCount=0,stopCrowdMotion();for(let node of seatNodes)node.seat.classList.add("nlsb-is-empty"),node.seat.setAttribute("aria-hidden","true"),node.seat.removeAttribute("title"),delete node.seat.dataset.tierIndex,node.seat.parentElement&&node.seat.parentElement.removeChild(node.seat);let tiers=buildVenueTiers(visibleSeats.length,{maxPerRow:perRow});for(let i=0;i<tierNodes.length;i+=1){let tierNode=tierNodes[i],tier=tiers[i];if(tierNode.hidden=!tier,!tier){tierNode.style.removeProperty("--nlsb-tier-y"),tierNode.style.removeProperty("--nlsb-tier-z"),tierNode.style.removeProperty("--nlsb-tier-scale");continue}let translateY=-Math.round(tier.depth*18),translateZ=-Math.round(tier.depth*72);tierNode.style.setProperty("--nlsb-tier-y",`${translateY}px`),tierNode.style.setProperty("--nlsb-tier-z",`${translateZ}px`),tierNode.style.setProperty("--nlsb-tier-scale",String(tier.scale))}let seatCursor=0;for(let tier of tiers){let tierNode=tierNodes[tier.rowIndex];for(let tierSeatIndex=0;tierSeatIndex<tier.count;tierSeatIndex+=1){let entry=visibleSeats[seatCursor];if(seatCursor+=1,!entry)continue;let node=seatNodes[entry.seatIndex],participant=entry.participant;tierNode.appendChild(node.seat),node.seat.dataset.tierIndex=String(tier.rowIndex);let i=entry.seatIndex,uid=String(participant.userId||"").trim(),pageUrl=nicoUserPageUrl(uid),rawName=String(participant.name||"").trim(),displayName=rawName||(uid?anonymousDisplayLabel(uid):anonymousDisplayLabel(participant.key||`\u4F1A\u5834${i+1}`)),colorKey=participant.userId||participant.name||participant.key;node.icon.style.backgroundColor=colorFromKey(colorKey),node.fallback.textContent=Array.from(displayName)[0]||"\u4F1A";let avatarUrl=String(participant.avatar||"").trim(),uidForFace=String(participant.userId||"").trim(),derivedAvatar=deriveNicoUserIconUrl(uidForFace),yukkuriFace=uidForFace?anonymousIdenticonDataUrl(uidForFace,64):"";node.avatar.dataset.fallbackFace=yukkuriFace;let avatarSrc=avatarUrl||derivedAvatar||yukkuriFace;avatarSrc?node.avatar.dataset.avatar!==avatarSrc&&(node.avatar.dataset.avatar=avatarSrc,node.avatar.src=avatarSrc,node.avatar.hidden=!1,node.fallback.hidden=!0):(node.avatar.hidden=!0,node.fallback.hidden=!1,node.avatar.dataset.avatar="",node.avatar.removeAttribute("src")),node.name.textContent=displayName,pageUrl?(node.seat.setAttribute("href",pageUrl),node.seat.classList.add("nlsb-seat-link"),node.seat.title=`${displayName} \u306E\u30E6\u30FC\u30B6\u30FC\u30DA\u30FC\u30B8\u3092\u958B\u304F`):(node.seat.removeAttribute("href"),node.seat.classList.remove("nlsb-seat-link"),node.seat.title=displayName),node.seat.classList.remove("nlsb-is-empty"),node.seat.setAttribute("aria-hidden","false"),node.seat.classList.toggle("nlsb-seat-vip",hasRealThumbnail(avatarUrl)||hasRealThumbnail(derivedAvatar)),node.seat.classList.toggle("nlsb-seat-regular",!!entry.isVipRegular);let speakerKey=uid?`u:${uid}`:rawName?`n:${rawName}`:"",streakEntry=speakerKey?speechStreaks.get(speakerKey):null,seatStreakStage=streakEntry?streakGlowStage(streakEntry.count):0;seatStreakStage>0?node.seat.dataset.streak=String(seatStreakStage):delete node.seat.dataset.streak}}let updatePanAffordance=()=>{let canPan=seatsHost.scrollHeight>seatsHost.clientHeight+2;seatsHost.classList.toggle("nlsb-can-pan",canPan)};typeof requestAnimationFrame=="function"?requestAnimationFrame(()=>{repositionAllBubbles(),updatePanAffordance()}):(repositionAllBubbles(),updatePanAffordance())},aggregateParticipants=async()=>{if(!open||aggregateInFlight)return;if(!hasVenueExtensionContext()){markContextInvalidated();return}let liveId=liveIdFromPathname();if(liveId){aggregateInFlight=!0;try{activeLiveId!==liveId&&(activeLiveId=liveId,baseRows=[],seatByKey=new Map,spokenUserIds.clear(),aggregatedChunkSeqs=[],aggregatedCandidates=[],liveRoster.clear(),clearDisplay());let idxKey=chunkIndexKey(liveId),idxBag=await runStorageOpWithTimeout(()=>chrome.storage.local.get(idxKey),8e3);if(!open||liveIdFromPathname()!==liveId)return;let index=idxBag?idxBag[idxKey]:null,_bcCtx=normalizeBroadcasterCtx(null);try{let _bcBag=await runStorageOpWithTimeout(()=>chrome.storage.local.get(KEY_LIVE_BROADCASTER_CTX),3e3);if(!open||liveIdFromPathname()!==liveId)return;_bcCtx=normalizeBroadcasterCtx(_bcBag?.[KEY_LIVE_BROADCASTER_CTX])}catch{}let _bcUsable=isBroadcasterCtxUsableForGuard(_bcCtx,liveId),LANE_OPTS={requireText:!0,broadcasterUid:_bcUsable?_bcCtx.uid:"",broadcasterIconUrl:_bcUsable?_bcCtx.iconUrl:""};if(isChunkIndex(index,liveId)&&Array.isArray(index.seqs)){let allSeqs=index.seqs,newSeqs=selectNewChunkSeqs(allSeqs,aggregatedChunkSeqs);if(newSeqs.length>0){let keys=newSeqs.map(seq=>chunkStorageKey(liveId,seq)),bag=await runStorageOpWithTimeout(()=>chrome.storage.local.get(keys),8e3);if(!open||liveIdFromPathname()!==liveId)return;let newRows=[];for(let key of keys){let part=bag?bag[key]:null;Array.isArray(part)&&(newRows=newRows.concat(part))}let newCandidates=userLaneCandidatesFromStorage(newRows,liveId,LANE_OPTS);aggregatedCandidates=mergeUserLaneAggregates(aggregatedCandidates,newCandidates),aggregatedChunkSeqs=aggregatedChunkSeqs.concat(newSeqs)}baseRows=venueRowsFromUserLaneCandidates(aggregatedCandidates)}else{let result=await runStorageOpWithTimeout(()=>readChunkedComments(liveId,commentsStorageKey(liveId),keys=>chrome.storage.local.get(keys)),8e3);if(!open||liveIdFromPathname()!==liveId)return;let candidates=userLaneCandidatesFromStorage(result.rows,liveId,LANE_OPTS);baseRows=venueRowsFromUserLaneCandidates(candidates)}let profileBag=await runStorageOpWithTimeout(()=>chrome.storage.local.get(KEY_USER_COMMENT_PROFILE_CACHE),8e3);if(!open||liveIdFromPathname()!==liveId)return;let profileMap=profileBag?.[KEY_USER_COMMENT_PROFILE_CACHE]||null;baseRows=enrichVenueRowsWithProfileAvatars(baseRows,profileMap),commitDisplay(baseRows)}catch(err){if(isContextInvalidatedError(err)||!hasVenueExtensionContext()){markContextInvalidated();return}err!==STORAGE_OP_TIMED_OUT&&console.warn("[venue] aggregate failed; keeping last good",err)}finally{aggregateInFlight=!1}}},aggregateBurstTimers=[],clearAggregateBurst=()=>{for(let t of aggregateBurstTimers)clearTimeout(t);aggregateBurstTimers=[]},stopAggregation=()=>{clearAggregateBurst(),rosterPruneTimer&&(clearInterval(rosterPruneTimer),rosterPruneTimer=0),rosterCommitRaf&&typeof cancelAnimationFrame=="function"&&cancelAnimationFrame(rosterCommitRaf),rosterCommitRaf=0,aggregateTimer&&(clearInterval(aggregateTimer),aggregateTimer=0)},startAggregation=()=>{if(!(aggregateTimer||rosterPruneTimer)){if(rosterDriven){(async()=>(await aggregateParticipants(),!(!open||!rosterDriven)&&(hydrateRosterFromCandidates(liveRoster,aggregatedCandidates,{maxSeats:VENUE_ROSTER_MAX_SEATS}),scheduleRosterCommit())))(),rosterPruneTimer=window.setInterval(()=>{if(!open||!rosterDriven)return;let before=liveRoster.size;pruneRoster(liveRoster,Date.now(),{windowMs:VENUE_ROSTER_WINDOW_MS,vipWindowMs:VENUE_ROSTER_VIP_WINDOW_MS,maxSeats:VENUE_ROSTER_MAX_SEATS}),liveRoster.size!==before&&(baseRows=rosterToVenueRows(liveRoster),commitDisplay(baseRows))},5e3);return}aggregateParticipants(),clearAggregateBurst();for(let delay of[400,1e3,2e3,3500,5500,8e3])aggregateBurstTimers.push(window.setTimeout(()=>{open&&aggregateParticipants()},delay));aggregateTimer=window.setInterval(()=>{aggregateParticipants()},AGGREGATE_INTERVAL_MS)}},processSpeechRows=rows=>{applyVenueHeat(rows),pruneSpeechStreaks(speechStreaks,Date.now());let result=pickNewVenueSpeech(rows,speechState,{maxEmit:24,primeEmit:3});if(speechState={seenKeys:result.seenKeys,primed:result.primed},result.speeches.length>0){for(let speech of result.speeches){let uid=String(speech.userId||"").trim();uid&&spokenUserIds.add(uid)}let nowMs2=Date.now();if(rosterDriven){for(let speech of result.speeches)touchRoster(liveRoster,{userId:speech.userId,name:speech.name,text:speech.text},nowMs2);baseRows=rosterToVenueRows(liveRoster),commitDisplay(baseRows)}else baseRows=mergeSpeakersIntoVenueRows(baseRows,result.speeches,nowMs2),commitDisplay(baseRows)}for(let speech of result.speeches){let bubble=showSpeechBubble(speech);maybeThrowGiftFromSpeech(speech),voicePlayer.enabled&&voicePlayer.enqueue([{kind:"comment",userId:speech.userId,nickname:speech.name,key:speech.key,text:speech.text,onAudioStart:bubble?()=>markBubbleSpeaking(bubble):void 0,onAudioEnd:bubble?()=>markBubbleDone(bubble):void 0,onDropped:bubble?()=>markBubbleResolved(bubble):void 0}])}},scheduleRosterCommit=()=>{if(rosterCommitRaf)return;let run=()=>{rosterCommitRaf=0,!(!open||!rosterDriven)&&(pruneRoster(liveRoster,Date.now(),{windowMs:VENUE_ROSTER_WINDOW_MS,vipWindowMs:VENUE_ROSTER_VIP_WINDOW_MS,maxSeats:VENUE_ROSTER_MAX_SEATS}),baseRows=rosterToVenueRows(liveRoster),commitDisplay(baseRows))};rosterCommitRaf=typeof requestAnimationFrame=="function"?requestAnimationFrame(run):(run(),0)},onLiveComments=(incomingLiveId,rows)=>{if(!open)return;let cur=liveIdFromPathname();if(!cur||cur!==incomingLiveId)return;speechLiveId!==cur&&resetSpeechTracking(cur);let feedRows=liveFeedSpeechRows(rows);if(feedRows.length===0||(processSpeechRows(feedRows),!rosterDriven))return;let now=Date.now();for(let r of feedRows)touchRoster(liveRoster,r,now);scheduleRosterCommit()},pollSpeech=async()=>{if(!open||speechInFlight)return;if(!hasVenueExtensionContext()){markContextInvalidated();return}let liveId=liveIdFromPathname();if(!liveId)return;speechLiveId!==liveId&&resetSpeechTracking(liveId);let generation=speechGeneration,tailKey=tailStorageKey(liveId),summaryKey=commentDbSummaryKey(liveId);speechInFlight=!0;try{let bag=await chrome.storage.local.get([tailKey,summaryKey]);if(!open||generation!==speechGeneration||speechLiveId!==liveId||liveIdFromPathname()!==liveId)return;let tailRows=Array.isArray(bag?.[tailKey])?bag[tailKey]:[],summary=bag?.[summaryKey],recentRows=Array.isArray(summary?.recent)?summary.recent:[],rows=tailRows.length>0?tailRows:recentRows;processSpeechRows(rows)}catch(err){if(isContextInvalidatedError(err)||!hasVenueExtensionContext()){markContextInvalidated();return}}finally{speechInFlight=!1}},handleStorageChange=(changes,areaName)=>{if(areaName!=="local"||!open)return;let liveId=liveIdFromPathname();if(!liveId)return;let tailKey=tailStorageKey(liveId),summaryKey=commentDbSummaryKey(liveId);changes[tailKey]&&Array.isArray(changes[tailKey].newValue)?processSpeechRows(changes[tailKey].newValue):(changes[tailKey]||changes[summaryKey])&&pollSpeech();let giftEventsKey=`nls_gift_events_${liveId}`;if(changes[giftEventsKey]&&Array.isArray(changes[giftEventsKey].newValue)&&handleNewGiftEvents(changes[giftEventsKey].newValue),rosterDriven)return;let idxKey=chunkIndexKey(liveId),chunkPrefix=`nls_cchunk_${liveId}`,chunkChanged=!1;for(let k in changes)if(k===idxKey||k===summaryKey||k.indexOf(chunkPrefix)===0){chunkChanged=!0;break}chunkChanged&&aggregateParticipants()},stopSpeechPolling=()=>{speechTimer&&(clearInterval(speechTimer),speechTimer=0,typeof chrome<"u"&&chrome.storage&&chrome.storage.onChanged&&chrome.storage.onChanged.removeListener(handleStorageChange))},_contextInvalidated=!1,markContextInvalidated=()=>{if(!_contextInvalidated){_contextInvalidated=!0;try{stopAggregation()}catch{}try{stopSpeechPolling()}catch{}try{stopCrowdMotion()}catch{}try{title.textContent="\u26A0 \u62E1\u5F35\u304C\u66F4\u65B0\u3055\u308C\u307E\u3057\u305F\u3002\u30DA\u30FC\u30B8\u3092\u518D\u8AAD\u307F\u8FBC\u307F(F5)\u3057\u3066\u304F\u3060\u3055\u3044",title.style.color="#ffcf66"}catch{}}},startSpeechPolling=()=>{speechTimer||(pollSpeech(),speechTimer=window.setInterval(()=>{pollSpeech()},SPEECH_INTERVAL_MS),typeof chrome<"u"&&chrome.storage&&chrome.storage.onChanged&&chrome.storage.onChanged.addListener(handleStorageChange))},onEscapeKey=event=>{if(!(event.key!=="Escape"||!open)){if(!rosterPanel.hidden){toggleRosterPanel(!1);return}userChangedOpen=!0,setOpen(!1,!0)}},addEscapeListener=()=>{escapeListening||(window.addEventListener("keydown",onEscapeKey),escapeListening=!0)},removeEscapeListener=()=>{escapeListening&&(window.removeEventListener("keydown",onEscapeKey),escapeListening=!1)},reflowRaf=0,reflowListening=!1,onBubbleReflow=()=>{reflowRaf||(reflowRaf=typeof requestAnimationFrame=="function"?requestAnimationFrame(()=>{reflowRaf=0,repositionAllBubbles()}):0,reflowRaf||repositionAllBubbles())},addBubbleReflowListener=()=>{reflowListening||(window.addEventListener("resize",onBubbleReflow),window.addEventListener("scroll",onBubbleReflow,!0),reflowListening=!0)},removeBubbleReflowListener=()=>{reflowListening&&(window.removeEventListener("resize",onBubbleReflow),window.removeEventListener("scroll",onBubbleReflow,!0),reflowRaf&&typeof cancelAnimationFrame=="function"&&cancelAnimationFrame(reflowRaf),reflowRaf=0,reflowListening=!1)},setOpen=(nextOpen,persist)=>{open=nextOpen===!0,root.classList.toggle("nlsb-is-open",open),toggle.setAttribute("aria-expanded",open?"true":"false"),stage.setAttribute("aria-hidden",open?"false":"true"),open?(addEscapeListener(),addBubbleReflowListener(),renderResidents(),renderCharFrame(),startAggregation(),startSpeechPolling()):(removeEscapeListener(),removeBubbleReflowListener(),stopAggregation(),stopSpeechPolling(),stopCrowdMotion(),resetSpeechTracking())};return toggle.addEventListener("click",()=>{userChangedOpen=!0,setOpen(!open,!0)}),close.addEventListener("click",()=>{if(isStandalone){stopAggregation(),stopSpeechPolling(),stopCrowdMotion();try{window.close()}catch{}userChangedOpen=!0,setOpen(!1,!1);return}userChangedOpen=!0,setOpen(!1,!0)}),window.addEventListener("pagehide",()=>{stopAggregation(),stopSpeechPolling(),stopCrowdMotion(),resetSpeechTracking(),removeEscapeListener()},{once:!0}),document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&!(!open||!voicePlayer.enabled))try{voicePlayer.flushPendingQueue()}catch{}}),setOpen(!!isStandalone,!1),{onLiveComments}}function mountVenueStandalone(liveId){_forcedLiveId=liveId,mountVenueBarButton({standalone:!0})}function main(){let liveId=new URLSearchParams(location.search).get("lv");liveId&&mountVenueStandalone(liveId)}main();})();
