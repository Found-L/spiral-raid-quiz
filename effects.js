// Atmospheric particles are decorative and never intercept the page's controls.
(() => {
  const canvas = document.getElementById('temple-particles');
  const context = canvas?.getContext('2d');
  if (!canvas || !context || !window.matchMedia) return;

  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(pointer: fine)');
  const hero = document.getElementById('home');
  const heroArt = document.querySelector('.hero-art');
  const pointer = {x: -1000, y: -1000, last: -Infinity};
  const fragments = [];
  const brush = [];
  let particles = [], width = 0, height = 0, frame = null, previous = 0;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(6000000 / (width * height)));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.min(180, Math.max(45, Math.round(width * height / 13500)));
    particles = Array.from({length: count}, () => {
      const jade = Math.random() < .46;
      return {
        x: Math.random() * width, y: Math.random() * height,
        vx: -5 + Math.random() * 10, vy: -7 - Math.random() * 24,
        size: .7 + Math.random() * 1.7, phase: Math.random() * Math.PI * 2,
        tail: Math.random() < .3 ? 7 + Math.random() * 12 : 0,
        color: jade ? '147,220,199' : '242,201,133'
      };
    });
  }

  function draw(now) {
    frame = null;
    if (preference.matches || document.hidden || !width || !height) return;
    if (previous && now - previous < 24) { frame = requestAnimationFrame(draw); return; }
    const delta = previous ? Math.min(now - previous, 60) / 1000 : .025;
    previous = now;
    context.clearRect(0, 0, width, height);
    const pointerVisible = finePointer.matches && now - pointer.last < 2200;
    for (let i = 0; i < 3; i++) {
      const progress = (now / (10500 + i * 1800) + i * .37) % 1;
      const x = progress * (width + 500) - 250;
      const y = height * (.22 + i * .27) + Math.sin(progress * Math.PI * 2 + i) * 45;
      const energy = context.createLinearGradient(x - 220, y + 30, x + 25, y - 25);
      energy.addColorStop(0, 'rgba(125,215,190,0)');
      energy.addColorStop(.65, 'rgba(125,215,190,.11)');
      energy.addColorStop(1, 'rgba(240,205,143,.32)');
      context.strokeStyle = energy;
      context.lineWidth = 1.1;
      context.beginPath();
      context.moveTo(x - 220, y + 30);
      context.bezierCurveTo(x - 150, y - 15, x - 70, y + 45, x + 25, y - 25);
      context.stroke();
    }
    if (pointerVisible) {
      const glow = context.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 130);
      glow.addColorStop(0, 'rgba(131,219,192,.13)');
      glow.addColorStop(.4, 'rgba(213,191,133,.045)');
      glow.addColorStop(1, 'rgba(131,219,192,0)');
      context.fillStyle = glow;
      context.fillRect(pointer.x - 130, pointer.y - 130, 260, 260);
    }
    while (brush.length && now - brush[0].time > 650) brush.shift();
    for (let i = 1; i < brush.length; i++) {
      const age = now - brush[i].time;
      context.strokeStyle = `rgba(174,224,202,${.38 * Math.max(0, 1 - age / 650)})`;
      context.lineWidth = 1.25;
      context.beginPath();
      context.moveTo(brush[i - 1].x, brush[i - 1].y);
      context.lineTo(brush[i].x, brush[i].y);
      context.stroke();
    }

    for (const particle of particles) {
      let vx = particle.vx + Math.sin(now / 2100 + particle.y / 180 + particle.phase) * 7;
      let vy = particle.vy;
      if (pointerVisible) {
        const dx = particle.x - pointer.x, dy = particle.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 1 && distance < 150) {
          const curl = (1 - distance / 150) * 25;
          vx += -dy / distance * curl;
          vy += dx / distance * curl;
        }
      }
      particle.x = (particle.x + vx * delta + width) % width;
      particle.y = (particle.y + vy * delta + height) % height;
      const alpha = .3 + .44 * (.5 + .5 * Math.sin(now / 1100 + particle.phase));
      context.fillStyle = `rgba(${particle.color},${alpha})`;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
      if (particle.tail) {
        context.strokeStyle = `rgba(${particle.color},${alpha * .5})`;
        context.lineWidth = .8;
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(particle.x - vx * .18, particle.y + particle.tail);
        context.stroke();
      }
    }

    for (let i = fragments.length - 1; i >= 0; i--) {
      const piece = fragments[i], age = now - piece.started;
      if (age >= 900) { fragments.splice(i, 1); continue; }
      piece.x += piece.vx * delta;
      piece.y += piece.vy * delta;
      piece.vy += 35 * delta;
      const alpha = .8 * (1 - age / 900), size = piece.size * (1 - age / 1200);
      context.fillStyle = `rgba(${piece.color},${alpha})`;
      context.beginPath();
      context.moveTo(piece.x, piece.y - size * 2);
      context.lineTo(piece.x + size, piece.y);
      context.lineTo(piece.x, piece.y + size * 2);
      context.lineTo(piece.x - size, piece.y);
      context.closePath();
      context.fill();
    }
    frame = requestAnimationFrame(draw);
  }

  function update() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    previous = 0;
    if (preference.matches || document.hidden) {
      context.clearRect(0, 0, width, height);
      fragments.length = 0;
      brush.length = 0;
      heroArt?.style.removeProperty('--depth-x');
      heroArt?.style.removeProperty('--depth-y');
    } else frame = requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize, {passive: true});
  window.addEventListener('pointermove', event => {
    if (preference.matches || event.pointerType === 'touch') return;
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.last = performance.now();
    if (!finePointer.matches) return;
    const previousPoint = brush[brush.length - 1];
    if (!previousPoint || Math.hypot(previousPoint.x - pointer.x, previousPoint.y - pointer.y) > 6) {
      brush.push({x:pointer.x, y:pointer.y, time:pointer.last});
      if (brush.length > 36) brush.shift();
    }
    if (hero?.contains(event.target)) {
      const box = hero.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - .5;
      const y = (event.clientY - box.top) / box.height - .5;
      heroArt?.style.setProperty('--depth-x', `${(x * 16).toFixed(2)}px`);
      heroArt?.style.setProperty('--depth-y', `${(y * 12).toFixed(2)}px`);
    } else {
      heroArt?.style.removeProperty('--depth-x');
      heroArt?.style.removeProperty('--depth-y');
    }
    const card = event.target.closest?.('.guide-card');
    const scene = card?.querySelector('.chapter-scene');
    if (scene) {
      const box = scene.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width, y = (event.clientY - box.top) / box.height;
      card.style.setProperty('--glow-x', `${(x * 100).toFixed(1)}%`);
      card.style.setProperty('--glow-y', `${(y * 100).toFixed(1)}%`);
      card.style.setProperty('--tilt-x', `${((x - .5) * 5).toFixed(2)}deg`);
      card.style.setProperty('--tilt-y', `${((.5 - y) * 5).toFixed(2)}deg`);
    }
  }, {passive: true});
  window.addEventListener('pointerout', event => {
    const card = event.target.closest?.('.guide-card');
    if (card && (!(event.relatedTarget instanceof Node) || !card.contains(event.relatedTarget))) {
      card.style.removeProperty('--tilt-x'); card.style.removeProperty('--tilt-y');
    }
  }, {passive: true});
  window.addEventListener('pointerdown', event => {
    if (preference.matches || event.target.closest?.('a, button, input, textarea, select, summary, dialog')) return;
    const now = performance.now();
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI * 2 / 10 + Math.random() * .3, speed = 30 + Math.random() * 65;
      fragments.push({x:event.clientX, y:event.clientY, vx:Math.cos(angle) * speed, vy:Math.sin(angle) * speed - 15,
        size:1.2 + Math.random() * 1.5, started:now, color:i % 2 ? '147,220,199' : '242,201,133'});
    }
    if (fragments.length > 50) fragments.splice(0, fragments.length - 50);
  }, {passive: true});
  document.addEventListener('visibilitychange', update);
  if (preference.addEventListener) preference.addEventListener('change', update);
  else preference.addListener(update);
  resize();
  update();
})();

