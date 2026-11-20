// Fine, short-lived stardust follows the pointer without covering page content.
(() => {
  const canvas = document.getElementById('splash-cursor');
  const home = document.getElementById('home-view');
  const context = canvas?.getContext('2d');
  if (!canvas || !home || !context || !window.matchMedia) return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(pointer: fine)');
  const particles = [], trail = [];
  const colors = ['149,235,216', '103,205,193', '244,206,144', '218,236,211'];
  let width = 0, height = 0, frame = 0, lastFrame = 0, pointer = null, touch = null;
  let sequence = 0, limit = 300;

  const active = () => !document.hidden && !motion.matches && !home.hidden && !home.classList.contains('hidden');
  const editable = target => !!target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog');
  const between = (min, max) => min + Math.random() * (max - min);

  function resize() {
    stop();
    width = window.innerWidth;
    height = window.innerHeight;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.25, Math.sqrt(2400000 / (width * height)));
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    limit = Math.min(620, Math.max(200, Math.round(width * height / 2700)));
  }

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    pointer = null;
    touch = null;
    particles.length = 0;
    trail.length = 0;
    context.clearRect(0, 0, width, height);
  }

  function start() {
    if (!frame && active()) frame = requestAnimationFrame(draw);
  }

  function addParticle(x, y, dx, dy, burst) {
    const angle = between(0, Math.PI * 2);
    const radius = between(2, burst ? 11 : 8);
    const speed = between(burst ? 55 : 28, burst ? 155 : 105);
    const carry = burst ? 0 : between(12, 45);
    const color = colors[Math.floor(Math.random() * colors.length)];
    particles.push({
      x: x + Math.cos(angle) * radius,
      y: y + Math.sin(angle) * radius,
      vx: Math.cos(angle) * speed + dx * carry,
      vy: Math.sin(angle) * speed + dy * carry - 8,
      spin: between(-2.8, 2.8), age: 0, life: between(1.1, burst ? 2.15 : 2),
      size: between(.7, 2), color, glint: Math.random() < .2
    });
    if (particles.length > limit) particles.splice(0, particles.length - limit);
  }

  function burst(x, y) {
    for (let i = 0; i < 28; i++) addParticle(x, y, 0, 0, true);
    start();
  }

  function move(event) {
    if (!active() || !finePointer.matches || event.pointerType === 'touch' || editable(event.target)) {
      pointer = null;
      return;
    }
    const now = performance.now(), x = event.clientX, y = event.clientY;
    if (!pointer || now - pointer.time > 180 || Math.hypot(x - pointer.x, y - pointer.y) > 220) {
      pointer = {x, y, time: now};
      sequence++;
      return;
    }
    const dx = x - pointer.x, dy = y - pointer.y, distance = Math.hypot(dx, dy);
    if (distance < 2) return;
    const ux = dx / distance, uy = dy / distance;
    const steps = Math.min(28, Math.max(1, Math.ceil(distance / 8)));
    for (let i = 1; i <= steps; i++) {
      const fraction = i / steps, px = pointer.x + dx * fraction, py = pointer.y + dy * fraction;
      trail.push({x: px, y: py, nx: -uy, ny: ux, time: now, sequence});
      addParticle(px, py, ux, uy, false);
      addParticle(px, py, ux, uy, false);
      addParticle(px, py, ux, uy, false);
    }
    if (trail.length > 150) trail.splice(0, trail.length - 150);
    pointer = {x, y, time: now};
    start();
  }

  function drawTrail(now) {
    while (trail.length && now - trail[0].time > 1650) trail.shift();
    const tones = ['149,235,216', '242,203,138', '113,206,193'];
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i];
      if (a.sequence !== b.sequence) continue;
      const age = (now - b.time) / 1650;
      const fade = Math.max(0, 1 - age) ** 2;
      for (let strand = 0; strand < 3; strand++) {
        const waveA = Math.sin(i * .31 + strand * 2.2 + (now - a.time) * .003) * (3 + strand * 4.5);
        const waveB = Math.sin((i + 1) * .31 + strand * 2.2 + (now - b.time) * .003) * (3 + strand * 4.5);
        context.strokeStyle = `rgba(${tones[strand]},${fade * (strand ? .4 : .7)})`;
        context.lineWidth = strand ? .8 : 1.35;
        context.beginPath();
        context.moveTo(a.x + a.nx * waveA, a.y + a.ny * waveA);
        context.lineTo(b.x + b.nx * waveB, b.y + b.ny * waveB);
        context.stroke();
      }
    }
  }

  function draw(now) {
    frame = 0;
    if (!active()) { stop(); return; }
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, .05) : .016;
    lastFrame = now;
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = 'lighter';
    context.lineCap = 'round';
    drawTrail(now);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) { particles.splice(i, 1); continue; }
      const turn = p.spin * dt, cosine = Math.cos(turn), sine = Math.sin(turn);
      const damping = Math.exp(-1.05 * dt);
      const vx = (p.vx * cosine - p.vy * sine) * damping;
      p.vy = (p.vx * sine + p.vy * cosine) * damping - 7 * dt;
      p.vx = vx;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const life = p.age / p.life;
      const opacity = Math.min(1, p.age / .09) * (1 - life) ** 1.25;
      const tailX = p.x - p.vx * .24, tailY = p.y - p.vy * .24;
      context.strokeStyle = `rgba(${p.color},${opacity * .5})`;
      context.lineWidth = p.size * .75;
      context.beginPath();
      context.moveTo(tailX, tailY);
      context.quadraticCurveTo((tailX + p.x) / 2 - p.vy * .018, (tailY + p.y) / 2 + p.vx * .018, p.x, p.y);
      context.stroke();
      context.fillStyle = `rgba(${p.color},${opacity * .82})`;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
      if (p.glint && opacity > .25) {
        context.strokeStyle = `rgba(${p.color},${opacity * .38})`;
        context.lineWidth = .6;
        context.beginPath();
        context.moveTo(p.x - 3, p.y); context.lineTo(p.x + 3, p.y);
        context.moveTo(p.x, p.y - 3); context.lineTo(p.x, p.y + 3);
        context.stroke();
      }
    }
    context.globalCompositeOperation = 'source-over';
    if (particles.length || trail.length) frame = requestAnimationFrame(draw);
    else { lastFrame = 0; pointer = null; }
  }

  resize();
  window.addEventListener('resize', resize, {passive:true});
  window.addEventListener('pointermove', move, {passive:true});
  window.addEventListener('pointerout', event => {
    if (!event.relatedTarget) { pointer = null; sequence++; }
  }, {passive:true});
  window.addEventListener('pointerdown', event => {
    if (!active() || editable(event.target)) return;
    if (event.pointerType === 'touch') touch = {x:event.clientX, y:event.clientY, id:event.pointerId};
    else burst(event.clientX, event.clientY);
  }, {passive:true});
  window.addEventListener('pointerup', event => {
    if (!touch || event.pointerId !== touch.id) return;
    if (active() && !editable(event.target) && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < 10) {
      burst(event.clientX, event.clientY);
    }
    touch = null;
  }, {passive:true});
  window.addEventListener('pointercancel', () => { touch = null; }, {passive:true});
  document.addEventListener('visibilitychange', () => { if (!active()) stop(); });
  if (motion.addEventListener) motion.addEventListener('change', () => { if (!active()) stop(); });
  else motion.addListener(() => { if (!active()) stop(); });
  if (window.MutationObserver) new MutationObserver(() => { if (!active()) stop(); })
    .observe(home, {attributes:true, attributeFilter:['class', 'hidden']});
})();
