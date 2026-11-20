function createSocialUI({request, getProfile, getIdentity, activeIdentity, showProfile, refreshRanking, escape, formatPlayerNumber}) {
  const emojis = {clap:'👏', fire:'🔥', team:'🤝', thumb:'👍', star:'🌟', joy:'😄', down:'👎', facepalm:'🤦', confused:'🤔', awkward:'😅', clown:'🤡', skull:'💀'};
  const labels = {clap:'鼓掌', fire:'厉害', team:'配合', thumb:'点赞', star:'闪亮', joy:'开心', down:'不赞同', facepalm:'捂脸', confused:'疑惑', awkward:'尴尬', clown:'小丑', skull:'笑没了'};
  const groups = [['鼓励', ['clap','fire','team','thumb','star','joy']], ['吐槽', ['down','facepalm','confused']], ['恶搞', ['awkward','clown','skull']]];
  const $ = id => document.getElementById(id);
  const dialog = $('social-dialog');
  const form = $('social-form');
  const input = $('social-input');
  let number = 0, page = 1, sort = 'hot', data = null, busy = false, loading = false, confirming = false;
  let requestId = 0, resume = false, resumePicker = false, resumeDraft = null, pickerOpen = false, cooldownTimer;
  const cooldowns = {reaction:0, like:0, comment:0};

  function summary(entry) {
    const social = entry.social;
    if (!social || !Number.isSafeInteger(entry.playerNumber)) return '';
    const reactions = Array.isArray(social.reactions) ? social.reactions.filter(item => emojis[item.id] && Number.isSafeInteger(item.count)).slice(0, 3) : [];
    const icons = reactions.map(item => `<span>${emojis[item.id]} ${item.count}</span>`).join('');
    const preview = social.preview && typeof social.preview.content === 'string'
      ? `<button type="button" class="social-preview" data-action="social-open" data-number="${entry.playerNumber}"><b>${social.preview.likes > 0 ? '热评' : '最新'}</b> ${escape(social.preview.content)} <small>👍 ${Number(social.preview.likes) || 0}</small></button>` : '';
    return `<div class="rank-social"><div class="rank-social-actions"><button type="button" class="rank-social-open" data-action="social-open" data-number="${entry.playerNumber}" data-picker="true" aria-label="给 ${escape(entry.nickname)} 选择表情"><span class="rank-social-reactions">${icons || '＋ 添加表情'}</span></button><button type="button" class="rank-social-open" data-action="social-open" data-number="${entry.playerNumber}" data-picker="false">评价 ${Number(social.commentCount) || 0} ›</button></div>${preview}</div>`;
  }

  function authBody() {
    const profile = getProfile();
    return profile && !profile.localOnly && activeIdentity() ? {...getIdentity()} : {};
  }
  function status(message) { $('social-status').textContent = message; }
  function normalizedInput() { return input.value.normalize('NFKC').trim().replace(/\s+/gu, ' '); }
  function remaining(action) { return Math.max(0, cooldowns[action] - Date.now()); }
  function syncControls() {
    const locked = busy || loading || confirming;
    const content = normalizedInput();
    const length = [...content].length;
    const unchanged = Boolean(data?.ownComment && content === data.ownComment.content);
    dialog.setAttribute('aria-busy', String(busy || loading));
    $('social-add-reaction').disabled = locked;
    $('social-sort-hot').disabled = $('social-sort-new').disabled = locked;
    $('social-prev').disabled = locked || !data || data.page <= 1;
    $('social-next').disabled = locked || !data || data.page >= data.pages;
    $('social-retry').disabled = locked;
    $('social-delete-own').disabled = locked;
    $('social-submit').disabled = locked || !data || data.isTarget || length < 1 || length > 60 || unchanged || remaining('comment') > 0;
    input.disabled = busy;
    $('social-reactions').querySelectorAll('button').forEach(button => { button.disabled = locked || data?.isTarget || remaining('reaction') > 0; });
    $('social-list').querySelectorAll('button').forEach(button => {
      button.disabled = locked || button.dataset.reported === 'true' || (button.dataset.action === 'social-like' && remaining('like') > 0);
    });
    const hint = data?.ownComment?.state === 'admin_hidden' ? '这条评价已被管理员下架，修改后不会自动公开。' : data?.ownComment ? '每人可留一条评价；修改内容后，原有点赞会清零。' : '每人可留一条评价，最多 60 个字。';
    const wait = remaining('comment');
    $('social-form-note').textContent = `${hint} ${length}/60${wait ? ` · ${Math.ceil(wait / 1000)} 秒后可再次保存` : ''}`;
    clearTimeout(cooldownTimer);
    const waits = Object.keys(cooldowns).map(remaining).filter(value => value > 0);
    if (waits.length) cooldownTimer = setTimeout(syncControls, Math.min(1000, ...waits));
  }
  function markCooldown(action) {
    const delay = {reaction:1000, like:500, comment:30000}[action] || 0;
    if (delay) cooldowns[action] = Date.now() + delay;
  }
  function confirmSocial(title, message, accept) {
    if (confirming) return Promise.resolve(false);
    confirming = true; syncControls();
    const modal = $('social-confirm-dialog');
    $('social-confirm-title').textContent = title;
    $('social-confirm-message').textContent = message;
    $('social-confirm-accept').textContent = accept;
    modal.returnValue = '';
    return new Promise(resolve => {
      modal.addEventListener('close', () => {
        confirming = false; syncControls(); resolve(modal.returnValue === 'confirm');
      }, {once:true});
      modal.showModal();
    });
  }
  function askReport() {
    if (confirming) return Promise.resolve(null);
    confirming = true; syncControls();
    const modal = $('social-report-dialog');
    $('social-report-form').reset(); modal.returnValue = '';
    return new Promise(resolve => {
      modal.addEventListener('close', () => {
        const result = modal.returnValue === 'confirm' ? {reason:$('social-report-reason').value, details:$('social-report-details').value} : null;
        confirming = false; syncControls(); resolve(result);
      }, {once:true});
      modal.showModal();
    });
  }
  function showPicker(open) {
    pickerOpen = open;
    $('social-reactions').hidden = !open;
    $('social-reaction-hint').hidden = !open || Boolean(data?.isTarget);
    $('social-add-reaction').setAttribute('aria-expanded', String(open));
  }
  function renderReactions(counts) {
    const container = $('social-reactions');
    if (!container.childElementCount) {
      container.innerHTML = groups.map(([name, ids]) => `<div class="social-reaction-group"><span>${name}</span><div>${ids.map(id => `<button type="button" data-action="social-reaction" data-reaction="${id}">${emojis[id]} <span>0</span></button>`).join('')}</div></div>`).join('');
    }
    container.querySelectorAll('[data-reaction]').forEach(button => {
      const id = button.dataset.reaction, count = counts.get(id) || 0;
      button.querySelector('span').textContent = count;
      button.setAttribute('aria-label', `${labels[id]}，${count} 次`);
      button.setAttribute('aria-pressed', String(data.myReaction === id));
    });
  }
  function renderComments() {
    const list = $('social-list');
    const existing = new Map([...list.querySelectorAll('[data-comment-id]')].map(item => [item.dataset.commentId, item]));
    if (!data.comments.length) {
      if (!list.querySelector('.social-empty')) list.innerHTML = '<li class="social-empty">还没有公开评价，来写第一条吧。</li>';
    } else {
      list.querySelector('.social-empty')?.remove();
      data.comments.forEach((comment, index) => {
        const key = String(comment.id), signature = JSON.stringify(comment);
        const item = existing.get(key) || document.createElement('li');
        existing.delete(key);
        if (item.dataset.signature !== signature) {
          const numberLabel = formatPlayerNumber(comment.playerNumber);
          const like = comment.own || comment.hidden ? '' : `<button type="button" data-action="social-like" data-id="${comment.id}" data-liked="${String(comment.liked)}" aria-pressed="${String(comment.liked)}">👍 ${comment.likes}</button>`;
          const own = comment.own ? `<button type="button" data-action="social-delete" data-id="${comment.id}">删除</button>` : '';
          const hide = comment.canHide ? `<button type="button" data-action="social-hide" data-id="${comment.id}" data-hidden="${String(comment.hidden)}">${comment.hidden ? '恢复展示' : '隐藏'}</button>` : '';
          const report = !comment.own && !comment.hidden ? `<button type="button" data-action="social-report" data-id="${comment.id}" data-reported="${String(comment.reported)}">${comment.reported ? '已举报' : '举报'}</button>` : '';
          const date = new Date(comment.createdAt).toLocaleDateString('zh-CN');
          item.className = `social-comment${comment.hidden ? ' is-hidden' : ''}`;
          item.dataset.commentId = key; item.dataset.signature = signature;
          item.innerHTML = `<div class="social-comment-head"><strong>${escape(comment.nickname)}</strong><small>${escape(numberLabel)} · ${escape(date)}${comment.hidden ? ' · 已隐藏' : ''}</small></div><p>${escape(comment.content)}</p><div class="social-comment-actions">${like}${own}${hide}${report}</div>`;
        }
        if (list.children[index] !== item) list.insertBefore(item, list.children[index] || null);
      });
    }
    for (const item of existing.values()) item.remove();
  }
  function render(resetForm) {
    $('social-title').textContent = `${data.player.nickname} 的互动`;
    $('social-player-number').textContent = formatPlayerNumber(data.player.number);
    const counts = new Map(data.reactions.filter(item => Object.hasOwn(emojis, item.id)).map(item => [item.id, Number(item.count) || 0]));
    const received = [...counts].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3);
    const summary = received.length ? received.map(([id, count]) => `<span aria-label="${labels[id]} ${count} 次">${emojis[id]} ${count}</span>`).join('') : '<span>还没有表情</span>';
    if ($('social-reaction-summary').innerHTML !== summary) $('social-reaction-summary').innerHTML = summary;
    $('social-add-reaction').hidden = false;
    $('social-add-reaction').textContent = data.isTarget ? '查看全部表情' : data.myReaction ? '修改表情' : '＋ 添加表情';
    $('social-my-reaction').hidden = !data.myReaction || !emojis[data.myReaction];
    $('social-my-reaction').textContent = data.myReaction && emojis[data.myReaction] ? `你贴了 ${emojis[data.myReaction]}` : '';
    renderReactions(counts);
    showPicker(pickerOpen);
    $('social-count').textContent = `公开评价 ${data.commentCount} 条`;
    $('social-sort-hot').setAttribute('aria-pressed', String(sort === 'hot'));
    $('social-sort-new').setAttribute('aria-pressed', String(sort === 'new'));
    renderComments();
    $('social-page').textContent = `第 ${data.page} / ${data.pages} 页`;
    form.hidden = data.isTarget;
    if (resetForm) input.value = data.ownComment?.content || '';
    $('social-submit').textContent = data.ownComment ? '保存修改' : '发表评价';
    $('social-delete-own').hidden = !data.ownComment;
    syncControls();
  }
  async function load(resetForm = false, message = '正在读取互动…') {
    const current = ++requestId;
    loading = true; syncControls();
    $('social-retry').hidden = true;
    status(message);
    try {
      const result = await request('/api/social/view', {playerNumber:number, page, sort, ...authBody()});
      if (current !== requestId || !dialog.open || result.player.number !== number) return;
      data = result; page = result.page; sort = result.sort; render(resetForm); status('');
      return true;
    } catch (error) {
      if (current === requestId && dialog.open) {
        if (data) { page = data.page; sort = data.sort; render(false); }
        status(error.message); $('social-retry').hidden = false;
      }
      return false;
    } finally {
      if (current === requestId) { loading = false; syncControls(); }
    }
  }
  function open(playerNumber, expandPicker = false, restoredDraft = null) {
    if (!Number.isSafeInteger(playerNumber) || playerNumber < 1) return;
    number = playerNumber; page = 1; sort = 'hot'; data = null;
    input.value = restoredDraft ?? ''; form.hidden = true; $('social-list').replaceChildren(); $('social-reactions').replaceChildren();
    $('social-reaction-summary').textContent = ''; $('social-add-reaction').hidden = true; $('social-my-reaction').hidden = true; showPicker(false);
    pickerOpen = expandPicker;
    $('social-count').textContent = '公开评价'; $('social-page').textContent = '';
    $('social-prev').disabled = true; $('social-next').disabled = true;
    $('social-title').textContent = '玩家互动'; $('social-player-number').textContent = '';
    if (!dialog.open) dialog.showModal();
    void load(restoredDraft === null);
  }
  function needIdentity(action) {
    if (getProfile() && !getProfile().localOnly && activeIdentity()) return false;
    if (getProfile()?.localOnly) { status('请先连接成绩服务，再参与互动。'); return true; }
    if (getProfile() && !activeIdentity()) { status('本机身份已在其他页面切换，请刷新后继续。'); return true; }
    resume = true; resumePicker = action === 'reaction'; resumeDraft = action === 'comment' ? input.value : null;
    dialog.close(); showProfile(); return true;
  }
  async function mutate(action, payload, resetForm = false) {
    if (busy || loading || confirming || remaining(action) || needIdentity(action)) return;
    busy = true; syncControls();
    const participant = {...getIdentity()};
    const selectedNumber = number, generation = requestId;
    status('正在保存…');
    try {
      await request(`/api/social/${action}`, {...participant, ...payload});
      markCooldown(action);
      if (!activeIdentity(participant)) {
        if (dialog.open && requestId === generation) status('本机身份已切换，请重新打开互动。');
        return;
      }
      if (!dialog.open || number !== selectedNumber || requestId !== generation) { void refreshRanking(); return; }
      if (action === 'reaction') showPicker(false);
      const updated = await load(resetForm, '正在更新互动…');
      if (updated === false && dialog.open && number === selectedNumber) status('已保存，但互动内容刷新失败，请点击重新读取。');
      else if (action === 'report' && updated && dialog.open) status('举报已提交，感谢反馈。');
      void refreshRanking();
    } catch (error) {
      if (dialog.open && requestId === generation) status(error.message);
    } finally { busy = false; syncControls(); }
  }
  input.addEventListener('input', syncControls);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!data || data.isTarget || $('social-submit').disabled) return;
    const content = normalizedInput(), generation = requestId;
    if ([...content].length < 1 || [...content].length > 60) { status('评价请填写 1 至 60 个字。'); return; }
    if (data.ownComment && !await confirmSocial('修改评价？', '修改评价后，这条评价原有的点赞会清零。', '确认修改')) return;
    if (generation !== requestId || !dialog.open || content !== normalizedInput()) return;
    void mutate('comment', {playerNumber:number, content}, true);
  });
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-action^="social-"]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'social-open') { open(Number(target.dataset.number), target.dataset.picker === 'true'); return; }
    if (action === 'social-close') { dialog.close(); return; }
    if (busy || loading || confirming || target.disabled) return;
    if (action === 'social-retry' && dialog.open) { void load(!data); return; }
    if (!dialog.open || !data) return;
    if (action === 'social-toggle-picker') {
      showPicker(!pickerOpen);
    } else if (action === 'social-reaction') {
      void mutate('reaction', {playerNumber:number, reaction:data.myReaction === target.dataset.reaction ? null : target.dataset.reaction});
    } else if (action === 'social-like') {
      void mutate('like', {commentId:Number(target.dataset.id), liked:target.dataset.liked !== 'true'});
    } else if (action === 'social-delete' || action === 'social-delete-own') {
      const commentId = action === 'social-delete' ? Number(target.dataset.id) : data.ownComment?.id;
      const generation = requestId;
      if (commentId && await confirmSocial('删除这条评价？', '删除后，评价和点赞会移除；已提交的举报会保留供管理员审核。', '确认删除')) {
        if (generation === requestId && dialog.open) void mutate('delete', {commentId}, true);
      }
    } else if (action === 'social-hide') {
      void mutate('hide', {commentId:Number(target.dataset.id), hidden:target.dataset.hidden !== 'true'});
    } else if (action === 'social-report') {
      if (needIdentity('report')) return;
      const commentId = Number(target.dataset.id), generation = requestId;
      const report = await askReport();
      if (report && generation === requestId && dialog.open) void mutate('report', {commentId, ...report});
    } else if (action === 'social-sort') {
      if (sort === target.dataset.sort) return;
      sort = target.dataset.sort; page = 1; void load();
    } else if (action === 'social-prev' && page > 1) { page--; void load(); }
    else if (action === 'social-next' && page < data.pages) { page++; void load(); }
  });
  dialog.addEventListener('close', () => { if (!dialog.open) { ++requestId; loading = false; syncControls(); } });
  $('profile-dialog').addEventListener('close', () => {
    if (resume) {
      resume = false;
      open(number, resumePicker, resumeDraft);
      resumePicker = false;
      resumeDraft = null;
    }
  });
  return {summary};
}
