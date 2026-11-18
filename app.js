(() => {
  'use strict';
  const localPreview = ['localhost','127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('api')==='local';
  const API = localPreview ? 'http://127.0.0.1:8787' : 'https://spiral-raid-quiz-api.foundliny.chatgpt.site';
  const bank = JSON.parse(document.getElementById('question-bank').textContent);
  const qs = bank.questions;
  const SECTIONS = [
    {id:'twins', title:'灼热剑与酷寒剑', short:'双剑'},
    {id:'spirit', title:'超魔灵', short:'超魔灵'},
    {id:'witch', title:'黑风魔女', short:'黑风魔女'},
  ];
  const TYPE_NAMES = {single:'单选题', multiple:'多选题', judge:'判断题', fill:'选择式填空'};
  const KEY = 'spiral-temple-quiz-v1';
  const $ = (id) => document.getElementById(id);
  const read = (suffix, fallback=null) => { try { const v=localStorage.getItem(KEY+suffix); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
  const save = (suffix, value) => { try { localStorage.setItem(KEY+suffix,JSON.stringify(value)); } catch { toast('浏览器无法保存进度，请检查存储设置。'); } };
  const remove = (suffix) => { try { localStorage.removeItem(KEY+suffix); } catch {} };
  const hex = (count) => Array.from(crypto.getRandomValues(new Uint8Array(count)), x=>x.toString(16).padStart(2,'0')).join('');
  const makeIdentity = () => ({deviceId:hex(16),secret:hex(32)});
  let identity = read(':identity');
  if (!identity || !/^[a-f0-9]{32}$/.test(identity.deviceId||'') || !/^[a-f0-9]{64}$/.test(identity.secret||'')) { identity=makeIdentity(); save(':identity',identity); }
  let candidate = identity;
  let profile = read(':profile');
  let draft = read(':draft',{});
  if (draft.version !== bank.version || !draft.answers || typeof draft.answers !== 'object') draft={version:bank.version,index:0,answers:{}};
  let index = Math.max(0,Math.min(qs.length-1,Number(draft.index)||0));
  let result = null;
  let onlyWrong = false;
  let afterProfile = null;
  let toastTimer;
  const escape = (s) => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sectionOf = (id) => SECTIONS.find(x=>x.id===id);
  const answered = (q) => Array.isArray(draft.answers[q.id]) && draft.answers[q.id].length>0;
  function toast(message) { const t=$('toast'); t.textContent=message; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),3200); }
  function storeDraft() { draft.index=index; save(':draft',draft); }
  function setView(which) {
    $('home-view').classList.toggle('hidden',which!=='home');
    $('exam-view').classList.toggle('hidden',which!=='exam');
    $('result-view').classList.toggle('hidden',which!=='result');
    window.scrollTo({top:0,behavior:'instant'});
  }
  function updateProfileLabel() {
    $('header-profile').textContent = profile ? profile.nickname : '设置我的资料';
    $('exam-profile').textContent = profile ? profile.nickname : '';
    $('delete-profile').classList.toggle('hidden',!profile);
  }
  async function request(path, body) {
    const controller = new AbortController(); const timer=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetch(API+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store'});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok) { const error=new Error(payload.error||'服务暂时不可用，请稍后重试。'); error.status=response.status; throw error; }
      return payload;
    } catch(e) { if(e.name==='AbortError') throw new Error('连接超时，请稍后重试。'); if(e instanceof TypeError) throw new Error('无法连接成绩服务，请检查网络后重试。'); throw e; }
    finally { clearTimeout(timer); }
  }
  async function saveRemoteProfile(who=identity, data=profile) {
    if(!data) throw new Error('请先设置昵称。');
    return request('/api/profile',{...who,...data});
  }
  function showProfile(next=null) {
    candidate=identity; afterProfile=next; $('nickname').value=profile?.nickname||'';
    $('identity-code').value=''; $('profile-error').textContent='';
    if(!$('profile-dialog').open) $('profile-dialog').showModal();
  }
  function closeProfile() { $('profile-dialog').close(); afterProfile=null; candidate=identity; }
  $('profile-form').addEventListener('submit',async (e)=>{
    e.preventDefault(); const submit=e.submitter || $('profile-form').querySelector('[type="submit"]'); const data={nickname:$('nickname').value.trim()};
    $('profile-error').textContent=''; submit.disabled=true; submit.textContent='保存中…';
    try {
      const stored=await saveRemoteProfile(candidate,data);
      if(candidate.deviceId!==identity.deviceId) { remove(':pending');remove(':draft');remove(':last-result');draft={version:bank.version,index:0,answers:{}};index=0; }
      identity=candidate; save(':identity',identity); profile={nickname:stored.nickname}; save(':profile',profile);
      updateProfileLabel(); const next=afterProfile; $('profile-dialog').close(); afterProfile=null; toast('资料已保存');
      if(next==='start') beginExam(); else refreshRanking();
    } catch(err) { $('profile-error').textContent=err.message; }
    finally { submit.disabled=false; submit.textContent='保存资料'; }
  });
  function start() { if(!profile) showProfile('start'); else beginExam(); }
  function beginExam() { setView('exam'); updateProfileLabel(); renderQuestion(); }
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
    $('question-type').textContent=TYPE_NAMES[q.type]; $('question-source').textContent=`${q.role} · ${q.source} ↗`; $('question-source').href=q.sourceUrl;
    $('question-text').textContent=q.question;
    $('question-help').textContent=q.type==='multiple'?'可选多项；全部选对才得分。':'请选择一个答案。';
    $('answered-count').textContent=String(done); $('progress-fill').style.width=`${100*done/qs.length}%`;
    const wrap=$('question-options'); wrap.replaceChildren();
    q.options.forEach((opt,i)=>{
      const label=document.createElement('label'); const selected=(draft.answers[q.id]||[]).includes(opt.id); label.className='option'+(selected?' selected':'');
      const input=document.createElement('input'); input.type=q.type==='multiple'?'checkbox':'radio'; input.name='answer'; input.value=opt.id; input.checked=selected;
      input.addEventListener('change',()=>selectOption(q,opt.id,input.checked));
      const letter=document.createElement('span'); letter.className='option-letter'; letter.textContent=String.fromCharCode(65+i);
      const text=document.createElement('span'); text.className='option-text'; text.textContent=opt.text;
      label.append(input,letter,text); wrap.append(label);
    });
    const prev=document.querySelector('[data-action="previous"]'); prev.disabled=index===0;
    $('next-button').textContent=index===qs.length-1?'完成并交卷 →':'下一题 →';
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
    const missing=qs.filter(q=>!answered(q));
    if(missing.length) { toast(`还有 ${missing.length} 题未作答，已跳到第一道未答题。`); goto(qs.findIndex(q=>!answered(q))); return; }
    const answers=JSON.parse(JSON.stringify(draft.answers));
    const pending={attemptId:hex(16),version:bank.version,answers};
    save(':pending',pending); result={...grade(answers),answers}; save(':last-result',result); remove(':draft');
    draft={version:bank.version,index:0,answers:{}}; index=0; onlyWrong=false; setView('result'); renderResult(); uploadPending();
  }
  async function uploadPending() {
    const pending=read(':pending'); if(!pending)return;
    $('sync-status').className='sync-status'; $('sync-status').textContent='正在保存成绩到排行榜…'; $('retry-upload').hidden=true;
    try {
      await saveRemoteProfile(); const data=await request('/api/submit',{...identity,...pending});
      if(result && (data.correctCount!==result.correctCount || data.totalCount!==result.totalCount)) throw new Error('成绩核对失败，请刷新后联系团长。');
      remove(':pending'); $('sync-status').textContent='成绩已上传，排行榜保留你的最高分。'; refreshRanking();
    } catch(err) { $('sync-status').className='sync-status error'; $('sync-status').textContent=`成绩已保存在本机，但尚未上传：${err.message}`; $('retry-upload').hidden=false; }
  }
  function renderResult() {
    if(!result)return;
    $('result-name').textContent=profile?profile.nickname:'';
    $('result-score').textContent=Number(result.score).toFixed(result.score%1?2:0);
    $('result-detail').textContent=`答对 ${result.correctCount} / ${result.totalCount} 题 · 多选题全部选对才计分`;
    $('review-toggle').textContent=onlyWrong?'查看全部题目':'只看错题';
    const list=$('review-list'); list.replaceChildren();
    qs.forEach((q,i)=>{
      const selected=result.answers[q.id]||[], correct=isCorrect(q,selected); if(onlyWrong&&correct)return;
      const chosen=q.options.filter(o=>selected.includes(o.id)).map(o=>o.text).join('；')||'未作答';
      const expected=q.options.filter(o=>q.answer.includes(o.id)).map(o=>o.text).join('；');
      const article=document.createElement('article'); article.className=`review-card ${correct?'correct':'wrong'}`;
      article.innerHTML=`<div class="review-meta">${String(i+1).padStart(2,'0')} / ${escape(sectionOf(q.section).short)} · ${escape(q.role)} · ${correct?'回答正确':'回答有误'} · <a href="${escape(q.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escape(q.source)} ↗</a></div><h3>${escape(q.question)}</h3><p>你的选择：${escape(chosen)}</p><p>参考答案：${escape(expected)}</p><p class="explanation">解析：${escape(q.explanation)}</p>`; list.append(article);
    });
    if(!list.children.length){const p=document.createElement('p');p.className='empty-state';p.textContent='这一轮没有错题。';list.append(p);}
  }
  async function refreshRanking() {
    const list=$('ranking-list'); list.replaceChildren(); const loading=document.createElement('p'); loading.className='empty-state'; loading.textContent='正在读取榜单…'; list.append(loading);
    try {
      const data=await request('/api/leaderboard'); list.replaceChildren();
      if(!data.entries?.length){loading.textContent='还没有成绩，来做第一个上榜的人。';list.append(loading);return;}
      for(const entry of data.entries){
        const row=document.createElement('div');row.className='ranking-row';
        row.innerHTML=`<div class="ranking-player"><span class="rank-number">${String(entry.rank).padStart(2,'0')}</span><div class="player-text"><strong>${escape(entry.nickname)}</strong></div></div><span>${entry.correctCount} / ${entry.totalCount}</span><strong class="ranking-score">${Number(entry.score).toFixed(entry.score%1?2:0)}</strong>`; list.append(row);
      }
    } catch(err){loading.textContent=err.message+' 可以稍后点击刷新。';list.replaceChildren(loading);}
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
    if(m[1].toLowerCase()!==identity.deviceId && (Object.keys(draft.answers).length || read(':pending')) && !confirm('恢复其他身份会清除当前浏览器未提交的答题进度，确定继续吗？'))return;
    candidate={deviceId:m[1].toLowerCase(),secret:m[2].toLowerCase()}; $('profile-error').textContent='身份码已读取，请填写昵称并保存。';
  }
  async function deleteProfile() {
    if(!profile || !confirm('确认删除你的线上资料和全部成绩？删除后无法恢复。'))return;
    try { await request('/api/delete-profile',identity); remove(':profile');remove(':pending');remove(':last-result');remove(':draft');draft={version:bank.version,index:0,answers:{}};index=0;profile=null;identity=makeIdentity();candidate=identity;save(':identity',identity);updateProfileLabel();closeProfile();refreshRanking();toast('线上资料与成绩已删除。'); }
    catch(err){$('profile-error').textContent=err.message;}
  }
  document.addEventListener('click',(e)=>{
    const target=e.target.closest('[data-action]'); if(!target)return;
    switch(target.dataset.action){
      case 'start': start();break;
      case 'profile': showProfile();break;
      case 'close-profile': closeProfile();break;
      case 'copy-identity': copyIdentity();break;
      case 'import-identity': importIdentity();break;
      case 'delete-profile': deleteProfile();break;
      case 'previous': goto(index-1);break;
      case 'next': if(index===qs.length-1)submitExam();else goto(index+1);break;
      case 'submit': submitExam();break;
      case 'leave-exam': setView('home');refreshRanking();break;
      case 'show-leaderboard': setView('home');refreshRanking();requestAnimationFrame(()=>$('leaderboard').scrollIntoView({behavior:'smooth'}));break;
      case 'refresh-ranking': refreshRanking();break;
      case 'retry-upload': uploadPending();break;
      case 'restart': draft={version:bank.version,index:0,answers:{}};index=0;save(':draft',draft);beginExam();break;
      case 'results-home': setView('home');refreshRanking();requestAnimationFrame(()=>$('leaderboard').scrollIntoView({behavior:'smooth'}));break;
      case 'toggle-review': onlyWrong=!onlyWrong;renderResult();break;
    }
  });
  $('profile-dialog').addEventListener('cancel',()=>{afterProfile=null;candidate=identity;});
  $('metric-count').textContent=String(qs.length); $('total-count').textContent=`/ ${qs.length}`; updateProfileLabel(); refreshRanking();
  if(read(':pending') && profile) uploadPending();
})();
