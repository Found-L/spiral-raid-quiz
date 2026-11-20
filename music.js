(() => {
  const button = document.getElementById('music-toggle');
  const audio = document.getElementById('background-music');
  if (!button || !audio) return;

  const preferenceKey = 'spiral-temple-quiz-v1:music-enabled';
  const readPreference = () => {
    try { return localStorage.getItem(preferenceKey) !== 'off'; }
    catch { return true; }
  };
  const savePreference = value => {
    try { localStorage.setItem(preferenceKey, value ? 'on' : 'off'); }
    catch { /* The switch still works for this page when storage is unavailable. */ }
  };
  let enabled = readPreference();
  let state = enabled ? 'ready' : 'off';
  let generation = 0;
  audio.volume = 0.08;
  audio.loop = true;

  function render() {
    const active = enabled && ['loading', 'playing', 'suspended'].includes(state);
    button.dataset.state = state;
    button.setAttribute('aria-pressed', String(active));
    button.title = active ? '关闭背景音乐' : state === 'error' ? '音乐暂不可用，点击重试' : '开启背景音乐';
  }

  function startPlayback() {
    if (!enabled || document.hidden) return;
    const attempt = ++generation;
    if (audio.error) {
      audio.removeAttribute('src');
      audio.load();
    }
    if (!audio.getAttribute('src')) audio.setAttribute('src', audio.dataset.src);
    state = 'loading';
    render();
    let result;
    try { result = audio.play(); }
    catch (error) { result = Promise.reject(error); }
    Promise.resolve(result).then(() => {
      if (attempt !== generation) return;
      if (!enabled || document.hidden) { audio.pause(); return; }
      state = 'playing';
      render();
    }).catch(error => {
      if (attempt !== generation) return;
      state = error && error.name === 'NotAllowedError' ? 'ready' : 'error';
      render();
    });
  }

  button.addEventListener('click', () => {
    if (enabled && ['loading', 'playing', 'suspended'].includes(state)) {
      enabled = false;
      ++generation;
      audio.pause();
      state = 'off';
      savePreference(false);
      render();
    } else {
      enabled = true;
      savePreference(true);
      state = 'ready';
      render();
      startPlayback();
    }
  });

  const startOnGesture = event => {
    if (enabled && state === 'ready' && !button.contains(event.target)) startPlayback();
  };
  document.addEventListener('pointerdown', startOnGesture, true);
  document.addEventListener('keydown', startOnGesture, true);
  document.addEventListener('visibilitychange', () => {
    if (!enabled) return;
    if (document.hidden && ['loading', 'playing'].includes(state)) {
      ++generation;
      audio.pause();
      state = 'suspended';
      render();
    } else if (!document.hidden && ['suspended', 'ready'].includes(state)) {
      state = 'ready';
      startPlayback();
    }
  });
  audio.addEventListener('error', () => {
    if (enabled && ['loading', 'playing'].includes(state)) {
      state = 'error';
      render();
    }
  });
  window.addEventListener('storage', event => {
    if (event.key !== preferenceKey) return;
    if (event.newValue === 'off') {
      enabled = false;
      ++generation;
      audio.pause();
      state = 'off';
    } else if (!enabled) {
      enabled = true;
      state = 'ready';
    }
    render();
  });

  render();
  if (enabled) startPlayback();
})();
