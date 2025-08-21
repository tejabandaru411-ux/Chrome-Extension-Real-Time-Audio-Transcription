// ==================== CONFIG ====================
const STEP_MS = 30000;      // start a new segment every 30s
const DURATION_MS = 33000;  // each segment records 33s => 3s overlap
const CHUNK_MS = 3000;      // ondataavailable timeslice

// ==================== UI ELEMENTS ====================
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const timerDiv = document.getElementById('timer');
const transcriptionDisplay = document.getElementById('transcription-display');
const copyBtn = document.getElementById('copyBtn');
const downloadTxtBtn = document.getElementById('downloadTxtBtn');
const downloadJsonBtn = document.getElementById('downloadJsonBtn');
const apiKeyInput = document.getElementById('apiKey');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const useMicChk = document.getElementById('useMic');
const refreshTabsBtn = document.getElementById('refreshTabs');
const tabsList = document.getElementById('tabsList');

// ==================== STATE ====================
let timerInterval = null;
let seconds = 0;
let isRecording = false;

/**
 * sessionId -> {
 *   label, stream, mime,
 *   tickTimer: number,
 *   activeRecorders: Set<MediaRecorder>
 * }
 * sessionId is "tab-<tabId>" or "mic-1"
 */
const SESSIONS = new Map();
const PENDING_QUEUE = [];
const TRANSCRIPTS = [];

// ==================== STATUS/TIMER ====================
function setStatus(text, type='idle'){ statusDiv.textContent=text; statusDiv.className=`status-${type}`; }
function updateTimer(){ seconds++; timerDiv.textContent=new Date(seconds*1000).toISOString().substring(11,19); }
function resetTimer(){ clearInterval(timerInterval); seconds=0; timerDiv.textContent='00:00:00'; }

// ==================== STORAGE ====================
chrome.storage.local.get(['GOOGLE_API_KEY'], (r)=>{ if (r?.GOOGLE_API_KEY) apiKeyInput.value=r.GOOGLE_API_KEY; });
saveKeyBtn.addEventListener('click', ()=>{
  chrome.storage.local.set({ GOOGLE_API_KEY: apiKeyInput.value.trim() }, ()=>{ setStatus('API key saved','processing'); setTimeout(()=>setStatus('Idle','idle'),700); });
});
const getApiKey = ()=>new Promise(res=>chrome.storage.local.get(['GOOGLE_API_KEY'], r=>res(r?.GOOGLE_API_KEY||'')));

// ==================== NET ====================
window.addEventListener('online', ()=>retryPendingQueue());

// ==================== TABS PICKER ====================
refreshTabsBtn.addEventListener('click', listAudibleTabs);
function listAudibleTabs(){
  tabsList.innerHTML='<div class="placeholder">Loading…</div>';
  chrome.tabs.query({ audible:true }, (tabs)=>renderTabs(tabs||[]));
}
function renderTabs(tabs){
  tabsList.innerHTML='';
  if(!tabs.length){ tabsList.innerHTML='<div class="placeholder">No audible tabs detected.</div>'; return; }
  for(const t of tabs){
    const row=document.createElement('label'); row.className='tab-item';
    const cb=document.createElement('input'); cb.type='checkbox'; cb.value=t.id; cb.dataset.tabId=t.id;
    const icon=document.createElement('img'); icon.src=t.favIconUrl||'icons/icon16.png';
    const title=document.createElement('div'); title.className='tab-title'; title.textContent=t.title||t.url||`Tab ${t.id}`;
    const badge=document.createElement('span'); badge.className='badge'; badge.textContent='tab';
    row.append(cb,icon,title,badge); tabsList.appendChild(row);
  }
}

// 🔴 NEW: live add/remove while recording
tabsList.addEventListener('change', async (e) => {
  if (e.target?.type !== 'checkbox') return;
  const tabId = parseInt(e.target.value, 10);
  if (!isRecording) return; // only live-manage during recording

  const sessionId = `tab-${tabId}`;
  if (e.target.checked) {
    // start if not already recording
    if (!SESSIONS.has(sessionId)) {
      setStatus(`Adding ${sessionId}…`, 'processing');
      try {
        await startTabSession(tabId);
        setStatus('Recording…', 'recording');
      } catch (err) {
        setStatus(`Couldn’t add tab: ${err?.message || err}`, 'error');
        e.target.checked = false;
      }
    }
  } else {
    // stop just that session
    await stopSession(sessionId);
    setStatus('Recording…', 'recording');
  }
});

// ==================== CAPTURE ====================
startBtn.addEventListener('click', startRequested);
stopBtn.addEventListener('click', stopAll);