// Transitions are visual only: the existing navigation and focus changes stay immediate.
(() => {
  if (!window.MutationObserver || !window.matchMedia) return;
  const shell = document.querySelector('.site-shell');
  const views = ['home', 'guide', 'history', 'badges', 'exam', 'result']
    .map(name => document.getElementById(name + '-view')).filter(Boolean);
  const title = document.getElementById('guide-title');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!shell || !views.length) return;
  let active = views.find(element => !element.hidden && !element.classList.contains('hidden'));
  let guideTitle = title?.textContent || '';

  function animateView(view) {
    if (preference.matches) return;
    shell.classList.remove('view-shifting');
    view.classList.remove('view-emerging');
    void shell.offsetWidth;
    shell.classList.add('view-shifting');
    view.classList.add('view-emerging');
  }

  const observer = new MutationObserver(() => {
    const next = views.find(element => !element.hidden && !element.classList.contains('hidden'));
    const nextTitle = title?.textContent || '';
    if (next && next !== active) {
      if (active?.id === 'home-view') document.body.classList.add('intro-seen');
      active = next;
      animateView(next);
    } else if (next?.id === 'guide-view' && nextTitle !== guideTitle) {
      animateView(next);
    }
    guideTitle = nextTitle;
  });
  views.forEach(view => observer.observe(view, {attributes: true, attributeFilter: ['class', 'hidden']}));
  if (title) observer.observe(title, {childList: true, characterData: true, subtree: true});
})();
