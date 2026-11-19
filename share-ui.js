function createShareUI({request, getProfile, getIdentity, activeIdentity, showProfile, toast, formatDuration, formatPlayerNumber}) {
  const $ = id => document.getElementById(id);
  const dialog = $('share-dialog');
  const canvas = $('share-poster');
  const context = canvas.getContext('2d');
  const backgroundSource = '/*__SHARE_BACKGROUND__*/';
  const tones = {badge:['#ffd78b','#6fe8dc'], ranking:['#ffca76','#ff8b63'], honor:['#a6f7e9','#e9c078']};
  let current = null, requestId = 0, working = false;
  let backgroundPromise;

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

  function backgroundImage() {
    if (!backgroundPromise) {
      const image = new Image();
      image.src = backgroundSource;
      backgroundPromise = image.decode().then(() => image).catch(() => null);
    }
    return backgroundPromise;
  }

  function drawOrbits(primary, secondary) {
    const cx = 540, cy = 445;
    const glow = context.createRadialGradient(cx, cy, 30, cx, cy, 330);
    glow.addColorStop(0, primary + '55'); glow.addColorStop(.55, secondary + '22'); glow.addColorStop(1, secondary + '00');
    context.fillStyle = glow; context.fillRect(190, 95, 700, 700);
    context.save();
    context.lineWidth = 2;
    for (const [radius, alpha, dash] of [[205,.75,[]],[224,.55,[15,12]],[246,.22,[]]]) {
      context.globalAlpha = alpha; context.strokeStyle = primary; context.setLineDash(dash);
      context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.stroke();
    }
    context.setLineDash([]);
    for (let i = 0; i < 48; i++) {
      const angle = Math.PI * 2 * i / 48;
      const inner = i % 4 === 0 ? 231 : 239;
      context.globalAlpha = i % 4 === 0 ? .85 : .36;
      context.beginPath(); context.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      context.lineTo(cx + Math.cos(angle) * 246, cy + Math.sin(angle) * 246); context.stroke();
    }
    context.restore();
  }

  function drawFrame(background, snapshot) {
    if (background) context.drawImage(background, 0, 0, 1080, 1350);
    else { context.fillStyle = '#101c26'; context.fillRect(0, 0, 1080, 1350); }
    const shade = context.createLinearGradient(0, 0, 0, 1350);
    shade.addColorStop(0, 'rgba(4,10,18,.38)'); shade.addColorStop(.34, 'rgba(4,12,22,.32)');
    shade.addColorStop(.68, 'rgba(3,10,19,.64)'); shade.addColorStop(1, 'rgba(4,9,17,.48)');
    context.fillStyle = shade; context.fillRect(0, 0, 1080, 1350);
    const [primary, secondary] = tones[snapshot.kind];
    context.save();
    context.strokeStyle = primary; context.globalAlpha = .62; context.lineWidth = 2; context.strokeRect(48, 48, 984, 1254);
    context.globalAlpha = .22; context.strokeRect(62, 62, 956, 1226);
    context.restore();
    drawOrbits(primary, secondary);
    context.save();
    context.fillStyle = primary; context.shadowColor = primary; context.shadowBlur = 14;
    for (let i = 0; i < 32; i++) {
      const x = 85 + ((i * 197 + 61) % 910), y = 200 + ((i * 331 + 41) % 950);
      context.globalAlpha = .3 + (i % 3) * .18;
      context.beginPath(); context.arc(x, y, i % 5 === 0 ? 3 : 1.5, 0, Math.PI * 2); context.fill();
    }
    context.restore();
    context.textAlign = 'center'; context.shadowColor = '#02090f'; context.shadowBlur = 10;
    context.fillStyle = '#fff0ce'; context.font = '700 28px "Microsoft YaHei", sans-serif';
    context.fillText('螺旋寺院  ·  团本机制考核', 540, 128);
    context.font = '600 20px sans-serif'; context.fillStyle = '#d5c39f'; context.fillText('RAID HONORS  /  SHARE THE MOMENT', 540, 168);
    context.shadowBlur = 0;
  }

  async function emblemImage(snapshot) {
    if (!snapshot.badge) return null;
    const svg = drawBadgeArtwork(snapshot.badge).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" ');
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    return img;
  }
  function drawEmblem(image, snapshot) {
    if (!image) {
      const rank = String(snapshot.rank);
      let size = 192;
      context.font = `700 ${size}px Georgia, serif`;
      while (size > 64 && context.measureText(rank).width > 300) context.font = `700 ${--size}px Georgia, serif`;
      const gold = context.createLinearGradient(0, 350, 0, 520);
      gold.addColorStop(0, '#fff7d1'); gold.addColorStop(.5, '#f5cc77'); gold.addColorStop(1, '#b77739');
      context.save(); context.shadowColor = '#f2a74e'; context.shadowBlur = 28;
      context.lineWidth = 5; context.strokeStyle = '#4e2d16'; context.strokeText(rank, 540, 520);
      context.fillStyle = gold; context.fillText(rank, 540, 520);
      context.restore();
      context.fillStyle = '#fff1d0'; context.font = '700 23px sans-serif'; context.fillText('R A N K', 540, 342);
      return;
    }
    context.save(); context.shadowColor = tones[snapshot.kind][0]; context.shadowBlur = 35;
    context.drawImage(image, 370, 275, 340, 340); context.restore();
  }

  function posterText(snapshot) {
    const isBadge = snapshot.kind === 'badge';
    const isRanking = snapshot.kind === 'ranking';
    const label = isBadge ? '我的勋章' : isRanking ? '综合排行榜' : '趣味排行榜';
    const title = isBadge ? snapshot.badge.name : `第 ${snapshot.rank} 名`;
    let detail = snapshot.badge?.description || '';
    if (isRanking) detail = `${snapshot.score} 分  ·  用时 ${formatDuration(snapshot.elapsedSeconds)}`;
    if (snapshot.kind === 'honor') detail = `${snapshot.badge.name}  ·  ${snapshot.valueType === 'time' ? formatDuration(snapshot.value) : `${snapshot.value} 次`}`;
    context.textAlign = 'center'; context.shadowColor = '#020910'; context.shadowBlur = 12;
    context.fillStyle = tones[snapshot.kind][0]; context.font = '700 28px "Microsoft YaHei", sans-serif'; context.fillText(label, 540, 718);
    context.fillStyle = '#fff4df'; context.font = '700 76px "Microsoft YaHei", sans-serif'; wrappedText(title, 540, 808, 850, 84, 1);
    context.fillStyle = '#e1e7da'; context.font = '500 32px "Microsoft YaHei", sans-serif'; wrappedText(detail, 540, 879, 800, 48, 2);
    context.shadowBlur = 0;
    context.strokeStyle = 'rgba(245,216,160,.55)'; context.lineWidth = 1.5;
    context.beginPath(); context.moveTo(270, 966); context.lineTo(810, 966); context.stroke();
    context.fillStyle = '#fff0d8'; context.font = '700 42px "Microsoft YaHei", sans-serif'; wrappedText(snapshot.nickname, 540, 1035, 770, 46, 1);
    context.fillStyle = '#cad8cc'; context.font = '500 25px sans-serif'; context.fillText(formatPlayerNumber(snapshot.playerNumber), 540, 1080);
    const date = new Date(snapshot.createdAt).toLocaleDateString('zh-CN', {year:'numeric', month:'2-digit', day:'2-digit'});
    context.fillStyle = '#e3d0ab'; context.font = '500 24px "Microsoft YaHei", sans-serif'; context.fillText(`记录于 ${date}  ·  分享时的记录`, 540, 1195);
    context.fillStyle = '#c1cbb8'; context.font = '500 21px sans-serif'; context.fillText('螺旋寺院 · 一起练习，一起进步', 540, 1237);
    canvas.setAttribute('aria-label', `${snapshot.nickname}，${label}，${title}。${detail}。记录于 ${date}。`);
  }

  async function display(result, id) {
    if (!result || !/^[a-f0-9]{32}$/.test(result.id || '') || !result.snapshot ||
        !['badge', 'ranking', 'honor'].includes(result.snapshot.kind)) throw new Error('分享内容无法识别。');
    const snapshot = result.snapshot;
    const [image, background] = await Promise.all([emblemImage(snapshot), backgroundImage()]);
    if (id !== requestId || !dialog.open) return;
    drawFrame(background, snapshot);
    drawEmblem(image, snapshot);
    posterText(snapshot);
    current = result;
    $('share-artwork').dataset.kind = snapshot.kind;
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