async function startRequested(){
  await stopAll(); // clean reset
  const apiKey = await getApiKey();
  if(!apiKey){ setStatus('Missing Google API Key. Enter it above.','error'); return; }

  const tabIds = Array.from(tabsList.querySelectorAll('input[type="checkbox"]:checked')).map(x=>parseInt(x.value,10));
  const useMic = !!useMicChk.checked;

  setStatus('Requesting audio…','processing');
  let started = 0;

  for(const tabId of tabIds){ if (await startTabSession(tabId).catch(()=>false)) started++; }
  if(useMic){ if (await startMicSession().catch(()=>false)) started++; }

  if(started===0){ setStatus('Nothing started (no tabs or mic).','error'); startBtn.disabled=false; stopBtn.disabled=true; return; }

  isRecording = true;
  setStatus(`Recording… (${started} channel${started>1?'s':''})`,'recording');
  startBtn.disabled = true;
  stopBtn.disabled = false;
  transcriptionDisplay.innerHTML = '';
  resetTimer(); timerInterval=setInterval(updateTimer,1000);
}

async function startTabSession(tabId){
  const info = await chrome.tabs.get(tabId);
  // The API captures the *active* tab in the focused window. Briefly activate this tab to obtain the stream.
  await chrome.windows.update(info.windowId,{ focused:true });
  await chrome.tabs.update(tabId,{ active:true });
  await new Promise(r=>setTimeout(r,200));

  const stream = await new Promise((resolve,reject)=>{
    chrome.tabCapture.capture({ audio:true, video:false }, (s)=>{
      if(chrome.runtime.lastError || !s) return reject(new Error(chrome.runtime.lastError?.message||'Tab capture failed'));
      resolve(s);
    });
  });

  const label=`Tab: ${info.title||tabId}`;
  const sessionId=`tab-${tabId}`;
  initSession(sessionId, stream, label);
  return true;
}

async function startMicSession(){
  const stream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
  initSession('mic-1', stream, 'Microphone');
  return true;
}

function pickMime(stream){
  try{ return new MediaRecorder(stream,{ mimeType:'audio/webm;codecs=opus' }).mimeType; }catch{}
  try{ return new MediaRecorder(stream,{ mimeType:'audio/ogg;codecs=opus' }).mimeType; }catch{}
  return new MediaRecorder(stream).mimeType || 'audio/webm';
}

function initSession(sessionId, stream, label){
  if (SESSIONS.has(sessionId)) return; // already running
  const mime = pickMime(stream);
  const activeRecorders = new Set();
  const sess = { label, stream, mime, activeRecorders, tickTimer: null };
  SESSIONS.set(sessionId, sess);

  // start one segment immediately, then every STEP_MS
  startOneSegment(sessionId);
  sess.tickTimer = setInterval(()=>startOneSegment(sessionId), STEP_MS);

  const p=document.createElement('p'); p.className='transcription-item';
  const ts=document.createElement('span'); ts.className='ts'; ts.textContent=new Date().toLocaleTimeString();
  const ch=document.createElement('span'); ch.className='chan'; ch.textContent=`${label} started`;
  p.append(ts,ch); transcriptionDisplay.appendChild(p);
}

