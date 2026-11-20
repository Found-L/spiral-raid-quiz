(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = {csrf:'', tab:'overview', sequence:0, playerPage:1, query:'', playerNumber:null,
    attemptPage:1, questionPage:1, questionVersion:'', interactionPage:1, interactionKind:'comments'};
  let idleTimer = null;
  const formatDate = new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };
  const date = value => Number.isSafeInteger(value) ? formatDate.format(value) : '未记录';
  const number = value => Number.isSafeInteger(value) ? '#' + String(value).padStart(6,'0') : '未编号';
  const points = value => value == null ? '—' : `${Number(value).toFixed(Number(value)%1 ? 2 : 0)} 分`;
  const duration = value => {
    if (!Number.isSafeInteger(value)) return '未记录';
    const hours = Math.floor(value/3600), minutes = Math.floor(value%3600/60), seconds = value%60;
    return hours ? `${hours}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}` : `${minutes}:${String(seconds).padStart(2,'0')}`;
  };
  const versionLabel = value => value ? `题库 ${value.split('-').pop()}` : '未知题库';
  const sectionLabel = value => ({twins:'双剑',spirit:'超魔灵',witch:'黑风魔女'})[value] || '机制题';

  function showLogin(message='') {
    state.csrf = '';
    ++state.sequence;
    clearTimeout(idleTimer);
    for (const id of ['overview-content','players-content','players-pages','player-content','player-pages',
      'questions-content','questions-pages','badges-content','interactions-content','interactions-pages']) $(id).replaceChildren();
    state.playerNumber = null;
    $('dashboard').hidden = true;
    $('login-view').hidden = false;
    $('password-open').hidden = true;
    $('logout').hidden = true;
    $('login-message').textContent = message;
    $('password').value = '';
    $('password-form').reset();
    if ($('password-dialog').open) $('password-dialog').close();
  }
  async function api(route, body={}) {
    const headers = {'Content-Type':'application/json'};
    if (state.csrf && route !== 'login' && route !== 'session') headers['X-CSRF-Token'] = state.csrf;
    let response;
    try {
      response = await fetch(`../api/admin/${route}`, {method:'POST',credentials:'same-origin',cache:'no-store',headers,body:JSON.stringify(body)});
    } catch { throw new Error('连接失败，请检查网络后重试。'); }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && !['login','password','session'].includes(route)) showLogin('登录已过期，请重新登录。');
      throw new Error(payload.error || '暂时无法读取数据，请稍后重试。');
    }
    if (route !== 'logout') {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(()=>showLogin('长时间未操作，请重新登录。'),30*60*1000);
    }
    return payload;
  }
  function showDashboard() {
    $('login-view').hidden = true;
    $('dashboard').hidden = false;
    $('password-open').hidden = false;
    $('logout').hidden = false;
    $('global-message').textContent = '';
    setTab('overview');
  }
  function empty(parent, text) { parent.replaceChildren(el('p','empty',text)); }
  function metric(label, value, note='') {
    const box = el('div','metric');
    box.append(el('span','metric-label',label),el('strong','metric-value',value));
    if (note) box.append(el('small','',note));
    return box;
  }
  function pagination(parent, data, callback, total=data.total) {
    parent.replaceChildren();
    if (!data.pages || data.pages <= 1) {
      if (total !== undefined) parent.append(el('span','',`共 ${total} 条`));
      return;
    }
    const prev=el('button','','上一页'), next=el('button','','下一页');
    prev.type=next.type='button'; prev.disabled=data.page <= 1; next.disabled=data.page >= data.pages;
    prev.addEventListener('click',()=>callback(data.page-1)); next.addEventListener('click',()=>callback(data.page+1));
    parent.append(prev,el('span','',`第 ${data.page} / ${data.pages} 页 · 共 ${total} 条`),next);
  }
  function setTab(tab) {
    state.tab = tab;
    for (const button of document.querySelectorAll('[data-tab]')) {
      const active = button.dataset.tab === tab;
      button.classList.toggle('active',active);
      if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
      $('panel-'+button.dataset.tab).hidden = !active;
    }
    $('global-message').textContent = '';
    if (tab === 'overview') void loadOverview();
    if (tab === 'players') state.playerNumber ? void loadPlayer(state.playerNumber,state.attemptPage) : void loadPlayers(state.playerPage);
    if (tab === 'questions') void loadQuestions(state.questionPage);
    if (tab === 'badges') void loadBadges();
    if (tab === 'interactions') void loadInteractions(state.interactionPage);
  }
  function loading(target) { target.replaceChildren(el('p','empty','正在读取数据…')); }
  function failed(target,error) { if (state.csrf) empty(target,error.message); }
  function personButton(entry, rowClass='recent-row') {
    const button=el('button',rowClass); button.type='button';
    const main=el('span','row-main'); main.append(el('strong','',entry.nickname),el('small','',`${number(entry.playerNumber)} · ${date(entry.submittedAt)}`));
    button.append(main,el('span','score',points(entry.score)));
    button.disabled=!entry.playerNumber;
    button.addEventListener('click',()=>openPlayer(entry.playerNumber));
    return button;
  }
  async function loadOverview() {
    const serial=++state.sequence, target=$('overview-content'); loading(target);
    try {
      const data=await api('overview'); if(serial!==state.sequence)return;
      const grid=el('div','metric-grid');
      [['玩家身份',data.players,'已保存资料'],['已交答卷',data.attempts,'所有题库'],['参与答题',data.activePlayers,'至少提交一轮'],['平均成绩',points(data.averageScore),'全部已上传答卷'],['近 7 天答卷',data.weekAttempts,'按上传时间'],['满分答卷',data.perfects,'所有题库'],['玩家评价',data.comments,'包含隐藏评价'],['互动表情',data.reactions,'当前保留']].forEach(item=>grid.append(metric(...item)));
      const lower=el('div','overview-grid'), chart=el('section','surface'), heading=el('div','section-title');
      heading.append(el('h2','','最近七天'),el('small','','北京时间 · 上传答卷'));
      const trend=el('div','trend'), maximum=Math.max(1,...data.daily.map(item=>item.count));
      data.daily.forEach(item=>{const col=el('div','trend-col'), track=el('div','trend-track'),bar=el('div','trend-bar');bar.style.height=`${Math.max(2,Math.round(item.count/maximum*100))}%`;track.append(bar);col.append(el('span','trend-value',item.count),track,el('span','trend-date',item.date.slice(5).replace('-','/')));col.setAttribute('aria-label',`${item.date}：${item.count} 份答卷`);trend.append(col)});
      chart.append(heading,trend);
      const recent=el('section','surface'), recentHead=el('div','section-title'); recentHead.append(el('h2','','最近提交'),el('small','','最新 8 条'));
      const list=el('div','stack'); if(data.recent.length)data.recent.forEach(item=>list.append(personButton(item)));else empty(list,'还没有已提交的答卷。');
      recent.append(recentHead,list); lower.append(chart,recent); target.replaceChildren(grid,lower);
    } catch(error) { if(serial===state.sequence)failed(target,error); }
  }
  function playerRow(item) {
    const button=el('button','player-row'); button.type='button'; button.disabled=!item.number;
    const person=el('span','row-main'); person.append(el('strong','',item.nickname),el('small','',number(item.number)));
    const rounds=el('span'); rounds.append(el('span','metric-label','答题次数'),el('b','',`${item.attempts} 次`));
    const best=el('span'); best.append(el('span','metric-label','历史最高分'),el('b','',points(item.bestScore)));
    const last=el('span','last-date'); last.append(el('span','metric-label','最近提交'),el('b','',date(item.latestAt)));
    button.append(person,rounds,best,last); button.addEventListener('click',()=>openPlayer(item.number)); return button;
  }
  async function loadPlayers(page=1) {
    state.playerPage=page; state.playerNumber=null; $('player-list-view').hidden=false; $('player-detail').hidden=true;
    const serial=++state.sequence,target=$('players-content'); loading(target); $('players-pages').replaceChildren();
    try {
      const data=await api('players',{page,query:state.query}); if(serial!==state.sequence)return;
      state.playerPage=data.page; const list=el('div','stack');
      if(data.entries.length)data.entries.forEach(item=>list.append(playerRow(item)));else empty(list,'没有找到符合条件的玩家。');
      target.replaceChildren(list); pagination($('players-pages'),data,p=>loadPlayers(p));
    } catch(error) { if(serial===state.sequence)failed(target,error); }
  }
  function openPlayer(playerNumber) {
    if(!playerNumber)return; state.tab='players'; state.playerNumber=playerNumber; state.attemptPage=1;
    setTab('players'); window.scrollTo({top:0,behavior:'smooth'});
  }
  function reviewCard(question, index) {
    const card=el('article','review-question');
    card.append(el('p','history-review-meta',`错题 ${index+1} · ${sectionLabel(question.section)}`),el('h4','',question.question));
    const answer=el('p'); answer.append(el('span','','正确答案'),document.createTextNode(question.answer));
    const explanation=el('p'); explanation.append(el('span','','解析'),document.createTextNode(question.explanation || '暂无解析。'));
    card.append(answer,explanation); return card;
  }
  function attemptRow(item) {
    const details=el('details','record-row'),summary=el('summary'),main=el('span','row-main');
    const wrong=Math.max(0,item.totalCount-item.correctCount);
    main.append(el('strong','',`上传 ${date(item.submittedAt)}`),el('small','',`${item.currentVersion?'当前题库':versionLabel(item.quizVersion)} · 答对 ${item.correctCount} / ${item.totalCount} · 用时 ${duration(item.elapsedSeconds)}`));
    const right=el('span','row-main'); right.append(el('span','score',points(item.score)),el('small','',item.reviewAvailable ? `查看错题 · ${wrong} 题 ↓` : wrong ? '错题明细未保存' : '本轮全部答对'));
    summary.append(main,right); details.append(summary);
    const review=el('div','record-review'); details.append(review);
    if(!item.reviewAvailable) { review.append(el('p','review-note',wrong?'这次答题没有保存错题明细。':'本轮没有错题。')); return details; }
    let loaded=false, pending=false;
    const load = async()=>{
      if(loaded||pending)return; pending=true; review.replaceChildren(el('p','review-note','正在读取错题…'));
      try {
        const data=await api('attempt',{attemptId:item.id}); if(!details.isConnected)return;
        review.replaceChildren();
        if(!data.reviewAvailable || !Array.isArray(data.questions)) review.append(el('p','review-note','这次答题没有保存错题明细。'));
        else if(!data.questions.length) review.append(el('p','review-note','本轮没有错题。'));
        else { if(!data.currentVersion)review.append(el('p','review-note','这次使用的是旧题库，请结合当前攻略复习。')); data.questions.forEach((q,i)=>review.append(reviewCard(q,i))); }
        loaded=true;
      } catch(error) {
        if(!details.isConnected || !state.csrf)return;
        const retry=el('button','outline-button','重新读取');retry.type='button';retry.addEventListener('click',load);review.replaceChildren(el('p','review-note',error.message),retry);
      } finally {pending=false;}
    };
    details.addEventListener('toggle',()=>{if(details.open)void load()}); return details;
  }
  async function loadPlayer(playerNumber,page=1) {
    state.playerNumber=playerNumber;state.attemptPage=page;$('player-list-view').hidden=true;$('player-detail').hidden=false;
    const serial=++state.sequence,target=$('player-content');loading(target);$('player-pages').replaceChildren();
    try {
      const data=await api('player',{playerNumber,page});if(serial!==state.sequence)return;
      state.attemptPage=data.page; const title=el('div','player-title'),name=el('div');
      name.append(el('p','eyebrow','PLAYER PROFILE'),el('h2','',data.nickname),el('p','',`${number(data.number)} · 创建 ${date(data.createdAt)} · 资料更新 ${date(data.updatedAt)}`)); title.append(name);
      const metrics=el('div','metric-grid player-metrics');
      [['答题次数',`${data.attemptCount} 次`],['历史最高分',points(data.bestScore)],['满分次数',`${data.perfects} 次`],['收到互动',`${data.receivedComments} 条评价 · ${data.receivedReactions} 个表情`]].forEach(item=>metrics.append(metric(...item)));
      const medals=el('section','surface'),medalTitle=el('div','section-title');medalTitle.append(el('h2','','获得的勋章'),el('small','',`共 ${data.badges.length} 枚`));medals.append(medalTitle);
      const chips=el('div','badge-chips');if(data.badges.length)data.badges.forEach(item=>{const chip=el('span','badge-chip'+(item.selected?' is-shown':''),`${item.name}${item.selected?' · 已展示':''}`);chip.title=item.description;chips.append(chip)});else chips.append(el('p','review-note','还没有获得勋章。'));medals.append(chips);
      const history=el('section','record-list'),heading=el('div','section-title');heading.append(el('h2','','历次答题'),el('small','','按上传时间排列'));history.append(heading);
      const list=el('div','stack');if(data.attempts.length)data.attempts.forEach(item=>list.append(attemptRow(item)));else empty(list,'还没有提交过答卷。');history.append(list);
      target.replaceChildren(title,metrics,medals,history);pagination($('player-pages'),{page:data.page,pages:data.pages},p=>loadPlayer(playerNumber,p),data.attemptCount);
    } catch(error) {if(serial===state.sequence)failed(target,error);}
  }
  async function loadQuestions(page=1) {
    state.questionPage=page;const serial=++state.sequence,target=$('questions-content');loading(target);$('questions-pages').replaceChildren();
    try {
      const data=await api('questions',{page,version:state.questionVersion});if(serial!==state.sequence)return;
      state.questionPage=data.page;const select=$('question-version');select.replaceChildren(new Option('全部题库',''));
      data.versions.forEach(version=>select.add(new Option(`${versionLabel(version)}${version===data.currentVersion?' · 当前':''}`,version)));select.value=state.questionVersion;
      const list=el('div','stack'); if(!data.entries.length)empty(list,'暂无保存的错题统计。');
      data.entries.forEach(item=>{const card=el('article','question-card');card.append(el('div','question-meta',`${versionLabel(item.quizVersion)} · ${sectionLabel(item.section)}`),el('h3','',item.question),el('p','question-count',`答错 ${item.mistakes} 次 · ${item.players} 位玩家`));list.append(card)});
      target.replaceChildren(list);pagination($('questions-pages'),data,p=>loadQuestions(p));
    } catch(error) {if(serial===state.sequence)failed(target,error);}
  }
  async function loadBadges() {
    const serial=++state.sequence,target=$('badges-content');loading(target);
    try {
      const data=await api('badges');if(serial!==state.sequence)return;target.replaceChildren();
      data.entries.forEach(item=>{const card=el('article','badge-card');const count=item.currentCount !== undefined ? `当前 ${item.currentCount} 人 · 历史 ${item.historyCount} 人` : `${item.count || 0} 人获得`;card.append(el('h3','',item.name),el('p','',item.description),el('strong','',count));target.append(card)});
    } catch(error) {if(serial===state.sequence)failed(target,error);}
  }
  async function loadInteractions(page=1) {
    state.interactionPage=page;const serial=++state.sequence,target=$('interactions-content');loading(target);$('interactions-pages').replaceChildren();
    try {
      const data=await api('interactions',{page,kind:state.interactionKind});if(serial!==state.sequence)return;
      state.interactionPage=data.page;const list=el('div','stack');if(!data.entries.length)empty(list,'暂无互动记录。');
      data.entries.forEach(item=>{const card=el('article','interaction-card');const status=item.state && item.state!=='visible'?' · 已隐藏':'';card.append(el('div','row-meta',`${item.author} ${number(item.authorNumber)} → ${item.target} ${number(item.targetNumber)} · ${date(item.updatedAt)}${status}`));card.append(el('p','',data.kind==='comments'?item.content:item.reaction));if(data.kind==='comments')card.append(el('p','row-meta',`${item.likes} 次点赞`));list.append(card)});
      target.replaceChildren(list);pagination($('interactions-pages'),data,p=>loadInteractions(p));
    } catch(error) {if(serial===state.sequence)failed(target,error);}
  }
  $('login-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;$('login-message').textContent='正在登录…';
    try {const data=await api('login',{password:$('password').value});state.csrf=data.csrf;$('password').value='';showDashboard();}
    catch(error) {$('login-message').textContent=error.message;}
    finally {button.disabled=false;}
  });
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.tab)));
  $('refresh').addEventListener('click',()=>setTab(state.tab));
  $('player-search').addEventListener('submit',event=>{event.preventDefault();state.query=$('player-query').value.trim();void loadPlayers(1)});
  $('player-back').addEventListener('click',()=>loadPlayers(state.playerPage));
  $('question-version').addEventListener('change',event=>{state.questionVersion=event.target.value;void loadQuestions(1)});
  document.querySelectorAll('[data-kind]').forEach(button=>button.addEventListener('click',()=>{state.interactionKind=button.dataset.kind;document.querySelectorAll('[data-kind]').forEach(other=>other.classList.toggle('active',other===button));void loadInteractions(1)}));
  $('logout').addEventListener('click',async()=>{
    try {await api('logout');showLogin('已退出管理页面。');}
    catch {$('global-message').textContent='退出失败，请检查网络后重试。';}
  });
  $('password-open').addEventListener('click',()=>{$('password-form').reset();$('password-message').textContent='';$('password-dialog').showModal()});
  $('password-close').addEventListener('click',()=>$('password-dialog').close());
  $('password-form').addEventListener('submit',async event=>{
    event.preventDefault();if($('new-password').value!==$('confirm-password').value){$('password-message').textContent='两次输入的新密码不一致。';return;}
    const button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;$('password-message').textContent='正在保存…';
    try {await api('password',{currentPassword:$('current-password').value,newPassword:$('new-password').value});$('password-form').reset();$('password-dialog').close();showLogin('密码已更新，请用新密码登录。');}
    catch(error) {$('password-message').textContent=error.message;}
    finally {button.disabled=false;}
  });
  if (location.origin !== 'https://www.lysue.com') {
    $('login-form').hidden=true;$('login-view').append(el('p','login-note','请在国内站打开管理页面。'));
    const link=el('a','outline-button','前往管理页面 ↗');link.href='https://www.lysue.com/spiral-raid-quiz/admin/';$('login-view').append(link);
  } else {
    api('session').then(data=>{state.csrf=data.csrf;showDashboard()}).catch(()=>{});
  }
  window.addEventListener('pageshow',event=>{
    if (event.persisted && location.origin === 'https://www.lysue.com') {
      showLogin(); api('session').then(data=>{state.csrf=data.csrf;showDashboard()}).catch(()=>{});
    }
  });
})();
