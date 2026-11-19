function createSocialUI({request, getProfile, getIdentity, activeIdentity, showProfile, refreshRanking, escape, formatPlayerNumber}) {
  const emojis = {clap:'👏', fire:'🔥', team:'🤝', thumb:'👍', star:'🌟', joy:'😄', down:'👎', facepalm:'🤦', confused:'🤔', awkward:'😅', clown:'🤡', skull:'💀'};
  const labels = {clap:'鼓掌', fire:'厉害', team:'配合', thumb:'点赞', star:'闪亮', joy:'开心', down:'不赞同', facepalm:'捂脸', confused:'疑惑', awkward:'尴尬', clown:'小丑', skull:'笑没了'};
  const groups = [['鼓励', ['clap','fire','team','thumb','star','joy']], ['吐槽', ['down','facepalm','confused']], ['恶搞', ['awkward','clown','skull']]];
  const $ = id => document.getElementById(id);
  const dialog = $('social-dialog');
  const form = $('social-form');
  const input = $('social-input');
  let number = 0, page = 1, sort = 'hot', data = null, busy = false, requestId = 0, resume = false, resumePicker = false, pickerOpen = false;

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
  function showPicker(open) {
    pickerOpen = open;
    $('social-reactions').hidden = !open;
    $('social-reaction-hint').hidden = !open || Boolean(data?.isTarget);
    $('social-add-reaction').setAttribute('aria-expanded', String(open));
  }
  function render(resetForm) {
    $('social-title').textContent = `${data.player.nickname} 的互动`;
    $('social-player-number').textContent = formatPlayerNumber(data.player.number);
    const counts = new Map(data.reactions.filter(item => Object.hasOwn(emojis, item.id)).map(item => [item.id, Number(item.count) || 0]));
    const received = [...counts].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3);
    $('social-reaction-summary').innerHTML = received.length ? received.map(([id, count]) => `<span aria-label="${labels[id]} ${count} 次">${emojis[id]} ${count}</span>`).join('') : '<span>还没有表情</span>';
    $('social-add-reaction').hidden = false;
    $('social-add-reaction').textContent = data.isTarget ? '查看全部表情' : data.myReaction ? '修改表情' : '＋ 添加表情';
    $('social-my-reaction').hidden = !data.myReaction || !emojis[data.myReaction];
    $('social-my-reaction').textContent = data.myReaction && emojis[data.myReaction] ? `你贴了 ${emojis[data.myReaction]}` : '';
    $('social-reactions').innerHTML = groups.map(([name, ids]) => `<div class="social-reaction-group"><span>${name}</span><div>${ids.filter(id => counts.has(id)).map(id => `<button type="button" data-action="social-reaction" data-reaction="${id}" aria-label="${labels[id]}，${counts.get(id)} 次" aria-pressed="${String(data.myReaction === id)}" ${data.isTarget ? 'disabled' : ''}>${emojis[id]} <span>${counts.get(id)}</span></button>`).join('')}</div></div>`).join('');
    showPicker(pickerOpen);
    $('social-count').textContent = `公开评价 ${data.commentCount} 条`;
    $('social-sort-hot').setAttribute('aria-pressed', String(sort === 'hot'));
    $('social-sort-new').setAttribute('aria-pressed', String(sort === 'new'));
    $('social-list').innerHTML = data.comments.length ? data.comments.map(comment => {
      const numberLabel = formatPlayerNumber(comment.playerNumber);
      const like = comment.own || comment.hidden ? '' : `<button type="button" data-action="social-like" data-id="${comment.id}" data-liked="${String(comment.liked)}" aria-pressed="${String(comment.liked)}">👍 ${comment.likes}</button>`;
      const own = comment.own ? `<button type="button" data-action="social-delete" data-id="${comment.id}">删除</button>` : '';
      const hide = comment.canHide ? `<button type="button" data-action="social-hide" data-id="${comment.id}" data-hidden="${String(comment.hidden)}">${comment.hidden ? '恢复展示' : '隐藏'}</button>` : '';
      const date = new Date(comment.createdAt).toLocaleDateString('zh-CN');
      return `<li class="social-comment${comment.hidden ? ' is-hidden' : ''}"><div class="social-comment-head"><strong>${escape(comment.nickname)}</strong><small>${escape(numberLabel)} · ${escape(date)}${comment.hidden ? ' · 已隐藏' : ''}</small></div><p>${escape(comment.content)}</p><div class="social-comment-actions">${like}${own}${hide}</div></li>`;
    }).join('') : '<li class="social-empty">还没有公开评价，来写第一条吧。</li>';
    $('social-page').textContent = `第 ${data.page} / ${data.pages} 页`;
    $('social-prev').disabled = data.page <= 1;
    $('social-next').disabled = data.page >= data.pages;
    form.hidden = data.isTarget;
    if (resetForm) input.value = data.ownComment?.content || '';
    $('social-submit').textContent = data.ownComment ? '保存修改' : '发表评价';
    $('social-delete-own').hidden = !data.ownComment;
    $('social-form-note').textContent = data.ownComment ? '每人可留一条评价；修改内容后，原有点赞会清零。' : '每人可留一条评价，最多 60 个字。';
  }
  async function load(resetForm = false) {
    const current = ++requestId;
    $('social-retry').hidden = true;
    status('正在读取互动…');
    try {
      const result = await request('/api/social/view', {playerNumber:number, page, sort, ...authBody()});
      if (current !== requestId || !dialog.open || result.player.number !== number) return;
      data = result; page = result.page; render(resetForm); status('');
    } catch (error) {
      if (current === requestId && dialog.open) { status(error.message); $('social-retry').hidden = false; }
    }
  }
  function open(playerNumber, expandPicker = false) {
    if (!Number.isSafeInteger(playerNumber) || playerNumber < 1) return;
    number = playerNumber; page = 1; sort = 'hot'; data = null;
    input.value = ''; form.hidden = true; $('social-list').replaceChildren(); $('social-reactions').replaceChildren();
    $('social-reaction-summary').textContent = ''; $('social-add-reaction').hidden = true; $('social-my-reaction').hidden = true; showPicker(false);
    pickerOpen = expandPicker;
    $('social-count').textContent = '公开评价'; $('social-page').textContent = '';
    $('social-prev').disabled = true; $('social-next').disabled = true;
    $('social-title').textContent = '玩家互动'; $('social-player-number').textContent = '';
    if (!dialog.open) dialog.showModal();
    void load(true);
  }
  function needIdentity(action) {
    if (getProfile() && !getProfile().localOnly && activeIdentity()) return false;
    if (getProfile()?.localOnly) { status('请先连接成绩服务，再参与互动。'); return true; }
    if (getProfile() && !activeIdentity()) { status('本机身份已在其他页面切换，请刷新后继续。'); return true; }
    resume = true; resumePicker = action === 'reaction'; dialog.close(); showProfile(); return true;
  }
  async function mutate(action, payload, resetForm = false) {
    if (busy || needIdentity(action)) return;
    busy = true;
    const participant = {...getIdentity()};
    const selectedNumber = number;
    status('正在保存…');
    try {
      await request(`/api/social/${action}`, {...participant, ...payload});
      if (!activeIdentity(participant)) { status('本机身份已切换，请重新打开互动。'); return; }
      if (!dialog.open || number !== selectedNumber) { void refreshRanking(); return; }
      if (action === 'reaction') showPicker(false);
      await load(resetForm);
      void refreshRanking();
    } catch (error) { status(error.message); }
    finally { busy = false; }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!data || data.isTarget) return;
    const content = input.value.trim();
    if ([...content].length < 1 || [...content].length > 60) { status('评价请填写 1 至 60 个字。'); return; }
    if (data.ownComment && content !== data.ownComment.content && !confirm('修改评价会清空原有点赞，确定保存吗？')) return;
    void mutate('comment', {playerNumber:number, content}, true);
  });
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-action^="social-"]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'social-open') { open(Number(target.dataset.number), target.dataset.picker === 'true'); return; }
    if (action === 'social-close') { dialog.close(); return; }
    if (action === 'social-retry' && dialog.open) { void load(!data); return; }
    if (!dialog.open || !data) return;
    if (action === 'social-toggle-picker') {
      showPicker(!pickerOpen);
    } else if (action === 'social-reaction') {
      void mutate('reaction', {playerNumber:number, reaction:data.myReaction === target.dataset.reaction ? null : target.dataset.reaction});
    } else if (action === 'social-like') {
      void mutate('like', {commentId:Number(target.dataset.id), liked:target.dataset.liked !== 'true'});
    } else if (action === 'social-delete') {
      if (confirm('确定删除你的这条评价吗？')) void mutate('delete', {commentId:Number(target.dataset.id)}, true);
    } else if (action === 'social-delete-own') {
      if (data.ownComment && confirm('确定删除你的这条评价吗？')) void mutate('delete', {commentId:data.ownComment.id}, true);
    } else if (action === 'social-hide') {
      void mutate('hide', {commentId:Number(target.dataset.id), hidden:target.dataset.hidden !== 'true'});
    } else if (action === 'social-sort') {
      sort = target.dataset.sort; page = 1; void load();
    } else if (action === 'social-prev' && page > 1) { page--; void load(); }
    else if (action === 'social-next' && page < data.pages) { page++; void load(); }
  });
  dialog.addEventListener('close', () => { if (!dialog.open) ++requestId; });
  $('profile-dialog').addEventListener('close', () => {
    if (resume) { resume = false; if (getProfile()) open(number, resumePicker); resumePicker = false; }
  });
  return {summary};
}