function startOneSegment(sessionId){
  const s = SESSIONS.get(sessionId); if(!s) return;
  let recorder;
  try{ recorder = new MediaRecorder(s.stream, { mimeType: s.mime }); }
  catch{ recorder = new MediaRecorder(s.stream); }
  const chunks=[];
  recorder.ondataavailable=e=>{ if(e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = async ()=>{
    s.activeRecorders.delete(recorder);
    if(!chunks.length) return;
    const blob = new Blob(chunks,{ type:s.mime });
    const base64 = await blobToBase64(blob);
    const tsIso = new Date().toISOString();
    const item = { sessionId, base64, mime:s.mime, tsIso, label:s.label };
    const { text, error, fatal } = await transcribeWithRetry(item);
    if(text){
      TRANSCRIPTS.push({ tsIso, text, sessionId, label:s.label });
      appendTranscript(tsIso, text, s.label);
      setStatus('Recording…','recording');
    }else if(fatal){
      setStatus(`Transcription error: ${error}`,'error');
    }else{
      PENDING_QUEUE.push(item);
      setStatus('Queued segment (offline or error).','processing');
    }
  };
  s.activeRecorders.add(recorder);
  recorder.start(CHUNK_MS);
  setTimeout(()=>{ try{ recorder.state!=='inactive' && recorder.stop(); }catch{} }, DURATION_MS);
}

// ==================== STOP / CLEANUP ====================
async function stopSession(sessionId){
  const s = SESSIONS.get(sessionId);
  if(!s) return;
  try{
    if(s.tickTimer) clearInterval(s.tickTimer);
    for(const rec of Array.from(s.activeRecorders)){ try{ rec.state!=='inactive' && rec.stop(); }catch{} }
    if(s.stream) s.stream.getTracks().forEach(t=>t.stop());
  }catch{}
  SESSIONS.delete(sessionId);
  const p=document.createElement('p'); p.className='transcription-item';
  const ts=document.createElement('span'); ts.className='ts'; ts.textContent=new Date().toLocaleTimeString();
  const ch=document.createElement('span'); ch.className='chan'; ch.textContent=`${sessionId} stopped`;
  p.append(ts,ch); transcriptionDisplay.appendChild(p);
}

async function stopAll(){
  isRecording = false;
  for (const id of Array.from(SESSIONS.keys())) { await stopSession(id); }
  setStatus('Idle','idle');
  resetTimer();
}

// ==================== OFFLINE RETRY ====================
async function retryPendingQueue(){
  if(!PENDING_QUEUE.length) return;
  const copy=PENDING_QUEUE.splice(0,PENDING_QUEUE.length);
  for(const item of copy){
    const { text, error, fatal } = await transcribeWithRetry(item);
    if(text){
      TRANSCRIPTS.push({ tsIso:item.tsIso, text, sessionId:item.sessionId, label:item.label });
      appendTranscript(item.tsIso, text, item.label);
      setStatus('Recording…','recording');
    }else if(!fatal){
      PENDING_QUEUE.push(item);
    }else{
      setStatus(`Transcription error: ${error}`,'error');
    }
  }
}

// ==================== TRANSCRIBE ====================
async function transcribeWithRetry({ base64, mime }, maxAttempts=3){
  const apiKey = await getApiKey();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
  const payload = {
    contents:[{ parts:[
      { text:"Transcribe this audio to plain text. Respond with only the transcript." },
      { inlineData:{ mimeType:mime, data:base64 } }
    ]}]
  };

  for(let attempt=1; attempt<=maxAttempts; attempt++){
    try{
      const resp = await fetch(endpoint,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      if(!resp.ok){
        const info = await safeJson(resp);
        const status = (info?.error?.status||'').toUpperCase();
        const msg = info?.error?.message || `HTTP ${resp.status}`;
        const fatal = /INVALID_ARGUMENT|PERMISSION_DENIED|UNAUTHENTICATED|FAILED_PRECONDITION/i.test(status) ||
                      resp.status===400 || resp.status===401 || resp.status===403;
        if(fatal) return { text:null, error:msg, fatal:true };
        throw new Error(msg);
      }
      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if(!text) return { text:null, error:'Empty transcription response', fatal:true };
      return { text, error:null, fatal:false };
    }catch(e){
      const transient = /Failed to fetch|network|5\d\d|timeout|temporarily/i.test(String(e?.message||'')); 
      if(attempt>=maxAttempts || !transient) return { text:null, error:e?.message||'Unknown error', fatal:!transient };
      await new Promise(r=>setTimeout(r, 1500*Math.pow(2,attempt-1)));
    }
  }
  return { text:null, error:'Max attempts exceeded', fatal:false };
}

// ==================== RENDER/EXPORT ====================
function appendTranscript(tsIso, text, label){
  const p=document.createElement('p'); p.className='transcription-item';
  const ts=document.createElement('span'); ts.className='ts'; ts.textContent=new Date(tsIso).toLocaleTimeString();
  const ch=document.createElement('span'); ch.className='chan'; ch.textContent=label||'Channel';
  p.append(ts,ch, document.createTextNode(text));
  transcriptionDisplay.appendChild(p);
  transcriptionDisplay.scrollTop = transcriptionDisplay.scrollHeight;
}
copyBtn.addEventListener('click', ()=>navigator.clipboard.writeText(transcriptionDisplay.innerText).catch(()=>{}));
downloadTxtBtn.addEventListener('click', ()=>{
  const blob=new Blob([transcriptionDisplay.innerText],{ type:'text/plain' });
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`transcription-${new Date().toISOString()}.txt`; a.click(); URL.revokeObjectURL(url);
});
downloadJsonBtn.addEventListener('click', ()=>{
  const blob=new Blob([JSON.stringify(TRANSCRIPTS,null,2)],{ type:'application/json' });
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`transcription-${new Date().toISOString()}.json`; a.click(); URL.revokeObjectURL(url);
});

// ==================== UTILS ====================
function blobToBase64(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onloadend=()=>{ try{ resolve(reader.result.split(',')[1]); }catch(e){ reject(e); } };
    reader.onerror=reject; reader.readAsDataURL(blob);
  });
}
async function safeJson(resp){ try{ return await resp.json(); }catch{ return null; } }

// ==================== INIT ====================
listAudibleTabs();
setStatus('Idle','idle');

