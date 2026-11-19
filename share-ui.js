function createShareUI({request, getProfile, getIdentity, activeIdentity, showProfile, toast, formatDuration, formatPlayerNumber}) {
  const $ = id => document.getElementById(id);
  const dialog = $('share-dialog');
  const canvas = $('share-poster');
  const context = canvas.getContext('2d');
  let current = null, requestId = 0, working = false;

  function shareUrl(id) {
    const url = new URL(location.href);
    const localApi = ['localhost', '127.0.0.1'].includes(url.hostname) && url.searchParams.get('api') === 'local';
    const port = url.searchParams.get('api-port');
    url.search = '';
    url.hash = '';
    if (localApi) {
      url.searchParams.set('api', 'local');
      if (port && /^\d{1,5}$/.test(port)) url.searchParams.set('api-port', port);
    }
    url.searchParams.set('share', id);
    return url.href;
  }

  function wrappedText(text, x, y, maxWidth, lineHeight, maxLines) {
    const characters = Array.from(String(text));
    const lines = [];
    let line = '';
    for (const character of characters) {
      if (context.measureText(line + character).width > maxWidth && line) {
        lines.push(line);
        line = character;
      } else line += character;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let last = lines[maxLines - 1];
      while (last && context.measureText(last + '…').width > maxWidth) last = Array.from(last).slice(0, -1).join('');
      lines[maxLines - 1] = last + '…';
    }
    lines.forEach((value, index) => context.fillText(value, x, y + index * lineHeight));
  }

  function drawFrame() {
    const background = context.createLinearGradient(0, 0, 1080, 1350);
    background.addColorStop(0, '#263739'); background.addColorStop(.52, '#101c26'); background.addColorStop(1, '#0b111a');
    context.fillStyle = background; context.fillRect(0, 0, 1080, 1350);
    const glow = context.createRadialGradient(540, 430, 20, 540, 430, 470);
    glow.addColorStop(0, 'rgba(218,177,105,.20)'); glow.addColorStop(1, 'rgba(218,177,105,0)');
    context.fillStyle = glow; context.fillRect(0, 0, 1080, 1000);
    context.strokeStyle = 'rgba(226,199,151,.5)'; context.lineWidth = 2; context.strokeRect(55, 55, 970, 1240);
    context.strokeStyle = 'rgba(226,199,151,.14)'; context.strokeRect(70, 70, 940, 1210);
    context.beginPath(); context.arc(540, 430, 200, 0, Math.PI * 2); context.stroke();
    context.beginPath(); context.arc(540, 430, 224, 0, Math.PI * 2); context.stroke();
    context.textAlign = 'center'; context.fillStyle = '#e4c691';
    context.font = '700 26px sans-serif'; context.fillText('螺旋寺院  ·  团本机制考核', 540, 132);
    context.font = '500 19px sans-serif'; context.fillStyle = '#9aa9a3'; context.fillText('RAID HONORS  /  SHARE THE MOMENT', 540, 172);
  }

  async function emblemImage(snapshot) {
    if (!snapshot.badge) return null;
    const svg = drawBadgeArtwork(snapshot.badge).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" ');
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    return img;
  }
  function drawEmblem(image) {
    if (!image) {
      context.fillStyle = '#d6b77d'; context.font = '700 164px Georgia, serif'; context.fillText('#', 540, 490);
      return;
    }
    context.drawImage(image, 380, 270, 320, 320);
  }

  function posterText(snapshot) {
    const isBadge = snapshot.kind === 'badge';
    const isRanking = snapshot.kind === 'ranking';
    const label = isBadge ? '我的勋章' : isRanking ? '综合排行榜' : '趣味排行榜';
    const title = isBadge ? snapshot.badge.name : `第 ${snapshot.rank} 名`;
    let detail = snapshot.badge?.description || '';
    if (isRanking) detail = `${snapshot.score} 分  ·  用时 ${formatDuration(snapshot.elapsedSeconds)}`;
    if (snapshot.kind === 'honor') detail = `${snapshot.badge.name}  ·  ${snapshot.valueType === 'time' ? formatDuration(snapshot.value) : `${snapshot.value} 次`}`;
    context.textAlign = 'center';
    context.fillStyle = '#d5b77f'; context.font = '700 25px sans-serif'; context.fillText(label, 540, 670);
    context.fillStyle = '#f7eedc'; context.font = '700 72px "Microsoft YaHei", sans-serif'; wrappedText(title, 540, 770, 850, 84, 1);
    context.fillStyle = '#bdccc3'; context.font = '400 31px "Microsoft YaHei", sans-serif'; wrappedText(detail, 540, 844, 800, 48, 2);
    context.fillStyle = '#f2dcc0'; context.font = '700 38px "Microsoft YaHei", sans-serif'; wrappedText(snapshot.nickname, 540, 1035, 770, 46, 1);
    context.fillStyle = '#9caea5'; context.font = '400 24px sans-serif'; context.fillText(formatPlayerNumber(snapshot.playerNumber), 540, 1080);
    const date = new Date(snapshot.createdAt).toLocaleDateString('zh-CN', {year:'numeric', month:'2-digit', day:'2-digit'});
    context.fillStyle = '#c7b798'; context.font = '400 23px "Microsoft YaHei", sans-serif'; context.fillText(`记录于 ${date}  ·  分享时的记录`, 540, 1195);
    context.fillStyle = '#7e938d'; context.font = '500 20px sans-serif'; context.fillText('螺旋寺院 · 一起练习，一起进步', 540, 1237);
    canvas.setAttribute('aria-label', `${snapshot.nickname}，${label}，${title}。${detail}。记录于 ${date}。`);
  }

  async function display(result, id) {
    if (!result || !/^[a-f0-9]{32}$/.test(result.id || '') || !result.snapshot ||
        !['badge', 'ranking', 'honor'].includes(result.snapshot.kind)) throw new Error('分享内容无法识别。');
    const snapshot = result.snapshot;
    const image = await emblemImage(snapshot);
    if (id !== requestId || !dialog.open) return;
    drawFrame();
    drawEmblem(image);
    posterText(snapshot);
    current = result;
    $('share-link').value = shareUrl(result.id);
    $('share-content').hidden = false;
    $('share-status').textContent = '';
    let canShare = false;
    try {
      canShare = typeof navigator.share === 'function' && typeof navigator.canShare === 'function' &&
        typeof File === 'function' && navigator.canShare({files:[new File([], 'share.png', {type:'image/png'})]});
    } catch { /* Download remains available when native sharing is unavailable. */ }
    $('share-image').hidden = !canShare;
  }

  function begin() {
    const id = ++requestId;
    current = null;
    $('share-content').hidden = true;
    $('share-status').textContent = '正在准备分享卡片…';
    if (!dialog.open) dialog.showModal();
    return id;
  }

  async function start(kind, badgeId) {
    const profile = getProfile();
    if (!profile) { toast('请先保存昵称并上传成绩。'); showProfile(); return; }
    if (profile.localOnly || !activeIdentity()) { toast('请先连接成绩服务并恢复当前身份。'); return; }
    const id = begin();
    const owner = {...getIdentity()};
    try {
      const result = await request('/api/shares', {...owner, kind, badgeId});
      if (!activeIdentity(owner)) throw new Error('本机身份已切换，请重新分享。');
      if (id === requestId) await display(result, id);
    } catch (error) {
      if (id === requestId && dialog.open) $('share-status').textContent = error.message;
    }
  }

  async function openFromUrl() {
    const share = new URL(location.href).searchParams.get('share');
    if (share === null) return;
    const id = begin();
    if (!/^[a-f0-9]{32}$/.test(share)) {
      $('share-status').textContent = '分享链接无效或已失效。';
      return;
    }
    try {
      const result = await request('/api/shares/' + encodeURIComponent(share));
      if (id === requestId) await display(result, id);
    } catch (error) {
      if (id === requestId && dialog.open) $('share-status').textContent = error.message;
    }
  }

  function imageBlob() {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片生成失败，请重试。')), 'image/png'));
  }
  async function imageAction(share) {
    if (!current || working) return;
    working = true;
    $('share-download').disabled = $('share-image').disabled = true;
    try {
      const blob = await imageBlob();
      if (share) {
        await navigator.share({files:[new File([blob], '螺旋寺院分享.png', {type:'image/png'})], title:'螺旋寺院分享'});
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = '螺旋寺院分享.png';
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        $('share-status').textContent = '图片已准备下载。';
      }
    } catch (error) {
      if (error.name !== 'AbortError') $('share-status').textContent = error.message || '图片分享失败，请重试。';
    } finally {
      working = false;
      $('share-download').disabled = $('share-image').disabled = false;
    }
  }
  $('share-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { ++requestId; current = null; });
  $('share-download').addEventListener('click', () => void imageAction(false));
  $('share-image').addEventListener('click', () => void imageAction(true));
  $('share-copy').addEventListener('click', async () => {
    if (!current || working) return;
    try {
      await navigator.clipboard.writeText($('share-link').value);
      $('share-status').textContent = '链接已复制，发给朋友即可查看。';
    } catch {
      $('share-link').focus(); $('share-link').select();
      $('share-status').textContent = '请选择上方链接并复制。';
    }
  });
  return {start, openFromUrl};
}
