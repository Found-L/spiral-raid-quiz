// A small, self-contained ink-flow field for the home page. The canvas never handles input.
(() => {
  let canvas = document.getElementById('splash-cursor');
  const home = document.getElementById('home-view');
  if (!canvas || !home || !window.matchMedia) return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(pointer: fine)');
  const points = [];
  let width = 0, height = 0, frame = 0, resizeFrame = 0, previousFrame = 0, lastInput = 0, lastPointer = null;
  let renderer;
  const observedContexts = new WeakSet();

  const isActiveView = () => !document.hidden && !motion.matches && !home.hidden && !home.classList.contains('hidden');
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function makeFlowRenderer(target) {
    const gl = target.getContext('webgl', {
      alpha: true, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: true, powerPreference: 'low-power'
    });
    if (!gl) return null;
    const half = gl.getExtension('OES_texture_half_float');
    if (!half || !gl.getExtension('EXT_color_buffer_half_float')) return null;
    const linear = !!gl.getExtension('OES_texture_half_float_linear');

    const vertex = `
      attribute vec2 aPosition;
      varying vec2 vUv;
      void main() { vUv = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0., 1.); }
    `;
    // The field stores velocity in RG and the two ink colours in BA.
    const flow = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uField;
      uniform vec2 uTexel, uPoint, uForce, uPigment;
      uniform float uTimeStep, uAspect, uRadius, uSplat;
      void main() {
        vec4 here = texture2D(uField, vUv);
        vec2 back = clamp(vUv - here.xy * uTimeStep, vec2(.001), vec2(.999));
        vec4 moved = texture2D(uField, back);
        vec4 l = texture2D(uField, back - vec2(uTexel.x, 0.));
        vec4 r = texture2D(uField, back + vec2(uTexel.x, 0.));
        vec4 b = texture2D(uField, back - vec2(0., uTexel.y));
        vec4 t = texture2D(uField, back + vec2(0., uTexel.y));
        vec2 gradient = vec2((r.b + r.a) - (l.b + l.a), (t.b + t.a) - (b.b + b.a));
        vec2 velocity = moved.xy * exp(-1.65 * uTimeStep);
        velocity += vec2(-gradient.y, gradient.x) * .09 * uTimeStep;
        vec2 ink = mix(moved.ba, (l.ba + r.ba + b.ba + t.ba) * .25, .045);
        ink *= exp(-.72 * uTimeStep);
        vec2 d = vUv - uPoint;
        d.x *= uAspect;
        float weight = exp(-dot(d, d) / (uRadius * uRadius)) * uSplat;
        vec2 orbit = vec2(-d.y, d.x) / max(length(d), .025);
        velocity += (uForce + orbit * .10) * weight;
        ink += uPigment * weight;
        gl_FragColor = vec4(clamp(velocity, -.8, .8), clamp(ink, 0., 2.));
      }
    `;
    const display = `
      precision mediump float;
      varying vec2 vUv;
      uniform sampler2D uField;
      void main() {
        vec2 ink = texture2D(uField, vUv).ba;
        vec3 colour = ink.x * vec3(.16, .86, .72) + ink.y * vec3(1., .67, .28);
        float alpha = clamp(max(max(colour.r, colour.g), colour.b) * .48, 0., .72);
        gl_FragColor = vec4(clamp(colour, 0., 1.) * alpha, alpha);
      }
    `;

    function shader(type, source) {
      const result = gl.createShader(type);
      gl.shaderSource(result, source);
      gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
        gl.deleteShader(result);
        throw new Error('Ink shader could not be compiled');
      }
      return result;
    }
    function program(fragment, names) {
      const result = gl.createProgram();
      const v = shader(gl.VERTEX_SHADER, vertex), f = shader(gl.FRAGMENT_SHADER, fragment);
      gl.attachShader(result, v); gl.attachShader(result, f); gl.linkProgram(result);
      gl.deleteShader(v); gl.deleteShader(f);
      if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error('Ink shader could not be linked');
      const uniforms = {};
      names.forEach(name => { uniforms[name] = gl.getUniformLocation(result, name); });
      return {value: result, position: gl.getAttribLocation(result, 'aPosition'), uniforms};
    }

    let step, paint;
    try {
      step = program(flow, ['uField', 'uTexel', 'uPoint', 'uForce', 'uPigment', 'uTimeStep', 'uAspect', 'uRadius', 'uSplat']);
      paint = program(display, ['uField']);
    } catch (_) { return null; }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    let surfaces = [], fieldWidth = 0, fieldHeight = 0;

    function createSurface() {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fieldWidth, fieldHeight, 0, gl.RGBA, half.HALF_FLOAT_OES, null);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.deleteFramebuffer(framebuffer); gl.deleteTexture(texture);
        throw new Error('Ink framebuffer is unavailable');
      }
      gl.viewport(0, 0, fieldWidth, fieldHeight);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      return {texture, framebuffer};
    }
    function use(item, surface) {
      gl.useProgram(item.value);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(item.position);
      gl.vertexAttribPointer(item.position, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, surface.texture);
      gl.uniform1i(item.uniforms.uField, 0);
    }
    function clear() {
      for (const surface of surfaces) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, surface.framebuffer);
        gl.viewport(0, 0, fieldWidth, fieldHeight);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, target.width, target.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    function resize() {
      for (const surface of surfaces) { gl.deleteTexture(surface.texture); gl.deleteFramebuffer(surface.framebuffer); }
      surfaces = [];
      const scale = Math.min(1, 560 / Math.max(width, height));
      fieldWidth = Math.max(64, Math.round(width * scale));
      fieldHeight = Math.max(64, Math.round(height * scale));
      try { surfaces = [createSurface(), createSurface()]; }
      catch (_) { return false; }
      clear();
      return true;
    }
    function draw(dt, splats) {
      if (surfaces.length !== 2 || gl.isContextLost()) return;
      const count = Math.max(1, splats.length);
      for (let i = 0; i < count; i++) {
        const point = splats[i];
        gl.bindFramebuffer(gl.FRAMEBUFFER, surfaces[1].framebuffer);
        gl.viewport(0, 0, fieldWidth, fieldHeight);
        use(step, surfaces[0]);
        const u = step.uniforms;
        gl.uniform2f(u.uTexel, 1 / fieldWidth, 1 / fieldHeight);
        gl.uniform1f(u.uTimeStep, dt / count);
        gl.uniform1f(u.uAspect, width / height);
        gl.uniform1f(u.uRadius, point?.radius || .05);
        gl.uniform1f(u.uSplat, point ? 1 : 0);
        gl.uniform2f(u.uPoint, point?.x || 0, point?.y || 0);
        gl.uniform2f(u.uForce, point?.vx || 0, point?.vy || 0);
        gl.uniform2f(u.uPigment, point?.jade || 0, point?.gold || 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        surfaces.reverse();
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, target.width, target.height);
      use(paint, surfaces[0]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    return {resize, draw, clear};
  }

  function makeFallbackRenderer(target) {
    const context = target.getContext('2d');
    if (!context) return null;
    const clouds = [];
    function clear() { clouds.length = 0; context.clearRect(0, 0, target.width, target.height); }
    return {
      resize() { clear(); return true; }, clear,
      draw(dt, splats) {
        for (const point of splats) {
          for (let i = 0; i < 5; i++) {
            const angle = i * Math.PI * .4 + Math.random() * .5;
            clouds.push({x:point.x * width, y:(1 - point.y) * height, vx:point.vx * width * .25 + Math.cos(angle) * 18,
              vy:-point.vy * height * .25 + Math.sin(angle) * 18, age:0, radius:18 + Math.random() * 24,
              color:point.jade > point.gold ? '91,207,183' : '235,180,103'});
          }
        }
        if (clouds.length > 90) clouds.splice(0, clouds.length - 90);
        context.clearRect(0, 0, target.width, target.height);
        const ratioX = target.width / width, ratioY = target.height / height;
        context.setTransform(ratioX, 0, 0, ratioY, 0, 0);
        context.globalCompositeOperation = 'lighter';
        for (let i = clouds.length - 1; i >= 0; i--) {
          const cloud = clouds[i]; cloud.age += dt;
          if (cloud.age > 2.5) { clouds.splice(i, 1); continue; }
          cloud.x += cloud.vx * dt; cloud.y += cloud.vy * dt;
          cloud.vx *= .98; cloud.vy *= .98;
          const radius = cloud.radius * (1 + cloud.age * .8), alpha = .22 * (1 - cloud.age / 2.5);
          const gradient = context.createRadialGradient(cloud.x, cloud.y, 0, cloud.x, cloud.y, radius);
          gradient.addColorStop(0, `rgba(${cloud.color},${alpha})`); gradient.addColorStop(1, `rgba(${cloud.color},0)`);
          context.fillStyle = gradient; context.fillRect(cloud.x - radius, cloud.y - radius, radius * 2, radius * 2);
        }
        context.globalCompositeOperation = 'source-over';
        context.setTransform(1, 0, 0, 1, 0, 0);
      }
    };
  }

  function initialize() {
    try { renderer = makeFlowRenderer(canvas); } catch (_) { renderer = null; }
    if (renderer && !observedContexts.has(canvas)) {
      observedContexts.add(canvas);
      canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stop(); });
      canvas.addEventListener('webglcontextrestored', initialize);
    }
    if (!renderer) {
      // A canvas that has attempted a WebGL context cannot subsequently become 2D.
      const replacement = canvas.cloneNode(false);
      canvas.replaceWith(replacement); canvas = replacement;
      renderer = makeFallbackRenderer(canvas);
    }
    if (!renderer) return;
    resize();
  }
  function resize() {
    width = window.innerWidth; height = window.innerHeight;
    if (!width || !height || !renderer) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.25, Math.sqrt(2400000 / (width * height)));
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    if (!renderer.resize()) {
      const replacement = canvas.cloneNode(false);
      canvas.replaceWith(replacement); canvas = replacement;
      renderer = makeFallbackRenderer(canvas);
      renderer?.resize();
    }
  }
  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; previousFrame = 0; lastPointer = null; points.length = 0;
    renderer?.clear();
  }
  function tick(now) {
    frame = 0;
    if (!isActiveView() || !renderer || now - lastInput > 5000) { stop(); return; }
    const dt = previousFrame ? clamp((now - previousFrame) / 1000, .001, .04) : .016;
    previousFrame = now;
    renderer.draw(dt, points.splice(0, 6));
    frame = requestAnimationFrame(tick);
  }
  function splash(event, burst) {
    if (!isActiveView() || !renderer || !width || !height) return;
    if (!burst && (event.pointerType === 'touch' || !finePointer.matches)) return;
    const x = clamp(event.clientX / width, 0, 1), y = 1 - clamp(event.clientY / height, 0, 1);
    const dx = lastPointer ? x - lastPointer.x : 0, dy = lastPointer ? y - lastPointer.y : 0;
    if (!burst && lastPointer && Math.hypot(dx * width, dy * height) < 3) return;
    lastPointer = {x, y};
    const turn = .5 + .5 * Math.sin(performance.now() / 430);
    points.push({x, y, vx:clamp(dx * 4, -.3, .3), vy:clamp(dy * 4, -.3, .3),
      jade:.20 + turn * .28, gold:.08 + (1 - turn) * .19, radius:burst ? .072 : .045});
    if (points.length > 18) points.splice(0, points.length - 18);
    lastInput = performance.now();
    if (!frame) frame = requestAnimationFrame(tick);
  }

  initialize();
  if (!renderer) return;
  window.addEventListener('resize', () => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; resize(); });
  }, {passive:true});
  window.addEventListener('pointermove', event => splash(event, false), {passive:true});
  window.addEventListener('pointerdown', event => splash(event, true), {passive:true});
  window.addEventListener('pointerout', event => { if (!event.relatedTarget) lastPointer = null; }, {passive:true});
  document.addEventListener('visibilitychange', () => { if (!isActiveView()) stop(); });
  if (motion.addEventListener) motion.addEventListener('change', () => { if (!isActiveView()) stop(); });
  else motion.addListener(() => { if (!isActiveView()) stop(); });
  if (window.MutationObserver) new MutationObserver(() => { if (!isActiveView()) stop(); })
    .observe(home, {attributes:true, attributeFilter:['class', 'hidden']});
})();
