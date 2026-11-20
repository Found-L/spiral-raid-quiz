/*
Fluid solver adapted from WebGL Fluid Simulation by Pavel Dobryakov:
https://github.com/PavelDoGreat/WebGL-Fluid-Simulation

MIT License

Copyright (c) 2017 Pavel Dobryakov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
(() => {
  const canvas = document.getElementById('splash-cursor');
  const hero = document.getElementById('home');
  const home = document.getElementById('home-view');
  if (!canvas || !hero || !home || !window.matchMedia) return;

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(pointer: fine)');
  const inputs = [];
  let renderer = null, frame = 0, lastFrame = 0, lastInput = 0;
  let pointer = null, touch = null, resizeFrame = 0;

  function visible() {
    return !document.hidden && !motion.matches && !home.hidden &&
      !home.classList.contains('hidden');
  }
  function inside(event) {
    if (!home.contains(event.target) || event.clientX < 0 || event.clientX > innerWidth ||
        event.clientY < 0 || event.clientY > innerHeight ||
        event.target.closest?.('button, a, input, textarea, select, dialog, [contenteditable="true"]')) return null;
    return {x:event.clientX / innerWidth, y:1 - event.clientY / innerHeight};
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function makeRenderer() {
    const gl = canvas.getContext('webgl', {alpha:true, depth:false, stencil:false, antialias:false, premultipliedAlpha:true});
    if (!gl) return null;
    const half = gl.getExtension('OES_texture_half_float');
    if (!half) return null;
    gl.getExtension('EXT_color_buffer_half_float');
    const linear = !!gl.getExtension('OES_texture_half_float_linear');
    const type = half.HALF_FLOAT_OES;
    const vertex = `
      precision highp float;
      attribute vec2 aPosition;
      uniform vec2 texelSize;
      varying vec2 vUv, vL, vR, vT, vB;
      void main() {
        vUv = aPosition * .5 + .5;
        vL = vUv - vec2(texelSize.x, 0.);
        vR = vUv + vec2(texelSize.x, 0.);
        vT = vUv + vec2(0., texelSize.y);
        vB = vUv - vec2(0., texelSize.y);
        gl_Position = vec4(aPosition, 0., 1.);
      }`;
    const shared = `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv, vL, vR, vT, vB;
    `;
    const bilerp = `
      vec4 bilerp(sampler2D image, vec2 uv, vec2 size) {
        vec2 st = uv / size - .5;
        vec2 base = floor(st), f = fract(st);
        vec4 a = texture2D(image, (base + vec2(.5, .5)) * size);
        vec4 b = texture2D(image, (base + vec2(1.5, .5)) * size);
        vec4 c = texture2D(image, (base + vec2(.5, 1.5)) * size);
        vec4 d = texture2D(image, (base + vec2(1.5, 1.5)) * size);
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
    `;
    const shaders = {
      splat: `
        uniform sampler2D target;
        uniform float aspect, radius;
        uniform vec2 point;
        uniform vec3 color;
        void main() {
          vec2 p = vUv - point;
          p.x *= aspect;
          vec3 ink = exp(-dot(p, p) / radius) * color;
          gl_FragColor = vec4(texture2D(target, vUv).xyz + ink, 1.);
        }`,
      advection: `
        uniform sampler2D velocity, source;
        uniform vec2 texelSize, sourceTexel;
        uniform float dt, dissipation;
        ` + bilerp + (linear ? `
        void main() {
          vec2 coord = vUv - dt * texture2D(velocity, vUv).xy * texelSize;
          gl_FragColor = texture2D(source, coord) / (1. + dissipation * dt);
        }` : `
        void main() {
          vec2 coord = vUv - dt * bilerp(velocity, vUv, texelSize).xy * texelSize;
          gl_FragColor = bilerp(source, coord, sourceTexel) / (1. + dissipation * dt);
        }`),
      curl: `
        uniform sampler2D velocity;
        void main() {
          float l = texture2D(velocity, vL).y, r = texture2D(velocity, vR).y;
          float t = texture2D(velocity, vT).x, b = texture2D(velocity, vB).x;
          gl_FragColor = vec4(.5 * (r - l - t + b), 0., 0., 1.);
        }`,
      vorticity: `
        uniform sampler2D velocity, curlField;
        uniform float strength, dt;
        void main() {
          float l = texture2D(curlField, vL).x, r = texture2D(curlField, vR).x;
          float t = texture2D(curlField, vT).x, b = texture2D(curlField, vB).x;
          float c = texture2D(curlField, vUv).x;
          vec2 force = .5 * vec2(abs(t) - abs(b), abs(r) - abs(l));
          force /= length(force) + .0001;
          force *= strength * c;
          force.y *= -1.;
          vec2 vel = texture2D(velocity, vUv).xy + force * dt;
          gl_FragColor = vec4(clamp(vel, -1000., 1000.), 0., 1.);
        }`,
      divergence: `
        uniform sampler2D velocity;
        void main() {
          float l = texture2D(velocity, vL).x, r = texture2D(velocity, vR).x;
          float t = texture2D(velocity, vT).y, b = texture2D(velocity, vB).y;
          vec2 c = texture2D(velocity, vUv).xy;
          if (vL.x < 0.) l = -c.x;
          if (vR.x > 1.) r = -c.x;
          if (vT.y > 1.) t = -c.y;
          if (vB.y < 0.) b = -c.y;
          gl_FragColor = vec4(.5 * (r - l + t - b), 0., 0., 1.);
        }`,
      clear: `
        uniform sampler2D target;
        uniform float amount;
        void main() { gl_FragColor = amount * texture2D(target, vUv); }`,
      pressure: `
        uniform sampler2D pressure, divergence;
        void main() {
          float l = texture2D(pressure, vL).x, r = texture2D(pressure, vR).x;
          float t = texture2D(pressure, vT).x, b = texture2D(pressure, vB).x;
          float d = texture2D(divergence, vUv).x;
          gl_FragColor = vec4((l + r + b + t - d) * .25, 0., 0., 1.);
        }`,
      gradient: `
        uniform sampler2D pressure, velocity;
        void main() {
          float l = texture2D(pressure, vL).x, r = texture2D(pressure, vR).x;
          float t = texture2D(pressure, vT).x, b = texture2D(pressure, vB).x;
          vec2 vel = texture2D(velocity, vUv).xy - vec2(r - l, t - b);
          gl_FragColor = vec4(vel, 0., 1.);
        }`,
      display: `
        uniform sampler2D dye;
        uniform vec2 sourceTexel;
        ` + bilerp + (linear ? `
        vec3 sampleInk(vec2 uv) { return texture2D(dye, uv).rgb; }
        ` : `
        vec3 sampleInk(vec2 uv) { return bilerp(dye, uv, sourceTexel).rgb; }
        `) + `
        void main() {
          vec3 ink = max(sampleInk(vUv), vec3(0.));
          float peak = max(ink.r, max(ink.g, ink.b));
          float left = length(sampleInk(vUv - vec2(sourceTexel.x, 0.)));
          float right = length(sampleInk(vUv + vec2(sourceTexel.x, 0.)));
          float bottom = length(sampleInk(vUv - vec2(0., sourceTexel.y)));
          float top = length(sampleInk(vUv + vec2(0., sourceTexel.y)));
          float rim = smoothstep(.025, .4, length(vec2(right - left, top - bottom)));
          vec3 hue = mix(ink / max(peak, .0001), vec3(.86, 1., .73), rim * .16);
          float alpha = min((1. - exp(-peak * .5)) * .62 + rim * .08, .57);
          gl_FragColor = vec4(hue * alpha, alpha);
        }`
    };

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        throw new Error('Fluid shader unavailable');
      }
      return shader;
    }
    function createProgram(fragment) {
      const v = compile(gl.VERTEX_SHADER, vertex), f = compile(gl.FRAGMENT_SHADER, shared + fragment);
      const program = gl.createProgram();
      gl.attachShader(program, v); gl.attachShader(program, f);
      gl.linkProgram(program); gl.deleteShader(v); gl.deleteShader(f);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Fluid program unavailable');
      const uniforms = {};
      for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
        const name = gl.getActiveUniform(program, i).name;
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      return {program, uniforms, position:gl.getAttribLocation(program, 'aPosition')};
    }
    const programs = Object.fromEntries(Object.entries(shaders).map(([key, source]) => [key, createProgram(source)]));
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    let resources = [], velocity, dye, pressure, divergence, curl;

    function surface(w, h, filter) {
      const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
      resources.push({texture, framebuffer});
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Fluid buffer unavailable');
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      return {texture, framebuffer, width:w, height:h, x:1/w, y:1/h};
    }
    function pair(w, h, filter) {
      return {read:surface(w,h,filter), write:surface(w,h,filter),
        swap() { const previous = this.read; this.read = this.write; this.write = previous; }};
    }
    function dimensions(shortSide) {
      const aspect = canvas.width / canvas.height;
      return aspect >= 1
        ? [Math.min(2048, Math.round(shortSide * aspect)), shortSide]
        : [shortSide, Math.min(2048, Math.round(shortSide / aspect))];
    }
    function resize() {
      for (const item of resources) { gl.deleteTexture(item.texture); gl.deleteFramebuffer(item.framebuffer); }
      resources = [];
      const sim = dimensions(128), ink = dimensions(linear ? 512 : 384);
      const filter = linear ? gl.LINEAR : gl.NEAREST;
      velocity = pair(sim[0], sim[1], filter);
      dye = pair(ink[0], ink[1], filter);
      pressure = pair(sim[0], sim[1], gl.NEAREST);
      divergence = surface(sim[0], sim[1], gl.NEAREST);
      curl = surface(sim[0], sim[1], gl.NEAREST);
      clear();
    }
    function bind(name, texel) {
      const item = programs[name];
      gl.useProgram(item.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(item.position);
      gl.vertexAttribPointer(item.position, 2, gl.FLOAT, false, 0, 0);
      if (item.uniforms.texelSize && texel) gl.uniform2f(item.uniforms.texelSize, texel.x, texel.y);
      return item.uniforms;
    }
    function texture(target, id) {
      gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, target.texture);
      return id;
    }
    function draw(target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
      gl.viewport(0, 0, target ? target.width : canvas.width, target ? target.height : canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function clear() {
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      for (const item of resources) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, item.framebuffer); gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    function splat(input) {
      const u = bind('splat');
      gl.uniform1f(u.aspect, canvas.width / canvas.height);
      gl.uniform1f(u.radius, .0017 * Math.max(1, canvas.width / canvas.height));
      gl.uniform2f(u.point, input.x, input.y);
      gl.uniform1i(u.target, texture(velocity.read, 0));
      gl.uniform3f(u.color, input.dx, input.dy, 0);
      draw(velocity.write); velocity.swap();
      gl.uniform1i(u.target, texture(dye.read, 0));
      gl.uniform3f(u.color, input.color[0], input.color[1], input.color[2]);
      draw(dye.write); dye.swap();
    }
    function step(dt) {
      gl.disable(gl.BLEND);
      let u = bind('curl', velocity.read);
      gl.uniform1i(u.velocity, texture(velocity.read, 0)); draw(curl);
      u = bind('vorticity', velocity.read);
      gl.uniform1i(u.velocity, texture(velocity.read, 0)); gl.uniform1i(u.curlField, texture(curl, 1));
      gl.uniform1f(u.strength, 28); gl.uniform1f(u.dt, dt);
      draw(velocity.write); velocity.swap();
      u = bind('divergence', velocity.read);
      gl.uniform1i(u.velocity, texture(velocity.read, 0)); draw(divergence);
      u = bind('clear');
      gl.uniform1i(u.target, texture(pressure.read, 0)); gl.uniform1f(u.amount, .8);
      draw(pressure.write); pressure.swap();
      u = bind('pressure', velocity.read);
      gl.uniform1i(u.divergence, texture(divergence, 0));
      for (let i = 0; i < 18; i++) {
        gl.uniform1i(u.pressure, texture(pressure.read, 1)); draw(pressure.write); pressure.swap();
      }
      u = bind('gradient', velocity.read);
      gl.uniform1i(u.pressure, texture(pressure.read, 0)); gl.uniform1i(u.velocity, texture(velocity.read, 1));
      draw(velocity.write); velocity.swap();
      u = bind('advection', velocity.read);
      gl.uniform1i(u.velocity, texture(velocity.read, 0)); gl.uniform1i(u.source, 0);
      if (u.sourceTexel) gl.uniform2f(u.sourceTexel, velocity.read.x, velocity.read.y);
      gl.uniform1f(u.dt, dt); gl.uniform1f(u.dissipation, .35);
      draw(velocity.write); velocity.swap();
      gl.uniform1i(u.velocity, texture(velocity.read, 0)); gl.uniform1i(u.source, texture(dye.read, 1));
      if (u.sourceTexel) gl.uniform2f(u.sourceTexel, dye.read.x, dye.read.y);
      gl.uniform1f(u.dissipation, 1.15);
      draw(dye.write); dye.swap();
    }
    function render() {
      gl.disable(gl.BLEND);
      const u = bind('display', dye.read);
      gl.uniform1i(u.dye, texture(dye.read, 0));
      gl.uniform2f(u.sourceTexel, dye.read.x, dye.read.y);
      draw(null);
    }
    return {resize, clear, splat, step, render};
  }

  function initialize() {
    try {
      renderer = makeRenderer();
      if (renderer) {
        canvas.dataset.fluid = 'webgl';
        resize();
      } else canvas.dataset.fluid = 'unavailable';
    } catch (_) {
      renderer = null;
      canvas.dataset.fluid = 'unavailable';
    }
  }
  function resize() {
    stop();
    if (!renderer) return;
    if (!innerWidth || !innerHeight) return;
    const ratio = Math.min(devicePixelRatio || 1, 1.25, Math.sqrt(2400000 / (innerWidth * innerHeight)));
    canvas.width = Math.max(1, Math.round(innerWidth * ratio));
    canvas.height = Math.max(1, Math.round(innerHeight * ratio));
    try { renderer.resize(); } catch (_) { renderer = null; canvas.dataset.fluid = 'unavailable'; }
  }
  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; lastFrame = 0; pointer = null; touch = null; inputs.length = 0;
    canvas.dataset.fluidActive = 'false';
    if (renderer) renderer.clear();
  }
  function animate(now) {
    frame = 0;
    if (!renderer || !visible() || now - lastInput > 5000) { stop(); return; }
    const dt = lastFrame ? clamp((now - lastFrame) / 1000, .001, .033) : .016;
    lastFrame = now;
    for (const item of inputs.splice(0, 6)) renderer.splat(item);
    renderer.step(dt); renderer.render();
    frame = requestAnimationFrame(animate);
  }
  function add(point, dx, dy, boost = 1) {
    if (!renderer || !visible()) return;
    const phase = .5 + .5 * Math.sin(performance.now() / 2900);
    const color = [(.035 + .09 * phase) * boost, (.30 - .015 * phase) * boost, (.25 - .04 * phase) * boost];
    inputs.push({x:point.x, y:point.y, dx:clamp(dx, -900, 900), dy:clamp(dy, -900, 900), color});
    if (inputs.length > 18) inputs.splice(0, inputs.length - 18);
    lastInput = performance.now();
    canvas.dataset.fluidActive = 'true';
    if (!frame) frame = requestAnimationFrame(animate);
  }
  function move(event) {
    if (!renderer || !visible() || !finePointer.matches || event.pointerType === 'touch') { pointer = null; return; }
    const point = inside(event), now = performance.now();
    if (!point) { pointer = null; return; }
    if (!pointer || now - pointer.time > 250 || Math.hypot(point.x - pointer.x, point.y - pointer.y) > .3) {
      pointer = {...point, time:now}; return;
    }
    const aspect = canvas.width / canvas.height;
    const dx = (point.x - pointer.x) * (aspect < 1 ? aspect : 1) * 6000;
    const dy = (point.y - pointer.y) * (aspect > 1 ? 1 / aspect : 1) * 6000;
    if (Math.hypot(dx, dy) > 1) add(point, dx, dy);
    pointer = {...point, time:now};
  }
  function burst(point) {
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      add({x:point.x + Math.cos(angle) * .01, y:point.y + Math.sin(angle) * .01},
        Math.cos(angle) * 120, Math.sin(angle) * 120, .55);
    }
  }

  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stop(); renderer = null; });
  canvas.addEventListener('webglcontextrestored', initialize);
  initialize();
  window.addEventListener('resize', () => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; resize(); });
  }, {passive:true});
  window.addEventListener('pointermove', move, {passive:true});
  window.addEventListener('pointerout', event => { if (!event.relatedTarget) pointer = null; }, {passive:true});
  window.addEventListener('pointerdown', event => {
    const point = inside(event);
    if (!point || !visible()) return;
    if (event.pointerType === 'touch') touch = {x:event.clientX, y:event.clientY, id:event.pointerId};
    else burst(point);
  }, {passive:true});
  window.addEventListener('pointerup', event => {
    if (!touch || event.pointerId !== touch.id) return;
    const point = inside(event);
    if (point && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < 10) burst(point);
    touch = null;
  }, {passive:true});
  window.addEventListener('pointercancel', () => { touch = null; }, {passive:true});
  window.addEventListener('scroll', () => { pointer = null; if (!visible() && frame) stop(); }, {passive:true});
  document.addEventListener('visibilitychange', () => { if (!visible()) stop(); });
  if (motion.addEventListener) motion.addEventListener('change', () => { if (!visible()) stop(); });
  else motion.addListener(() => { if (!visible()) stop(); });
  if (window.MutationObserver) new MutationObserver(() => { if (!visible()) stop(); })
    .observe(home, {attributes:true, attributeFilter:['class', 'hidden']});
})();
