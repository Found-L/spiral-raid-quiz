(() => {
  'use strict';
  const localPreview = ['localhost','127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('api')==='local';
  const previewPort = new URLSearchParams(location.search).get('api-port');
  const localApiPort = /^\d{1,5}$/.test(previewPort || '') ? previewPort : '8787';
  const GITHUB_ORIGIN = 'https://found-l.github.io';
  const DOMESTIC_ORIGIN = 'https://www.lysue.com';
  const DOMESTIC_URL = `${DOMESTIC_ORIGIN}/spiral-raid-quiz/`;
  const OVERSEAS_URL = `${GITHUB_ORIGIN}/spiral-raid-quiz/`;
  const OVERSEAS_API = 'https://spiral-raid-quiz-api.foundliny.chatgpt.site';
  const productionApi = location.origin === GITHUB_ORIGIN ? OVERSEAS_API : `${DOMESTIC_ORIGIN}/spiral-raid-quiz`;
  const API = localPreview ? `http://127.0.0.1:${localApiPort}` : productionApi;
  const bank = JSON.parse(document.getElementById('question-bank').textContent);
  const bankQuestions = bank.questions;
  let qs = bankQuestions;
  const SECTIONS = [
    {id:'twins', title:'灼热剑与酷寒剑', short:'双剑'},
    {id:'spirit', title:'超魔灵', short:'超魔灵'},
    {id:'witch', title:'黑风魔女', short:'黑风魔女'},
  ];
  const TYPE_NAMES = {single:'单选题', multiple:'多选题', judge:'判断题', fill:'选择式填空'};
  const KEY = 'spiral-temple-quiz-v1';
  const transferStorageKeys = [':identity', ':profile', ':pending', ':draft', ':last-result', ':local-profiles'];
  const transferTransactionKey = KEY + ':transfer-transaction';
  const $ = (id) => document.getElementById(id);
  function recoverTransferTransaction() {
    try {
      const raw = localStorage.getItem(transferTransactionKey);
      if (!raw) return true;
      const transaction = JSON.parse(raw);
      if (transaction?.schema !== 1 || !transaction.previous ||
          transferStorageKeys.some(suffix => !(suffix in transaction.previous) ||
            (transaction.previous[suffix] !== null && typeof transaction.previous[suffix] !== 'string'))) return false;
      for (const suffix of transferStorageKeys) localStorage.removeItem(KEY + suffix);
      for (const suffix of transferStorageKeys) {
        const value = transaction.previous[suffix];
        if (value !== null) localStorage.setItem(KEY + suffix, value);
      }
      localStorage.removeItem(transferTransactionKey);
      return true;
    } catch { return false; }
  }
  if (!recoverTransferTransaction()) {
    document.body.textContent = '本机资料恢复未完成，请释放浏览器存储空间后刷新页面。原网址的数据不会受影响。';
    return;
  }
  let toastTimer;
  const read = (suffix, fallback=null) => { try { const v=localStorage.getItem(KEY+suffix); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
  const save = (suffix, value) => {
    try { localStorage.setItem(KEY+suffix,JSON.stringify(value)); return true; }
    catch { toast('浏览器无法保存进度，请检查存储设置。'); return false; }
  };
  const remove = (suffix) => { try { localStorage.removeItem(KEY+suffix); } catch {} };
  const hex = (count) => Array.from(crypto.getRandomValues(new Uint8Array(count)), x=>x.toString(16).padStart(2,'0')).join('');
  const makeIdentity = () => ({deviceId:hex(16),secret:hex(32)});
  let identity = read(':identity');
  if (!identity || !/^[a-f0-9]{32}$/.test(identity.deviceId||'') || !/^[a-f0-9]{64}$/.test(identity.secret||'')) { identity=makeIdentity(); save(':identity',identity); }
  let candidate = identity;
  let profile = read(':profile');
  function migrateDraft(saved) {
    let draft = saved || {};
    if (draft.version !== bank.version || !draft.answers || typeof draft.answers !== 'object' || Array.isArray(draft.answers)) {
      const changed = bank.draft_migrations?.[draft.version];
      if (Array.isArray(changed) && draft.answers && typeof draft.answers === 'object' && !Array.isArray(draft.answers)) {
        const changedIds = new Set(changed);
        const previousAnswers = draft.answers;
        const answers = Object.fromEntries(Object.entries(previousAnswers).filter(([id]) => !changedIds.has(id)));
        const cleared = Object.keys(previousAnswers).filter(id => changedIds.has(id)).length;
        draft={...draft,version:bank.version,answers,migrationCleared:cleared};
      } else draft={version:bank.version,index:0,answers:{}};
    }
    return draft;
  }
  let draft = migrateDraft(read(':draft',{}));
  if (draft.migrationCleared) save(':draft',draft);
  let index = Math.max(0,Math.min(qs.length-1,Number(draft.index)||0));
  let result = null;
  let onlyWrong = false;
  let afterProfile = null;
  let view = 'home';
  let historyReturn = 'home';
  let historyCursor = null;
  let historyRequest = 0;
  let historyOwner = null;
  let historyLoadingOwner = null;
  let historyReloadQueued = false;
  let historyFirstPage = null;
  let badgesReturn = 'home';
  let badgesRequest = 0;
  let badgeData = null;
  let badgeOwner = null;
  let selectedBadges = [];
  let badgesDirty = false;
  let uploading = false;
  let connecting = false;
  let rankingRequest = 0;
  let honorRequest = 0;
  let honorDetailRequest = 0;
  let honorDetailBadge = '';
  let honorDetailMode = 'history';
  let honorDetailPage = 1;
  let honorDetailPages = 1;
  let rankingPage = 1;
  let rankingPages = 1;
  let lastUploadError = '';
  let examTimer = null;
  let runningSince = null;
  let timerTicks = 0;
  const escape = (s) => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const badgeTones = new Set(['gold','teal','red','violet']);
  const badgeTone = badge => badgeTones.has(badge.tone) ? badge.tone : 'gold';
  function badgeIcon(badge) {
    return drawBadgeArtwork(badge);
  }
  const badgeChip = badge => `<span class="badge-chip tone-${badgeTone(badge)}" title="${escape(badge.description || '')}"><span class="badge-chip-emblem">${badgeIcon(badge)}</span><span>${escape(badge.name)}</span></span>`;
  const sectionOf = (id) => SECTIONS.find(x=>x.id===id);
  const formatPlayerNumber = (number) => Number.isSafeInteger(number) && number > 0
    ? `#${String(number).padStart(6, '0')}` : '';
  const formatScore = (score) => Number(score).toFixed(score % 1 ? 2 : 0);
  function formatDuration(seconds) {
    if (!Number.isSafeInteger(seconds) || seconds < 0) return '未记录';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    const remainder = seconds % 60;
    return hours ? `${hours}:${String(minutes).padStart(2,'0')}:${String(remainder).padStart(2,'0')}`
      : `${String(minutes).padStart(2,'0')}:${String(remainder).padStart(2,'0')}`;
  }
  function elapsedTime() {
    if (draft.timingUnknown || !Number.isSafeInteger(draft.elapsedMs) || draft.elapsedMs < 0) return null;
    const activeMs = draft.elapsedMs + (runningSince === null ? 0 : Math.max(0, Date.now() - runningSince));
    const seconds = Math.floor(activeMs / 1000);
    return seconds <= 365 * 24 * 3600 ? seconds : null;
  }
  function updateExamTimer() { $('exam-timer').textContent = `用时 ${formatDuration(elapsedTime())}${runningSince === null && !draft.timingUnknown ? '（已暂停）' : ''}`; }
  function checkpointTimer() {
    if (runningSince !== null) {
      const now = Date.now();
      draft.elapsedMs += Math.max(0, now - runningSince);
      runningSince = now;
    }
  }
  function pauseTimer() {
    if (runningSince === null) return;
    checkpointTimer(); runningSince = null;
    storeDraft();
  }
  function resumeTimer() {
    if (view === 'exam' && !document.hidden && !draft.timingUnknown && runningSince === null) runningSince = Date.now();
  }
  function shuffle(items) {
    const values = items.slice();
    for (let i = values.length - 1; i > 0; i--) {
      const max = Math.floor(0x100000000 / (i + 1)) * (i + 1);
      let n; do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= max);
      const j = n % (i + 1);
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }
  function isPermutation(order, ids) {
    return Array.isArray(order) && order.length === ids.length && new Set(order).size === ids.length && order.every(id => ids.includes(id));
  }
  function prepareExam() {
    const ids = bankQuestions.map(q => q.id);
    const previousId = Array.isArray(draft.order) ? draft.order[index] : bankQuestions[index]?.id;
    if (!isPermutation(draft.order, ids)) {
      const canExtend = Array.isArray(draft.order) && draft.order.length < ids.length &&
        new Set(draft.order).size === draft.order.length && draft.order.every(id => ids.includes(id));
      draft.order = canExtend ? [...draft.order, ...shuffle(ids.filter(id => !draft.order.includes(id)))] : shuffle(ids);
      index = previousId && (canExtend || Object.keys(draft.answers).length) ? Math.max(0, draft.order.indexOf(previousId)) : 0;
    }
    if (!draft.optionOrder || typeof draft.optionOrder !== 'object' || Array.isArray(draft.optionOrder)) draft.optionOrder = {};
    for (const question of bankQuestions) {
      const optionIds = question.options.map(option => option.id);
      if (!isPermutation(draft.optionOrder[question.id], optionIds)) draft.optionOrder[question.id] = shuffle(optionIds);
    }
    const byId = new Map(bankQuestions.map(q => [q.id, q]));
    qs = draft.order.map(id => byId.get(id));
    if (!Number.isSafeInteger(draft.elapsedMs) || draft.elapsedMs < 0) {
      // Legacy wall-clock drafts cannot be converted into reliable active time.
      draft.timingUnknown = Boolean(Object.keys(draft.answers).length);
      draft.elapsedMs = 0;
    }
  }
  function scrollToLeaderboard() {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => $('leaderboard').scrollIntoView({behavior:reduceMotion ? 'auto' : 'smooth'}));
  }
  const attemptDate = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const answered = (q) => Array.isArray(draft.answers[q.id]) && draft.answers[q.id].length>0;
  function toast(message) { const t=$('toast'); t.textContent=message; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),3200); }
  function setConnectionUnavailable(unavailable) { $('connection-notice').hidden = !unavailable; }
  function activeIdentity(who=identity) {
    const stored = read(':identity');
    return stored?.deviceId === who.deviceId && stored?.secret === who.secret;
  }
  function storeDraft() {
    if (!activeIdentity()) { toast('本机资料已在其他页面切换，请刷新后继续。'); return; }
    draft.index=index; save(':draft',draft);
  }
  function pendingAttempts() {
    const pending = read(':pending');
    return Array.isArray(pending) ? pending : pending ? [pending] : [];
  }
  function supportedAttempt(attempt) { return attempt.version === bank.version || Object.prototype.hasOwnProperty.call(bank.draft_migrations || {}, attempt.version); }
  function nextPendingAttempt() { return pendingAttempts().find(supportedAttempt); }
  function setView(which) {
    if (view === 'exam' && which !== 'exam') pauseTimer();
    view = which;
    if (examTimer !== null) { clearInterval(examTimer); examTimer = null; }
    if (which === 'exam') {
      resumeTimer(); updateExamTimer();
      examTimer = setInterval(() => {
        updateExamTimer();
        if (runningSince !== null && ++timerTicks % 5 === 0) { checkpointTimer(); storeDraft(); }
      }, 1000);
    }
    if (which === 'home' && location.hash.startsWith('#guide-')) window.history.replaceState(null, '', '#guide');
    for (const section of ['home', 'exam', 'result', 'guide', 'history', 'badges']) {
      $(section + '-view').classList.toggle('hidden', section !== which);
    }
    window.scrollTo({top:0,behavior:'instant'});
  }
  function updateProfileLabel() {
    $('header-profile').textContent = profile ? profile.nickname : '设置我的资料';
    $('exam-profile').textContent = profile ? profile.nickname : '';
    $('delete-profile').classList.toggle('hidden',!profile);
    $('profile-history').hidden = !profile;
    $('profile-badges').hidden = false;
  }
  async function request(path, body) {
    const controller = new AbortController(); const timer=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetch(API+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store'});
      const payload=await response.json().catch(()=>null);
      if(!response.ok) {
        const error=new Error(payload?.error||'服务暂时不可用，请稍后重试。');
        error.status=response.status;
        error.unavailable=response.status>=500 || response.status===429 || (response.status===403 && !payload?.error);
        throw error;
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        const error=new Error('成绩服务返回了无法识别的内容，请稍后重试。');
        error.unavailable=true;
        throw error;
      }
      return payload;
    } catch(e) {
      if(e.name==='AbortError' || e instanceof TypeError) {
        const error=new Error(e.name==='AbortError' ? '连接超时，请稍后重试。' : '无法连接成绩服务，请检查网络后重试。');
        error.unavailable=true;
        throw error;
      }
      throw e;
    }
    finally { clearTimeout(timer); }
  }
  async function saveRemoteProfile(who=identity, data=profile) {
    if(!data) throw new Error('请先设置昵称。');
    const stored = await request('/api/profile', {...who, nickname:data.nickname});
    if (typeof stored.nickname !== 'string' || !Number.isSafeInteger(stored.playerNumber) || stored.playerNumber < 1) {
      const error = new Error('成绩服务返回了无法识别的资料，请稍后重试。');
      error.unavailable = true;
      throw error;
    }
    return stored;
  }
  function rememberProfile(stored) {
    const updated = {nickname:stored.nickname, playerNumber:stored.playerNumber, localOnly:Boolean(stored.localOnly)};
    if (!save(':profile', updated)) return false;
    profile = updated;
    updateProfileLabel();
    return true;
  }
  function showProfile(next=null) {
    candidate=identity; afterProfile=next; $('nickname').value=profile?.nickname||'';
    $('profile-title').textContent = profile ? '我的资料' : '设置你的昵称';
    renderSavedProfiles();
    const number = formatPlayerNumber(profile?.playerNumber);
    $('profile-player-number').textContent = number ? `我的榜单编号 ${number}` : '';
    $('profile-player-number').hidden = !number;
    $('identity-code').value=''; $('profile-error').textContent='';
    if(!$('profile-dialog').open) $('profile-dialog').showModal();
  }
  function closeProfile() { $('profile-dialog').close(); afterProfile=null; candidate=identity; }
  function validNickname(value) {
    const nickname = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
    if (/[\u0000-\u001f\u007f-\u009f]/u.test(nickname) || [...nickname].length < 1 || [...nickname].length > 24) {
      throw new Error('昵称请填写 1 至 24 个字符。');
    }
    return nickname;
  }
  function saveCandidateProfile(updated, switching) {
    if (!save(':identity', candidate)) {
      if (switching) resumeTimer();
      $('profile-error').textContent='浏览器无法保存身份，请检查存储设置。';
      return false;
    }
    if (!save(':profile', updated)) {
      save(':identity', identity);
      if (switching) resumeTimer();
      $('profile-error').textContent='浏览器无法保存昵称，请检查存储设置。';
      return false;
    }
    return true;
  }
  function finishProfile(stored, localOnly=false) {
    const updated = {nickname:stored.nickname, playerNumber:stored.playerNumber, localOnly};
    const switching = candidate.deviceId !== identity.deviceId;
    if (switching) pauseTimer();
    if (!saveCandidateProfile(updated, switching)) return;
    if(switching) { remove(':pending');remove(':draft');remove(':last-result');draft={version:bank.version,index:0,answers:{}};index=0;qs=bankQuestions; }
    identity=candidate; profile=updated; updateProfileLabel();
    if (switching && view === 'exam') setView('home');
    const next=afterProfile; $('profile-dialog').close(); afterProfile=null;
    setConnectionUnavailable(localOnly);
    const number = formatPlayerNumber(profile.playerNumber);
    toast(localOnly ? '昵称已保存在本机，可以开始答题。' : number ? `资料已保存 · 榜单编号 ${number}` : '资料已保存');
    if(next==='start') beginExam();
    else if (next==='badges') openBadges();
    else if (view === 'badges') void loadBadges();
    else if (view === 'history') loadHistory();
    else refreshRanking();
    if (!localOnly && nextPendingAttempt()) uploadPending();
  }
  $('profile-form').addEventListener('submit',async (e)=>{
    e.preventDefault(); const submit=e.submitter || $('profile-form').querySelector('[type="submit"]');
    let data;
    try { data={nickname:validNickname($('nickname').value)}; }
    catch(error) { $('profile-error').textContent=error.message; return; }
    $('profile-error').textContent=''; submit.disabled=true; submit.textContent='保存中…';
    try {
      const stored=await saveRemoteProfile(candidate,data);
      finishProfile(stored);
    } catch(err) {
      const currentIdentity = candidate.deviceId===identity.deviceId && candidate.secret===identity.secret;
      if(err.unavailable && currentIdentity && !profile) finishProfile(data,true);
      else $('profile-error').textContent=err.unavailable && !currentIdentity
        ? '暂时无法连接成绩服务，请连通后再恢复身份。' : err.message;
    }
    finally { submit.disabled=false; submit.textContent='保存资料'; }
  });
  function start() { if(!profile) showProfile('start'); else beginExam(); }
  function beginExam() {
    if (location.hash.startsWith('#guide-')) window.history.replaceState(null, '', location.pathname + location.search);
    prepareExam();
    if (!save(':draft',draft)) return;
    const notice = $('draft-update-notice');
    const notes = [];
    if (draft.migrationCleared) notes.push(`题库已更新，其他作答已保留；${draft.migrationCleared} 道调整过的题目需要重新作答。`);
    if (draft.timingUnknown) notes.push('旧进度无法准确计算答题用时；可继续作答，或选择重新考核以记录用时。');
    notice.hidden = !notes.length;
    notice.textContent = notes.join(' ');
    setView('exam'); updateProfileLabel(); renderQuestion();
  }
  function restartExam() {
    if (view === 'exam' && Object.keys(draft.answers).length) { $('restart-dialog').showModal(); return; }
    performRestart();
  }
  function performRestart() {
    if (!activeIdentity()) { toast('本机资料已在其他页面切换，请刷新后继续。'); return; }
    if ($('restart-dialog').open) $('restart-dialog').close();
    pauseTimer();
    const previousDraft = draft, previousIndex = index, previousQuestions = qs;
    draft = {version:bank.version,index:0,answers:{}}; index = 0; qs = bankQuestions;
    if (!save(':draft',draft)) { draft = previousDraft; index = previousIndex; qs = previousQuestions; resumeTimer(); return; }
    beginExam();
  }
  function questionDiagram(question) {
    const diagram = QUESTION_DIAGRAMS[question.id];
    return diagram ? drawRaidDiagram(...diagram, question.id) : '';
  }
  function selectOption(q, id, checked) {
    if(q.type==='multiple') { const current=new Set(draft.answers[q.id]||[]); if(checked) current.add(id); else current.delete(id); draft.answers[q.id]=Array.from(current); }
    else draft.answers[q.id]=[id];
    storeDraft(); renderQuestion(false);
    const refreshed=$('question-options').querySelector(`input[value="${id}"]`); if(refreshed)refreshed.focus({preventScroll:true});
  }
  function renderQuestion(focus=false) {
    const q=qs[index], section=sectionOf(q.section), done=qs.filter(answered).length;
    $('question-chapter').textContent=`${String(SECTIONS.indexOf(section)+1).padStart(2,'0')} / ${section.title}`;
    $('question-number').textContent=`${String(index+1).padStart(2,'0')} / ${qs.length}`;
    $('question-type').textContent=TYPE_NAMES[q.type]; $('question-role').textContent=q.role;
    $('question-text').textContent=q.question;
    $('question-help').textContent=q.type==='multiple'?'可选多项；全部选对才得分。':'请选择一个答案。';
    const figure = $('question-diagram');
    if (figure.dataset.question !== q.id) {
      figure.innerHTML = questionDiagram(q);
      figure.hidden = !figure.firstElementChild;
      figure.dataset.question = q.id;
      const card = $('question-card');
      card.classList.remove('question-enter');
      requestAnimationFrame(() => card.classList.add('question-enter'));
    }
    $('answered-count').textContent=String(done); $('progress-fill').style.width=`${100*done/qs.length}%`;
    const wrap=$('question-options'); wrap.replaceChildren();
    const optionsById = new Map(q.options.map(option => [option.id, option]));
    draft.optionOrder[q.id].map(id => optionsById.get(id)).forEach((opt,i)=>{
      const label=document.createElement('label'); const selected=(draft.answers[q.id]||[]).includes(opt.id); label.className='option'+(selected?' selected':'');
      const input=document.createElement('input'); input.type=q.type==='multiple'?'checkbox':'radio'; input.name='answer'; input.value=opt.id; input.checked=selected;
      input.addEventListener('change',()=>selectOption(q,opt.id,input.checked));
      const letter=document.createElement('span'); letter.className='option-letter'; letter.textContent=String.fromCharCode(65+i);
      const text=document.createElement('span'); text.className='option-text'; text.textContent=opt.text;
      label.append(input,letter,text); wrap.append(label);
    });
    const prev=document.querySelector('[data-action="previous"]'); prev.disabled=index===0;
    $('next-button-label').textContent=index===qs.length-1?'完成并交卷':'下一题';
    const nav=$('question-nav'); nav.replaceChildren(); qs.forEach((item,i)=>{
      const b=document.createElement('button'); b.type='button'; b.className=`nav-number${answered(item)?' answered':''}${i===index?' current':''}`;
      b.textContent=String(i+1); b.setAttribute('aria-label',`第 ${i+1} 题${answered(item)?'，已答':''}${i===index?'，当前题':''}`);
      if(i===index)b.setAttribute('aria-current','step'); b.addEventListener('click',()=>goto(i)); nav.append(b);
    });
    const sections=$('section-list'); sections.replaceChildren(); SECTIONS.forEach(sec=>{
      const subset=qs.filter(x=>x.section===sec.id), count=subset.filter(answered).length;
      const b=document.createElement('button'); b.type='button'; b.className='section-button'+(sec.id===q.section?' active':'');
      b.innerHTML=`<span>${escape(sec.short)}</span><span>${count} / ${subset.length}</span>`; b.addEventListener('click',()=>goto(qs.findIndex(x=>x.section===sec.id))); sections.append(b);
    });
    if(focus) { $('question-text').setAttribute('tabindex','-1'); $('question-text').focus({preventScroll:true}); }
  }
  function goto(i) { index=Math.max(0,Math.min(qs.length-1,i)); storeDraft(); renderQuestion(true); }
  function isCorrect(q, selected) { return Array.isArray(selected)&&selected.length===q.answer.length&&selected.every(x=>q.answer.includes(x)); }
  function grade(answers) { const correctCount=qs.filter(q=>isCorrect(q,answers[q.id])).length; return {correctCount,totalCount:qs.length,score:Math.round(correctCount*10000/qs.length)/100}; }
  function submitExam() {
    if (!activeIdentity()) { toast('本机资料已在其他页面切换，请刷新后继续。'); return; }
    const missing=qs.filter(q=>!answered(q));
    if(missing.length) { toast(`还有 ${missing.length} 题未作答，已跳到第一道未答题。`); goto(qs.findIndex(q=>!answered(q))); return; }
    const answers=JSON.parse(JSON.stringify(draft.answers));
    const elapsedSeconds=elapsedTime();
    const pending={attemptId:hex(16),version:bank.version,answers,elapsedSeconds,localSubmittedAt:Date.now()};
    if (!save(':pending', [...pendingAttempts(), pending])) return;
    result={...grade(answers),answers,order:draft.order.slice(),elapsedSeconds,attemptId:pending.attemptId}; save(':last-result',result);
    pauseTimer(); remove(':draft');
    draft={version:bank.version,index:0,answers:{}}; index=0; onlyWrong=false; setView('result'); renderResult(); uploadPending();
  }
  async function uploadPending() {
    if (uploading || !nextPendingAttempt() || !profile || !activeIdentity()) return;
    const participant = identity;
    uploading = true;
    $('sync-status').className='sync-status'; $('sync-status').textContent='正在保存成绩到排行榜…'; $('retry-upload').hidden=true;
    try {
      const stored = await saveRemoteProfile(participant);
      if (identity !== participant || !activeIdentity(participant)) return;
      if (stored.playerNumber && (!profile.playerNumber || profile.localOnly)) rememberProfile(stored);
      let attempt = nextPendingAttempt();
      while (attempt) {
        const data = await request('/api/submit', {...participant, attemptId:attempt.attemptId,
          version:attempt.version, answers:attempt.answers, elapsedSeconds:attempt.elapsedSeconds ?? null,
          completedAt:attempt.localSubmittedAt ?? null});
        if (identity !== participant || !activeIdentity(participant)) return;
        if (result?.attemptId === attempt.attemptId && (data.correctCount !== result.correctCount || data.totalCount !== result.totalCount)) {
          throw new Error('成绩核对失败，请刷新后联系团长。');
        }
        if (result?.attemptId === attempt.attemptId && Array.isArray(data.triggeredBadges)) {
          result.triggeredBadges = data.triggeredBadges;
          save(':last-result', result);
          renderResultBadges();
        }
        const remaining = pendingAttempts().filter(item => item.attemptId !== attempt.attemptId);
        if (remaining.length && !save(':pending', remaining)) throw new Error('浏览器无法保存上传进度，请检查存储设置。');
        if (!remaining.length) remove(':pending');
        attempt = nextPendingAttempt();
      }
      setConnectionUnavailable(false);
      lastUploadError = pendingAttempts().length ? '存在无法识别的旧题库成绩，请保留本机数据并联系团长。' : '';
      $('sync-status').textContent=lastUploadError || '成绩已上传，排行榜保留你的最高分。';
      void refreshRanking();
      if (view === 'history') void loadHistory();
      if (view === 'badges' && !badgesDirty) void loadBadges();
    } catch(err) {
      if (identity === participant) {
        lastUploadError = err.message;
        if (err.unavailable) setConnectionUnavailable(true);
        $('sync-status').className='sync-status error'; $('sync-status').textContent=`成绩已保存在本机，但尚未上传：${err.message}`; $('retry-upload').hidden=false;
      }
    } finally {
      uploading = false;
      if (identity !== participant && nextPendingAttempt()) uploadPending();
    }
  }
  async function retryConnection() {
    if (connecting) return;
    if (!profile) { await refreshRanking(); return; }
    if (!activeIdentity()) { toast('本机资料已在其他页面切换，请刷新后继续。'); return; }
    connecting = true;
    const participant = identity;
    const currentProfile = profile;
    try {
      const stored = await saveRemoteProfile(participant, currentProfile);
      if (identity !== participant || profile !== currentProfile || !activeIdentity(participant)) return;
      rememberProfile(stored);
      setConnectionUnavailable(false);
      if (nextPendingAttempt()) await uploadPending();
      else toast('成绩服务已连接。');
      if (view === 'history') loadHistory();
      refreshRanking();
    } catch (error) {
      if (identity === participant) toast(error.message);
    } finally {
      connecting = false;
    }
  }
  function renderResult() {
    if(!result)return;
    $('result-name').textContent=profile?profile.nickname:'';
    $('result-score').textContent=formatScore(result.score);
    $('result-detail').textContent=`答对 ${result.correctCount} / ${result.totalCount} 题 · 用时 ${formatDuration(result.elapsedSeconds)} · 多选题全部选对才计分`;
    renderResultBadges();
    $('review-toggle').textContent=onlyWrong?'查看全部题目':'只看错题';
    const list=$('review-list'); list.replaceChildren();
    const reviewById = new Map(bankQuestions.map(q => [q.id, q]));
    const reviewQuestions = isPermutation(result.order, bankQuestions.map(q => q.id)) ? result.order.map(id => reviewById.get(id)) : bankQuestions;
    reviewQuestions.forEach((q,i)=>{
      const selected=result.answers[q.id]||[], correct=isCorrect(q,selected); if(onlyWrong&&correct)return;
      const chosen=q.options.filter(o=>selected.includes(o.id)).map(o=>o.text).join('；')||'未作答';
      const expected=q.options.filter(o=>q.answer.includes(o.id)).map(o=>o.text).join('；');
      const article=document.createElement('article'); article.className=`review-card ${correct?'correct':'wrong'}`;
      article.innerHTML=`<div class="review-meta">${String(i+1).padStart(2,'0')} / ${escape(sectionOf(q.section).short)} · ${escape(q.role)} · ${correct?'回答正确':'回答有误'}</div><h3>${escape(q.question)}</h3>${questionDiagram(q)}<p>你的选择：${escape(chosen)}</p><p>正确答案：${escape(expected)}</p><p class="explanation">解析：${escape(q.explanation)}</p>`; list.append(article);
    });
    if(!list.children.length){const p=document.createElement('p');p.className='empty-state';p.textContent='这一轮没有错题。';list.append(p);}
  }
  function renderResultBadges() {
    const items = (result?.triggeredBadges || []).filter(badge => badge && typeof badge.name === 'string');
    const container = $('result-honors');
    container.hidden = !items.length;
    container.innerHTML = items.length ? `<span>本轮触发的趣味勋章</span><div>${items.map(badgeChip).join('')}</div><small>可以在“我的勋章”中选择是否展示。</small>` : '';
  }
  function rankingRow(entry) {
    const row=document.createElement('div'); row.className='ranking-row';
    row.dataset.rank = String(entry.rank);
    row.dataset.playerKey = String(entry.playerNumber ?? `rank-${entry.rank}`);
    row.dataset.signature = JSON.stringify(entry);
    const number = formatPlayerNumber(entry.playerNumber);
    const numberLabel = number ? `<small aria-label="榜单编号 ${number}">${number}</small>` : '';
    const shownBadges = Array.isArray(entry.badges) ? entry.badges.filter(badge => badge && typeof badge.name === 'string').slice(0, 3) : [];
    const badgeList = shownBadges.length ? `<div class="rank-badges" aria-label="展示的勋章">${shownBadges.map(badgeChip).join('')}</div>` : '';
    row.innerHTML=`<div class="ranking-player"><span class="rank-number">${String(entry.rank).padStart(2,'0')}</span><div class="player-text"><strong>${escape(entry.nickname)}</strong>${numberLabel}${badgeList}${socialUI.summary(entry)}</div></div><div class="ranking-stats"><span class="ranking-stat"><small>用时</small><b>${formatDuration(entry.elapsedSeconds)}</b></span><span class="ranking-stat"><small>最高分</small><strong class="ranking-score">${Number(entry.score).toFixed(entry.score%1?2:0)}</strong></span></div>`;
    return row;
  }
  async function refreshHonors() {
    const requestId = ++honorRequest;
    const container = $('honor-boards');
    try {
      const data = await request('/api/honors');
      if (requestId !== honorRequest) return;
      const boards = Array.isArray(data.boards) ? data.boards : [];
      const signature = JSON.stringify(boards);
      if (container.dataset.signature === signature) return;
      container.dataset.signature = signature;
      if (!boards.length) { container.innerHTML = '<p class="empty-state">暂无趣味榜数据。</p>'; return; }
      container.innerHTML = boards.map(board => {
        const badge = board.badge;
        const entries = Array.isArray(board.entries) ? board.entries : [];
        const rows = entries.map(entry => `<li><span class="honor-rank">${entry.rank}</span><span class="honor-player"><b>${escape(entry.nickname)}</b><small>${formatPlayerNumber(entry.playerNumber)}</small></span><strong>${board.valueType === 'time' ? formatDuration(entry.value) : `${entry.value} 次`}</strong></li>`).join('');
        const holders = board.holderCount > 1 ? `${board.holderCount} 人并列第一` : '榜首可获得勋章';
        const more = entries.length ? `<button type="button" data-action="honor-show" data-badge="${escape(badge.id)}">查看全部 <span aria-hidden="true">→</span></button>` : '';
        const share = entries.length ? `<button type="button" data-action="share-honor" data-badge="${escape(badge.id)}">分享我的名次</button>` : '';
        return `<article class="honor-card tone-${badgeTone(badge)}"><div class="honor-card-head"><span class="honor-emblem">${badgeIcon(badge)}</span><div><h4>${escape(badge.name)}</h4><p>${escape(badge.description)}</p></div></div><ol class="honor-list">${rows || '<li class="honor-empty">暂无符合条件的成绩</li>'}</ol><div class="honor-holders"><span>${entries.length ? holders : '等待首位上榜玩家'}</span><div class="honor-actions">${more}${share}</div></div></article>`;
      }).join('');
    } catch (error) {
      if (requestId === honorRequest) {
        if (container.querySelector('.honor-card')) toast('趣味榜暂未刷新，请稍后重试。');
        else { delete container.dataset.signature; container.innerHTML = `<p class="empty-state">${escape(error.message)} 点击刷新榜单可重试。</p>`; }
      }
    }
  }
  async function loadHonorDetail(page = 1) {
    const requestId = ++honorDetailRequest;
    const badge = honorDetailBadge;
    const mode = honorDetailMode;
    $('honor-detail-status').textContent = '正在读取名单…';
    $('honor-detail-prev').disabled = true;
    $('honor-detail-next').disabled = true;
    try {
      const data = await request(`/api/honors?badge=${encodeURIComponent(badge)}&mode=${mode}&page=${page}&pageSize=20`);
      if (requestId !== honorDetailRequest || !$('honor-dialog').open || badge !== honorDetailBadge || mode !== honorDetailMode) return;
      if (!data.badge || !Array.isArray(data.entries) || !Number.isSafeInteger(data.page) || !Number.isSafeInteger(data.pages)) throw new TypeError('趣味榜返回的数据无法识别。');
      honorDetailPage = data.page; honorDetailPages = data.pages;
      $('honor-dialog-title').textContent = data.badge.name;
      $('honor-detail-description').textContent = data.badge.description;
      $('honor-detail-status').textContent = mode === 'history'
        ? `共 ${data.total} 人曾达成 · 其中 ${data.holderCount} 人当前持有`
        : `共 ${data.total} 人上榜 · ${data.holderCount} 人并列榜首；同成绩按达到时间先后排列`;
      $('honor-detail-list').innerHTML = data.entries.length ? data.entries.map(entry => {
        const number = formatPlayerNumber(entry.playerNumber);
        const value = entry.recordedOnly ? '纪录已留档' : data.valueType === 'time' ? formatDuration(entry.value) : `${entry.value} 次`;
        const rank = mode === 'current' ? `<span class="honor-detail-rank">${entry.rank}</span>` : '';
        const status = mode === 'history' ? `<small class="${entry.current ? 'is-current' : ''}">${entry.current ? '当前持有' : '曾经获得'}</small>` : '';
        const time = mode === 'history' ? `<span class="honor-achieved">${new Date(entry.achievedAt).toLocaleDateString('zh-CN')} ${entry.recordedOnly ? '记录时间' : '首次达成'}</span>` : '';
        return `<li>${rank}<span class="honor-detail-person"><strong>${escape(entry.nickname)}</strong><small>${escape(number)}</small></span>${status}<span class="honor-detail-value"><strong>${mode === 'history' && !entry.recordedOnly ? '当时 ' : ''}${escape(value)}</strong>${time}</span></li>`;
      }).join('') : '<li class="honor-detail-empty">暂无符合条件的记录。</li>';
      $('honor-detail-page').textContent = `第 ${honorDetailPage} / ${honorDetailPages} 页`;
      $('honor-detail-prev').disabled = honorDetailPage <= 1;
      $('honor-detail-next').disabled = honorDetailPage >= honorDetailPages;
    } catch (error) {
      if (requestId !== honorDetailRequest || !$('honor-dialog').open) return;
      $('honor-detail-status').textContent = `${error.message} 请关闭后重试。`;
    }
  }
  function showHonorDetail(badge) {
    honorDetailBadge = badge;
    honorDetailMode = 'history';
    honorDetailPage = honorDetailPages = 1;
    $('honor-detail-list').replaceChildren();
    $('honor-detail-page').textContent = '';
    $('honor-dialog-title').textContent = '趣味榜';
    $('honor-detail-description').textContent = '';
    $('honor-dialog').querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === honorDetailMode)));
    $('honor-dialog').showModal();
    void loadHonorDetail();
  }
  async function refreshRanking(page = rankingPage) {
    const requestId = ++rankingRequest;
    void refreshHonors();
    const list=$('ranking-list');
    const hadRows = Boolean(list.querySelector('.ranking-row'));
    list.setAttribute('aria-busy', 'true');
    if (!hadRows) list.innerHTML = '<p class="empty-state">正在读取榜单…</p>';
    try {
      const data=await request(`/api/leaderboard?view=latest&page=${page}&pageSize=20`);
      if (requestId !== rankingRequest) return;
      if (!Array.isArray(data.entries)) throw new TypeError('榜单返回的数据无法识别。');
      if (!data.entries.length) {
        list.innerHTML = '<p class="empty-state">还没有成绩，来做第一个上榜的人。</p>';
        $('ranking-pagination').hidden = true;
        return;
      }
      rankingPage = Number.isSafeInteger(data.page) ? data.page : 1;
      rankingPages = Number.isSafeInteger(data.pages) ? data.pages : 1;
      $('ranking-page-status').textContent = `共 ${data.total ?? data.entries.length} 人 · 第 ${rankingPage} / ${rankingPages} 页`;
      $('ranking-previous').disabled = rankingPage <= 1;
      $('ranking-next').disabled = rankingPage >= rankingPages;
      $('ranking-page-input').value = String(rankingPage);
      $('ranking-page-input').max = String(rankingPages);
      $('ranking-pagination').hidden = rankingPages <= 1;
      const existing = new Map([...list.querySelectorAll('.ranking-row')].map(row => [row.dataset.playerKey, row]));
      for (const [index, entry] of data.entries.entries()) {
        const key = String(entry.playerNumber ?? `rank-${entry.rank}`);
        let row = existing.get(key);
        existing.delete(key);
        if (!row) row = rankingRow(entry);
        else if (row.dataset.signature !== JSON.stringify(entry)) {
          const updated = rankingRow(entry);
          row.innerHTML = updated.innerHTML;
          row.dataset.rank = updated.dataset.rank;
          row.dataset.signature = updated.dataset.signature;
        }
        if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
      }
      for (const row of existing.values()) row.remove();
      for (const placeholder of list.querySelectorAll('.empty-state')) placeholder.remove();
    } catch(err){
      if(requestId !== rankingRequest) return;
      if (list.querySelector('.ranking-row')) toast(`${err.message} 榜单保留上次内容。`);
      else { const message=document.createElement('p'); message.className='empty-state'; message.textContent=err.message+' 可以稍后点击刷新。'; list.replaceChildren(message); }
      if(err.unavailable) setConnectionUnavailable(true);
    } finally {
      if (requestId === rankingRequest) list.setAttribute('aria-busy', 'false');
    }
  }
  $('ranking-page-form').addEventListener('submit', event => {
    event.preventDefault();
    const page = Number($('ranking-page-input').value);
    if (Number.isSafeInteger(page) && page >= 1 && page <= rankingPages) void refreshRanking(page);
  });
  function openHistory() {
    if ($('profile-dialog').open) closeProfile();
    if (view !== 'history') historyReturn = view;
    setView('history');
    $('history-title').focus({preventScroll:true});
    loadHistory();
  }
  function closeHistory() {
    ++historyRequest;
    historyLoadingOwner = null;
    historyReloadQueued = false;
    $('history-refresh').disabled = false;
    $('history-more').disabled = false;
    setView(historyReturn);
    if (historyReturn === 'home') $('leaderboard').scrollIntoView();
  }
  function historyRow(entry) {
    const row = document.createElement('li');
    row.className = 'history-entry';
    const time = document.createElement('time');
    if (Number.isSafeInteger(entry.submittedAt)) {
      time.dateTime = new Date(entry.submittedAt).toISOString();
      time.textContent = attemptDate.format(entry.submittedAt);
    } else time.textContent = '本机记录';
    const tag = document.createElement('span');
    tag.className = 'history-entry-tag';
    tag.textContent = entry.currentVersion ? '当前题库' : '旧题库';
    if (entry.pending) tag.textContent = '待上传';
    const heading = document.createElement('div');
    heading.className = 'history-entry-heading';
    heading.append(time, tag);
    const context = document.createElement('small');
    context.textContent = entry.pending && !entry.currentVersion ? '旧题库 · 等待上传'
      : `答对 ${entry.correctCount} / ${entry.totalCount} 题 · 用时 ${formatDuration(entry.elapsedSeconds)}`;
    const details = document.createElement('div');
    details.className = 'history-entry-details';
    details.append(heading, context);
    const score = document.createElement('strong');
    score.textContent = entry.score == null ? '待上传' : `${formatScore(entry.score)} 分`;
    row.append(details, score);
    return row;
  }
  async function loadHistory(append = false) {
    const cursor = append ? historyCursor : null;
    if (append && !cursor) return;
    const who = {...identity};
    const owner = `${who.deviceId}:${who.secret}`;
    if (profile && historyLoadingOwner === owner) {
      if (!append) historyReloadQueued = true;
      return;
    }
    const requestId = ++historyRequest;
    const list = $('history-list');
    const status = $('history-status');
    const more = $('history-more');
    const refresh = $('history-refresh');
    const sameOwner = Boolean(profile) && historyOwner === owner;
    if (!sameOwner) {
      historyCursor = null;
      historyFirstPage = null;
      historyOwner = null;
      historyReloadQueued = false;
      list.replaceChildren();
      $('history-summary').hidden = true;
      more.hidden = true;
    }
    $('history-sign-in').hidden = Boolean(profile);
    $('history-player').hidden = !profile;
    $('history-refresh').hidden = !profile;
    if (!profile) {
      historyLoadingOwner = null;
      historyReloadQueued = false;
      refresh.disabled = false;
      more.disabled = false;
      status.textContent = '保存昵称或恢复原来的身份后，即可查看你的记录。';
      return;
    }
    const number = formatPlayerNumber(profile.playerNumber);
    $('history-player').textContent = [profile.nickname, number].filter(Boolean).join(' · ');
    const hasPrevious = sameOwner && (list.childElementCount > 0 || !$('history-summary').hidden);
    status.textContent = hasPrevious ? '正在刷新记录…' : '正在读取答题记录…';
    if (hasPrevious && append) status.textContent = '正在读取更多记录…';
    historyLoadingOwner = owner;
    refresh.disabled = true;
    more.disabled = true;
    try {
      const data = await request('/api/history', {...who, cursor});
      if (requestId !== historyRequest || view !== 'history') return;
      setConnectionUnavailable(false);
      $('history-count').textContent = `${data.attemptCount} 次`;
      $('history-best').textContent = data.bestScore == null ? '—' : `${formatScore(data.bestScore)} 分`;
      $('history-summary').hidden = false;
      const signature = JSON.stringify(data.entries);
      if (append) {
        list.append(...data.entries.map(historyRow));
        historyCursor = data.nextCursor;
      } else if (!sameOwner || historyFirstPage !== signature) {
        list.replaceChildren(...data.entries.map(historyRow));
        historyFirstPage = signature;
        historyCursor = data.nextCursor;
      }
      historyOwner = owner;
      if (pendingAttempts().length) status.textContent = lastUploadError
        ? `有成绩尚未上传：${lastUploadError}` : '有成绩尚未上传。上传成功后会出现在这里。';
      else status.textContent = data.attemptCount ? '按上传时间从新到旧排列 · 北京时间' : '还没有已提交的成绩。';
      more.hidden = !historyCursor;
    } catch (error) {
      if (requestId !== historyRequest || view !== 'history') return;
      const local = pendingAttempts();
      if (!hasPrevious && !append && error.unavailable && local.length) {
        const rows = local.slice().reverse().map(attempt => {
          if (attempt.version !== bank.version) return {currentVersion:false, pending:true, submittedAt:attempt.localSubmittedAt || null};
          const item = grade(attempt.answers);
          return {...item, currentVersion:true, pending:true, elapsedSeconds:attempt.elapsedSeconds, submittedAt:attempt.localSubmittedAt || null};
        });
        list.replaceChildren(...rows.map(historyRow));
        historyOwner = owner;
        status.textContent = '暂时无法读取线上记录，以下是保存在本机、待上传的成绩。';
      } else status.textContent = hasPrevious ? `${append ? '读取更多失败' : '刷新失败'}，已保留原有记录：${error.message}` : error.message;
      if (error.unavailable) setConnectionUnavailable(true);
    } finally {
      if (requestId === historyRequest) {
        historyLoadingOwner = null;
        refresh.disabled = false;
        more.disabled = false;
        if (historyReloadQueued && view === 'history') {
          historyReloadQueued = false;
          void loadHistory();
        }
      }
    }
  }
  function openBadges() {
    if ($('profile-dialog').open) closeProfile();
    if (view !== 'badges') badgesReturn = view;
    setView('badges');
    $('badges-title').focus({preventScroll:true});
    void loadBadges();
  }
  function closeBadges() {
    ++badgesRequest;
    $('badges-reload').disabled = false;
    $('badges-save').disabled = false;
    setView(badgesReturn);
    if (badgesReturn === 'home') { void refreshRanking(); $('leaderboard').scrollIntoView(); }
    else if (badgesReturn === 'history') void loadHistory();
  }
  function renderBadges() {
    const grid = $('badges-grid');
    const existing = new Map([...grid.children].map(shell => [shell.dataset.badge, shell]));
    const earned = badgeData.badges.filter(badge => badge.earned).length;
    const fastest = Number.isSafeInteger(badgeData.fastestSeconds) ? formatDuration(badgeData.fastestSeconds) : '暂无';
    $('badges-status').textContent = `已获得 ${earned} / ${badgeData.badges.length} 枚 · 已选 ${selectedBadges.length} / ${badgeData.maxShown} 枚 · 全站最快 ${fastest}${badgesDirty ? ' · 更改后请保存' : ''}`;
    $('badges-save').textContent = `保存展示（${selectedBadges.length}/${badgeData.maxShown}）`;
    badgeData.badges.forEach((badge, index) => {
      const selected = selectedBadges.includes(badge.id);
      const shell = existing.get(badge.id) || document.createElement('div');
      existing.delete(badge.id);
      shell.className = 'badge-shell'; shell.dataset.badge = badge.id;
      const button = shell.querySelector('.badge-card') || document.createElement('button');
      button.type = 'button';
      button.dataset.action = 'toggle-badge';
      button.dataset.badge = badge.id;
      const signature = JSON.stringify([badge, selected]);
      if (button.dataset.signature !== signature) {
        button.className = `badge-card tone-${badgeTone(badge)}${badge.earned ? ' earned' : ' locked'}${selected ? ' selected' : ''}`;
        button.disabled = !badge.earned;
        button.setAttribute('aria-pressed', String(selected));
        const state = badge.earned ? (selected ? '✓ 展示中' : '＋ 已获得 · 可展示') : '未获得';
        const stats = badge.stats || {};
        let count = '人数暂不可用';
        if (Number.isSafeInteger(stats.historyCount)) count = `历史 ${stats.historyCount} 人`;
        else if (Number.isSafeInteger(stats.count)) count = `${stats.count} 人获得`;
        button.innerHTML = `<span class="badge-crest" aria-hidden="true">${badgeIcon(badge)}</span><span class="badge-info"><span class="badge-title">${escape(badge.name)}</span><span class="badge-description">${escape(badge.description)}</span><span class="badge-state">${state}</span><span class="badge-people">${escape(count)}</span></span>`;
        button.dataset.signature = signature;
      }
      if (!button.parentElement) shell.append(button);
      let share = shell.querySelector('.badge-share');
      if (badge.earned && !share) {
        share = document.createElement('button'); share.type = 'button'; share.className = 'badge-share';
        share.dataset.action = 'share-badge'; share.dataset.badge = badge.id;
        share.textContent = '分享'; share.setAttribute('aria-label', `分享${badge.name}勋章`);
        shell.append(share);
      } else if (!badge.earned && share) share.remove();
      if (grid.children[index] !== shell) grid.insertBefore(shell, grid.children[index] || null);
    });
    for (const button of existing.values()) button.remove();
  }
  async function loadBadges() {
    const requestId = ++badgesRequest;
    const sameOwner = profile && badgeOwner && badgeOwner.deviceId === identity.deviceId && badgeOwner.secret === identity.secret;
    if (!sameOwner) {
      badgeData = null;
      badgeOwner = null;
      selectedBadges = [];
      badgesDirty = false;
      $('badges-grid').replaceChildren();
      $('badges-save').hidden = true;
    }
    $('badges-reload').hidden = !profile;
    $('badges-profile').hidden = Boolean(profile);
    if (!profile) { $('badges-reload').disabled = false; $('badges-status').textContent = '设置昵称或恢复原来的身份后，即可查看和展示勋章。'; return; }
    $('badges-reload').disabled = true;
    $('badges-save').disabled = true;
    $('badges-status').textContent = badgeData ? '正在刷新勋章，当前选择会保留…' : '正在读取勋章…';
    const who = {...identity};
    try {
      const data = await request('/api/badges', who);
      if (requestId !== badgesRequest || view !== 'badges' || !activeIdentity(who)) return;
      if (!Array.isArray(data.badges) || !Array.isArray(data.selected) || !Number.isSafeInteger(data.maxShown)) {
        throw new TypeError('暂时无法读取勋章，请稍后刷新。');
      }
      const wanted = badgesDirty ? selectedBadges.slice() : data.selected.slice();
      const earnedIds = new Set(data.badges.filter(badge => badge.earned).map(badge => badge.id));
      selectedBadges = wanted.filter(id => earnedIds.has(id)).slice(0, data.maxShown);
      const removed = wanted.length !== selectedBadges.length;
      badgeData = data;
      badgeOwner = who;
      badgesDirty = badgesDirty || JSON.stringify(selectedBadges) !== JSON.stringify(data.selected);
      $('badges-save').hidden = false;
      renderBadges();
      if (removed) toast('部分勋章的获得状态已变化，已从待展示选择中移除。');
    } catch (error) {
      if (requestId !== badgesRequest || view !== 'badges' || !activeIdentity(who)) return;
      const message = profile.localOnly && error.status === 403 ? '资料和成绩还没有上传，连接成功后即可查看勋章。' : error.message;
      $('badges-status').textContent = badgeData ? `刷新失败，仍显示上次内容。${message}` : message;
      if (error.unavailable) setConnectionUnavailable(true);
    } finally {
      if (requestId === badgesRequest) {
        $('badges-reload').disabled = false;
        $('badges-save').disabled = false;
      }
    }
  }
  function toggleBadge(id) {
    if (!badgeData?.badges.some(badge => badge.id === id && badge.earned)) return;
    if (selectedBadges.includes(id)) selectedBadges = selectedBadges.filter(item => item !== id);
    else if (selectedBadges.length < badgeData.maxShown) selectedBadges.push(id);
    else { toast(`最多展示 ${badgeData.maxShown} 枚勋章。`); return; }
    badgesDirty = true;
    renderBadges();
    const button = [...$('badges-grid').children].find(item => item.dataset.badge === id);
    if (button) { button.classList.add('badge-change'); button.focus({preventScroll:true}); }
  }
  async function saveBadges() {
    if (!badgeData || !activeIdentity()) return;
    const requestId = ++badgesRequest;
    const who = {...identity};
    const submitted = selectedBadges.slice();
    $('badges-save').disabled = true;
    $('badges-reload').disabled = true;
    try {
      const data = await request('/api/badges/select', {...who, selected:submitted});
      if (requestId !== badgesRequest || view !== 'badges' || !activeIdentity(who)) return;
      badgeData = data;
      badgeOwner = who;
      const editedDuringSave = JSON.stringify(selectedBadges) !== JSON.stringify(submitted);
      const earnedIds = new Set(data.badges.filter(badge => badge.earned).map(badge => badge.id));
      selectedBadges = (editedDuringSave ? selectedBadges : data.selected).filter(id => earnedIds.has(id)).slice(0, data.maxShown);
      badgesDirty = JSON.stringify(selectedBadges) !== JSON.stringify(data.selected);
      renderBadges();
      void refreshRanking();
      toast(badgesDirty ? '已保存提交时的选择；之后的改动请再次保存。' : '勋章展示已保存。');
    } catch (error) {
      if (requestId !== badgesRequest || view !== 'badges') return;
      $('badges-status').textContent = error.message;
      if (error.unavailable) setConnectionUnavailable(true);
    } finally {
      if (requestId === badgesRequest) { $('badges-save').disabled = false; $('badges-reload').disabled = false; }
    }
  }
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)') || {matches:false};
  function applySequence(container, index) {
    const scene = RAID_SEQUENCES[container.dataset.sequence];
    if (!scene) return;
    const next = (index + scene.steps.length) % scene.steps.length;
    const step = scene.steps[next];
    const resetting = next === 0 && Number(container.dataset.step) === scene.steps.length - 1;
    if (resetting) container.classList.add('sequence-resetting');
    container.dataset.step = String(next);
    for (const actor of scene.actors) {
      const node = container.querySelector(`[data-actor="${actor.id}"]`);
      const [x, y] = step.positions?.[actor.id] || [actor.x, actor.y];
      if (node) {
        node.style.transform = `translate(${x}px, ${y}px)`;
        node.classList.toggle('scene-hidden', (step.hidden || []).includes(actor.id));
      }
    }
    container.querySelectorAll('[data-cue]').forEach(node => {
      node.classList.toggle('active', (step.cues || []).includes(node.dataset.cue));
    });
    container.querySelector('[data-step-text]').textContent = step.text;
    container.querySelector('[data-step-count]').textContent = `${String(next + 1).padStart(2,'0')} / ${String(scene.steps.length).padStart(2,'0')}`;
    if (resetting) requestAnimationFrame(() => requestAnimationFrame(() => container.classList.remove('sequence-resetting')));
  }
  function initializeSequences(root) {
    root.querySelectorAll('[data-sequence]').forEach(container => {
      if (reduceMotion.matches) container.classList.add('motion-paused');
      const pause = container.querySelector('[data-action="toggle-diagram-motion"]');
      if (pause && container.classList.contains('motion-paused')) {
        pause.textContent = '播放'; pause.setAttribute('aria-pressed', 'true');
      }
      applySequence(container, Number(container.dataset.step) || 0);
    });
  }
  function stepSequence(target, delta) {
    const container = target.closest('[data-sequence]');
    if (!container) return;
    container.classList.add('motion-paused');
    const pause = container.querySelector('[data-action="toggle-diagram-motion"]');
    if (pause) { pause.textContent = '播放'; pause.setAttribute('aria-pressed', 'true'); }
    applySequence(container, Number(container.dataset.step) + delta);
  }
  if (document.querySelectorAll) setInterval(() => {
    if (document.hidden || reduceMotion.matches) return;
    const dialog = $('diagram-dialog');
    document.querySelectorAll('[data-sequence]').forEach(container => {
      if (container.classList.contains('motion-paused') || (dialog.open && !dialog.contains(container))) return;
      const rect = container.getBoundingClientRect();
      if (rect.width && rect.bottom > 0 && rect.top < innerHeight) applySequence(container, Number(container.dataset.step) + 1);
    });
  }, 5000);
  function openDiagram(target) {
    const figure = target.closest('.raid-diagram');
    if (!figure) return;
    const copy = figure.cloneNode(true);
    copy.querySelector('[data-action="zoom-diagram"]')?.remove();
    $('diagram-dialog-content').replaceChildren(copy);
    $('diagram-dialog').showModal();
    if (copy.dataset.sequence) applySequence(copy, Number(copy.dataset.step) || 0);
  }
  function toggleDiagramMotion(target) {
    const figure = target.closest('.raid-diagram, .chapter-art');
    if (!figure) return;
    const paused = figure.classList.toggle('motion-paused');
    target.textContent = paused ? '播放' : '暂停';
    target.setAttribute('aria-pressed', String(paused));
    if (paused && figure.dataset.sequence) applySequence(figure, Number(figure.dataset.step) || 0);
  }
  function setCurrentGuideStage(index) {
    $('guide-timeline').querySelectorAll('[data-stage]').forEach(button => {
      if (Number(button.dataset.stage) === index) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
  }
  let stageScrollScheduled = false;
  function updateCurrentGuideStage() {
    stageScrollScheduled = false;
    if (view !== 'guide') return;
    const stages = [...$('guide-stages').children];
    if (!stages.length) return;
    const active = stages.reduce((best, stage, i) => stage.getBoundingClientRect().top <= 150 ? i : best, 0);
    setCurrentGuideStage(active);
  }
  window.addEventListener('scroll', () => {
    if (view !== 'guide' || stageScrollScheduled) return;
    stageScrollScheduled = true;
    requestAnimationFrame(updateCurrentGuideStage);
  }, {passive:true});
  function renderGuide(chapterId) {
    const guide = RAID_GUIDE[chapterId];
    $('guide-title').textContent = guide.title;
    $('guide-intro').textContent = guide.intro;
    const chapterNotes = {twins:'球 · 花 · 治疗',spirit:'业火 · 隔离 · 染灯',witch:'冲锋 · 炸弹 · 蜘蛛'};
    $('guide-chapters').innerHTML = SECTIONS.map((chapter, i) => {
      const active = chapter.id === chapterId ? ' aria-current="page"' : '';
      return `<a href="#guide-${chapter.id}"${active}><span class="chapter-number">${String(i + 1).padStart(2,'0')}</span><span class="chapter-copy"><strong>${escape(chapter.short)}</strong><small>${chapterNotes[chapter.id]}</small></span></a>`;
    }).join('');
    $('guide-timeline').innerHTML = guide.stages.map((stage, i) => `<button type="button" data-action="guide-stage" data-stage="${i}"${i === 0 ? ' aria-current="step"' : ''}><span class="timeline-number">${String(i + 1).padStart(2,'0')}</span><span>${escape(stage.navLabel || stage.timing)}</span></button>`).join('');
    $('guide-stages').innerHTML = guide.stages.map((stage, i) => `<article class="guide-stage" id="guide-stage-${i}">
      <p class="eyebrow">${escape(stage.timing)}</p>
      <h2 tabindex="-1">${escape(stage.title)}</h2>
      <div class="stage-layout">
        ${drawRaidDiagram(stage.diagram, stage.caption)}
        <dl class="stage-roles">${stage.roles.map(([role, action]) => `<div><dt>${escape(role)}</dt><dd>${escape(action)}</dd></div>`).join('')}</dl>
      </div>
      ${stage.check ? `<p class="stage-check">${escape(stage.check)}</p>` : ''}
    </article>`).join('');
    initializeSequences($('guide-stages'));
    setView('guide');
    $('guide-title').focus({preventScroll:true});
  }
  function readGuideHash() {
    const chapter = /^#guide-(twins|spirit|witch)$/.exec(location.hash)?.[1];
    if (chapter) renderGuide(chapter);
    else if (view === 'guide') {
      setView('home');
      if (location.hash === '#guide') $('guide').scrollIntoView();
    }
  }
  // Transfer only between the two known pages. The identity never goes in a URL.
  let transferWindow = null;
  let incomingTransfer = null;
  let transferSender = null;
  let transferSenderOrigin = null;
  const transferHash = '#import-github';
  const transferPrefix = 'spiral-quiz-transfer-v1';
  const transferLimit = 5 * 1024 * 1024;
  const localProfilesKey = ':local-profiles';
  function currentSnapshot() {
    return {schema:1, identity, profile, pending:pendingAttempts(), draft,
      lastResult:read(':last-result')};
  }
  function validateSnapshot(value) {
    if (!value || typeof value !== 'object' || value.schema !== 1 || !value.identity ||
        !/^[a-f0-9]{32}$/.test(value.identity.deviceId || '') ||
        !/^[a-f0-9]{64}$/.test(value.identity.secret || '') ||
        (value.profile !== null && (!value.profile || typeof value.profile.nickname !== 'string')) ||
        !Array.isArray(value.pending) || !value.draft || typeof value.draft !== 'object' ||
        !value.draft.answers || typeof value.draft.answers !== 'object' || Array.isArray(value.draft.answers)) {
      throw new Error('迁移资料格式不正确，请在原网址重新发起转移。');
    }
    if (value.profile) validNickname(value.profile.nickname);
    for (const item of value.pending) {
      if (!item || !/^[a-f0-9]{32}$/.test(item.attemptId || '') ||
          typeof item.version !== 'string' || !item.answers || typeof item.answers !== 'object' || Array.isArray(item.answers)) {
        throw new Error('待上传成绩格式不正确，请保留原页面并联系团长。');
      }
    }
    if (JSON.stringify(value).length > transferLimit) throw new Error('迁移资料过大，请先上传部分成绩。');
    return value;
  }
  function hasLocalWork(value) {
    return Boolean(value.profile || value.pending.length || Object.keys(value.draft.answers || {}).length || value.lastResult);
  }
  function sameIdentity(a, b) {
    return a.deviceId === b.deviceId && a.secret === b.secret;
  }
  function savedProfiles() {
    const stored = read(localProfilesKey, []);
    return Array.isArray(stored) ? stored : [];
  }
  function renderSavedProfiles() {
    const entries = savedProfiles();
    const list = $('saved-profiles-list'); list.replaceChildren();
    $('saved-profiles').hidden = !entries.length;
    for (const entry of entries) {
      if (!entry?.id || !entry.snapshot?.identity) continue;
      const row = document.createElement('div'); row.className = 'saved-profile-row';
      const title = document.createElement('span');
      title.textContent = `${entry.snapshot.profile?.nickname || '未命名'} · ${entry.snapshot.pending?.length || 0} 条待上传`;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-ghost compact';
      button.textContent = '切换'; button.dataset.action = 'restore-local-profile'; button.dataset.archiveId = entry.id;
      row.append(title, button); list.append(row);
    }
  }
  function persistSnapshot(next, archives) {
    const changes = {
      ':identity':next.identity, ':profile':next.profile, ':pending':next.pending,
      ':draft':migrateDraft(next.draft), ':last-result':next.lastResult || null,
      [localProfilesKey]:archives,
    };
    const original = {};
    try {
      for (const suffix of transferStorageKeys) original[suffix] = localStorage.getItem(KEY + suffix);
      // A durable rollback record makes interrupted multi-key updates recoverable.
      localStorage.setItem(transferTransactionKey, JSON.stringify({schema:1, previous:original}));
      localStorage.setItem(KEY + localProfilesKey, JSON.stringify(archives));
      for (const [suffix, value] of Object.entries(changes)) {
        if (suffix === localProfilesKey) continue;
        if (value === null) localStorage.removeItem(KEY + suffix);
        else localStorage.setItem(KEY + suffix, JSON.stringify(value));
      }
      localStorage.removeItem(transferTransactionKey);
    } catch (error) {
      recoverTransferTransaction();
      throw new Error('浏览器无法保存转移资料；原网址的数据仍然保留。请检查存储空间后重试。', {cause:error});
    }
    identity = next.identity; candidate = identity; profile = next.profile;
    draft = migrateDraft(next.draft); index = Math.max(0,Math.min(qs.length-1,Number(draft.index)||0));
    result = null; onlyWrong = false;
    // Notify other updated tabs only after all data has been committed.
    try { localStorage.setItem(KEY + ':transfer-revision', hex(8)); }
    catch { /* The saved transfer is intact; this notification is best-effort. */ }
    updateProfileLabel();
  }
  function mergeForTransfer(imported) {
    const current = currentSnapshot();
    const archives = savedProfiles();
    if (!sameIdentity(current.identity, imported.identity)) {
      if (hasLocalWork(current)) archives.push({id:hex(8), snapshot:current});
      return {next:imported, archives};
    }
    const pending = current.pending.slice();
    for (const attempt of imported.pending) {
      const existing = pending.find(item => item.attemptId === attempt.attemptId);
      if (existing && (existing.version !== attempt.version || JSON.stringify(existing.answers) !== JSON.stringify(attempt.answers))) {
        throw new Error('两处有相同编号但内容不同的成绩，未执行转移。请保留原页面并联系团长。');
      }
      if (!existing) pending.push(attempt);
    }
    const currentHasDraft = Object.keys(current.draft.answers || {}).length > 0;
    const incomingHasDraft = Object.keys(imported.draft.answers || {}).length > 0;
    if (currentHasDraft && incomingHasDraft && JSON.stringify(current.draft) !== JSON.stringify(imported.draft)) {
      archives.push({id:hex(8), snapshot:current});
    }
    return {next:{...imported, pending, draft:incomingHasDraft ? imported.draft : current.draft,
      lastResult:imported.lastResult || current.lastResult}, archives};
  }
  function presentTransfer(value, sender = null, senderOrigin = null) {
    try {
      const data = validateSnapshot(value);
      incomingTransfer = data; transferSender = sender; transferSenderOrigin = senderOrigin;
      const differs = hasLocalWork(currentSnapshot()) && !sameIdentity(identity, data.identity);
      $('transfer-description').textContent = `即将转移“${data.profile?.nickname || '未设置昵称'}”的资料和 ${data.pending.length} 条待上传成绩。`;
      $('transfer-detail').textContent = differs
        ? '此网址已有其他本机资料，将先保留；可在修改资料中切换。请先关闭此网址的其他标签页。原网址的数据会保留。'
        : '原网址的数据会保留。若两处都有不同的未交卷进度，会保留另一份供切换。请先关闭此网址的其他标签页。';
      $('transfer-error').textContent = ''; $('transfer-confirm').hidden = false;
      $('transfer-confirm').textContent = data.profile ? '确认转移并同步' : '确认转移';
      if ($('profile-dialog').open) closeProfile();
      if (!$('transfer-dialog').open) $('transfer-dialog').showModal();
    } catch (error) {
      incomingTransfer = null; transferSender = null; transferSenderOrigin = null; $('transfer-confirm').hidden = true;
      $('transfer-error').textContent = error.message;
      if ($('profile-dialog').open) closeProfile();
      if (!$('transfer-dialog').open) $('transfer-dialog').showModal();
    }
  }
  function closeTransfer() {
    $('transfer-dialog').close(); incomingTransfer = null; transferSender = null; transferSenderOrigin = null;
    if (location.hash === transferHash) window.history.replaceState(null, '', location.pathname + location.search);
  }
  function syncTransferredProfile() {
    setView('home');
    if (!profile) return;
    openHistory();
    void retryConnection().then(() => { if (view === 'history') void loadHistory(); })
      .catch(error => toast(error.message));
  }
  function confirmTransfer() {
    if (!incomingTransfer) return;
    pauseTimer();
    try {
      const {next, archives} = mergeForTransfer(incomingTransfer);
      persistSnapshot(next, archives);
      if (transferSender && transferSenderOrigin) transferSender.postMessage({type:transferPrefix + ':done'}, transferSenderOrigin);
      closeTransfer(); syncTransferredProfile();
      toast(profile ? '资料已转移，正在同步成绩。' : '本机进度已转移，设置昵称后可同步成绩。');
    } catch (error) { resumeTimer(); $('transfer-error').textContent = error.message; }
  }
  function restoreLocalProfile(id) {
    const archives = savedProfiles();
    const chosen = archives.find(entry => entry.id === id);
    if (!chosen || !confirm('切换到这份本机资料？当前资料和待上传成绩也会保留。')) return;
    pauseTimer();
    try {
      const current = currentSnapshot();
      const remaining = archives.filter(entry => entry.id !== id);
      if (hasLocalWork(current)) remaining.push({id:hex(8), snapshot:current});
      // Archived local work may have no nickname yet; retain it without inventing one.
      const next = chosen.snapshot;
      if (!next.identity || !next.draft || !Array.isArray(next.pending)) throw new Error('本机资料格式不正确。');
      persistSnapshot(next, remaining);
      closeProfile();
      if (profile) syncTransferredProfile(); else { setView('home'); toast('已切换到未设置昵称的本机资料。'); }
    } catch (error) { resumeTimer(); $('profile-error').textContent = error.message; }
  }
  function otherOrigin() {
    if (location.origin === GITHUB_ORIGIN) return DOMESTIC_ORIGIN;
    if (location.origin === DOMESTIC_ORIGIN) return GITHUB_ORIGIN;
    return null;
  }
  function startTransfer(site = 'domestic') {
    if (!['domestic', 'overseas'].includes(site)) return;
    const url = site === 'domestic' ? DOMESTIC_URL : OVERSEAS_URL;
    if (location.origin === new URL(url).origin) return;
    $('site-switch').open = false;
    if (!otherOrigin() || !hasLocalWork(currentSnapshot())) { location.assign(url); return; }
    transferWindow = window.open(url + transferHash, '_blank');
    if (!transferWindow) toast('浏览器阻止了新页面，请允许弹窗或下载迁移文件。');
  }
  function downloadTransfer() {
    $('site-switch').open = false;
    if (!hasLocalWork(currentSnapshot())) { toast('当前没有需要备份的本机资料。'); return; }
    $('backup-dialog').showModal();
  }
  function confirmDownloadTransfer() {
    try {
      const data = validateSnapshot(currentSnapshot());
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], {type:'application/json'}));
      const link = document.createElement('a'); link.href = url; link.download = '螺旋寺院-迁移资料.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('backup-dialog').close();
    } catch (error) { toast(error.message); }
  }
  async function readTransferFile(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > transferLimit) throw new Error('迁移文件过大。');
      presentTransfer(JSON.parse(await file.text()));
    } catch (error) {
      $('profile-error').textContent = error instanceof SyntaxError
        ? '迁移文件格式不正确，请选择原网址下载的文件。' : (error.message || '无法读取迁移文件。');
    }
  }
  window.addEventListener('message', event => {
    const peer = otherOrigin();
    if (!peer || event.origin !== peer) return;
    if (transferWindow && event.source === transferWindow && event.data?.type === transferPrefix + ':ready') {
      try { transferWindow.postMessage({type:transferPrefix + ':data', snapshot:validateSnapshot(currentSnapshot())}, peer); }
      catch (error) { toast(error.message); }
    } else if (location.hash === transferHash && window.opener && event.source === window.opener &&
               event.data?.type === transferPrefix + ':data') {
      presentTransfer(event.data.snapshot, event.source, event.origin);
    } else if (transferWindow && event.source === transferWindow && event.data?.type === transferPrefix + ':done') {
      toast('资料已转移，请在新网址查看同步结果。');
    }
  });
  function initializeTransfer() {
    const peer = otherOrigin();
    let current = '';
    if (location.origin === DOMESTIC_ORIGIN) current = 'domestic';
    if (location.origin === GITHUB_ORIGIN) current = 'overseas';
    const label = {domestic:'国内站', overseas:'国外站'}[current] || '站点';
    $('site-current').textContent = label;
    const summary = $('site-switch').querySelector('summary');
    if (summary) summary.setAttribute('aria-label', current ? `当前${label}，切换访问站点` : '选择访问站点');
    for (const name of ['domestic', 'overseas']) {
      const button = $('site-' + name);
      button.disabled = current === name;
      const tag = button.querySelector('.site-current-tag');
      if (tag) tag.hidden = current !== name;
    }
    $('file-import').hidden = !peer;
    $('transfer-file').addEventListener('change', readTransferFile);
    if (!peer || location.hash !== transferHash) return;
    $('transfer-description').textContent = '正在读取原网址的资料…';
    $('transfer-confirm').hidden = true;
    $('transfer-dialog').showModal();
    if (!window.opener) {
      $('transfer-error').textContent = '请回到原网址，在站点菜单中重新切换；也可使用备份文件导入。';
      return;
    }
    window.opener.postMessage({type:transferPrefix + ':ready'}, peer);
    setTimeout(() => {
      if (!incomingTransfer && $('transfer-dialog').open) $('transfer-error').textContent = '暂未收到资料，请回到原页面重试，或下载迁移文件后导入。';
    }, 10000);
  }
  function identityCode(who=identity) { return `${who.deviceId}.${who.secret}`; }
  async function copyIdentity() {
    const code=identityCode();
    try { await navigator.clipboard.writeText(code); toast('身份码已复制，请妥善保管。'); }
    catch { $('identity-code').value=code; $('identity-code').select(); toast('请手动复制下方身份码。'); }
  }
  function importIdentity() {
    const code=$('identity-code').value.trim(); const m=/^([a-f0-9]{32})\.([a-f0-9]{64})$/i.exec(code);
    if(!m){$('profile-error').textContent='身份码格式不正确。';return;}
    if(m[1].toLowerCase()!==identity.deviceId && (Object.keys(draft.answers).length || pendingAttempts().length) && !confirm('恢复其他身份会删除当前浏览器尚未上传的成绩和未交卷的答题进度，确定继续吗？'))return;
    candidate={deviceId:m[1].toLowerCase(),secret:m[2].toLowerCase()}; $('profile-error').textContent='身份码已读取，请填写昵称并保存。';
    if (candidate.deviceId !== identity.deviceId) $('profile-player-number').hidden = true;
  }
  async function deleteProfile() {
    if(!profile || !confirm('确认删除你的线上资料、成绩和相关互动？删除后无法恢复。'))return;
    try {
      await request('/api/delete-profile',identity);
      if(view==='exam') setView('home');
      remove(':profile'); remove(':pending'); remove(':last-result'); remove(':draft');
      draft={version:bank.version,index:0,answers:{}}; index=0; qs=bankQuestions;
      profile=null; identity=makeIdentity(); candidate=identity; save(':identity',identity);
      updateProfileLabel(); closeProfile();
      await refreshRanking();
      if(view==='history') await loadHistory();
      if(view==='badges') await loadBadges();
      toast('线上资料与成绩已删除。');
    }
    catch(err){$('profile-error').textContent=err.message;}
  }
  const socialUI = typeof createSocialUI === 'function'
    ? createSocialUI({request, getProfile:() => profile, getIdentity:() => identity, activeIdentity, showProfile, refreshRanking, escape, formatPlayerNumber})
    : {summary:() => ''};
  const shareUI = typeof createShareUI === 'function'
    ? createShareUI({request, getProfile:() => profile, getIdentity:() => identity, activeIdentity, showProfile, toast, formatDuration, formatPlayerNumber})
    : {start:() => {}, openFromUrl:() => {}};
  const featureActions = new Map([
    ['open-badges', () => openBadges()],
    ['close-badges', () => closeBadges()],
    ['badges-profile', () => showProfile('badges')],
    ['reload-badges', () => { void loadBadges(); }],
    ['toggle-badge', target => toggleBadge(target.dataset.badge)],
    ['save-badges', () => { void saveBadges(); }],
    ['share-badge', target => { void shareUI.start('badge', target.dataset.badge); }],
    ['share-ranking', () => { void shareUI.start('ranking'); }],
    ['share-honor', target => { void shareUI.start('honor', target.dataset.badge); }],
    ['honor-show', target => showHonorDetail(target.dataset.badge)],
    ['close-honor-detail', () => { ++honorDetailRequest; $('honor-dialog').close(); }],
    ['honor-mode', target => {
      const mode = target.dataset.mode;
      if (!['history', 'current'].includes(mode) || mode === honorDetailMode) return;
      honorDetailMode = mode;
      $('honor-dialog').querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
      $('honor-detail-list').replaceChildren();
      void loadHonorDetail();
    }],
    ['honor-prev', () => { if (honorDetailPage > 1) void loadHonorDetail(honorDetailPage - 1); }],
    ['honor-next', () => { if (honorDetailPage < honorDetailPages) void loadHonorDetail(honorDetailPage + 1); }],
    ['zoom-diagram', target => openDiagram(target)],
    ['toggle-diagram-motion', target => toggleDiagramMotion(target)],
    ['sequence-prev', target => stepSequence(target, -1)],
    ['sequence-next', target => stepSequence(target, 1)],
    ['close-diagram', () => $('diagram-dialog').close()],
  ]);
  let navigationOpen = false;
  function setNavigation(open) {
    navigationOpen = open;
    $('main-nav').classList.toggle('is-open', open);
    $('nav-toggle').setAttribute('aria-expanded', String(open));
    $('nav-toggle').setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
  }
  document.addEventListener('click',(e)=>{
    if (!e.target.closest('#site-switch')) $('site-switch').open = false;
    if (e.target.closest('#main-nav') || (navigationOpen && !e.target.closest('#nav-toggle'))) setNavigation(false);
    if (view !== 'home' && e.target.closest('a[href="#guide"], a[href="#home"]')) setView('home');
    const target=e.target.closest('[data-action]'); if(!target)return;
    const featureAction = featureActions.get(target.dataset.action);
    if (featureAction) { featureAction(target); return; }
    switch(target.dataset.action){
      case 'start': start();break;
      case 'profile': showProfile();break;
      case 'close-profile': closeProfile();break;
      case 'copy-identity': copyIdentity();break;
      case 'import-identity': importIdentity();break;
      case 'transfer-domestic': startTransfer('domestic');break;
      case 'switch-site': startTransfer(target.dataset.site);break;
      case 'toggle-navigation': $('site-switch').open = false; setNavigation(!navigationOpen);break;
      case 'download-transfer': downloadTransfer();break;
      case 'confirm-download-transfer': confirmDownloadTransfer();break;
      case 'close-backup': $('backup-dialog').close();break;
      case 'confirm-transfer': confirmTransfer();break;
      case 'close-transfer': closeTransfer();break;
      case 'restore-local-profile': restoreLocalProfile(target.dataset.archiveId);break;
      case 'delete-profile': deleteProfile();break;
      case 'previous': goto(index-1);break;
      case 'next': if(index===qs.length-1)submitExam();else goto(index+1);break;
      case 'submit': submitExam();break;
      case 'leave-exam': setView('home');refreshRanking();break;
      case 'show-leaderboard': setView('home');void refreshRanking();scrollToLeaderboard();break;
      case 'refresh-ranking': refreshRanking();break;
      case 'ranking-previous': if (rankingPage > 1) void refreshRanking(rankingPage - 1);break;
      case 'ranking-next': if (rankingPage < rankingPages) void refreshRanking(rankingPage + 1);break;
      case 'retry-upload': uploadPending();break;
      case 'retry-connection': retryConnection();break;
      case 'restart': restartExam();break;
      case 'confirm-restart': performRestart();break;
      case 'cancel-restart': $('restart-dialog').close();break;
      case 'results-home': setView('home');void refreshRanking();scrollToLeaderboard();break;
      case 'toggle-review': onlyWrong=!onlyWrong;renderResult();break;
      case 'open-history': openHistory();break;
      case 'close-history': closeHistory();break;
      case 'refresh-history': loadHistory();uploadPending();break;
      case 'history-more': loadHistory(true);break;
      case 'history-profile': showProfile();break;
      case 'guide-stage': {
        const stage = $('guide-stage-' + target.dataset.stage);
        setCurrentGuideStage(Number(target.dataset.stage));
        stage.scrollIntoView({block:'start'});
        stage.querySelector('h2').focus({preventScroll:true});
        break;
      }
    }
  });
  $('site-switch').addEventListener('toggle', () => { if ($('site-switch').open) setNavigation(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { $('site-switch').open = false; setNavigation(false); }
  });
  $('profile-dialog').addEventListener('cancel',()=>{afterProfile=null;candidate=identity;});
  $('transfer-dialog').addEventListener('cancel', e=>{e.preventDefault();closeTransfer();});
  window.addEventListener('hashchange', readGuideHash);
  window.addEventListener('storage', event => {
    if (event.key === KEY + ':transfer-revision' && event.newValue) location.reload();
  });
  window.addEventListener('online', () => { if (!$('connection-notice').hidden) void retryConnection(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseTimer(); else resumeTimer();
    if (view === 'exam') updateExamTimer();
  });
  window.addEventListener('pagehide', pauseTimer);
  window.addEventListener('pageshow', () => { resumeTimer(); if (view === 'exam') updateExamTimer(); });
  document.querySelectorAll?.('[data-overview]').forEach(node => { node.innerHTML = drawOverviewSequence(node.dataset.overview); });
  if (document.querySelectorAll) initializeSequences(document);
  readGuideHash();
  $('metric-count').textContent=String(qs.length); $('total-count').textContent=`/ ${qs.length}`; updateProfileLabel(); initializeTransfer(); void refreshRanking();
  void shareUI.openFromUrl();
  if (profile?.localOnly) setConnectionUnavailable(true);
  if(nextPendingAttempt() && profile) uploadPending();
})();
