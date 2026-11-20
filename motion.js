// Reveal content once as it enters view; without the observer everything stays visible.
(() => {
  if (!window.matchMedia || !window.IntersectionObserver) return;

  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const seen = new WeakSet();
  const targets = [
    '.overview > div', '.guide-section .section-heading', '.guide-card',
    '.how-copy', '.steps > div', '.ranking-section .section-heading',
    '.leaderboard-wrap', '.honor-heading', '#honor-boards', '.sources-section > div',
    '#guide-view .guide-intro', '#guide-view .guide-chapters', '#guide-view .guide-timeline',
    '#guide-view .guard-notes', '#guide-stages .guide-stage'
  ].join(',');
  let observer;

  function observeTargets() {
    if (!observer) return;
    document.querySelectorAll(targets).forEach(element => {
      if (!seen.has(element)) observer.observe(element);
    });
  }

  function configure() {
    observer?.disconnect();
    observer = null;
    document.querySelectorAll('.motion-enter').forEach(element => element.classList.remove('motion-enter'));
    if (preference.matches) return;
    const activeObserver = new IntersectionObserver(entries => {
      if (observer !== activeObserver || preference.matches) return;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        seen.add(entry.target);
        activeObserver.unobserve(entry.target);
        entry.target.classList.add('motion-enter');
      }
    }, {rootMargin: '0px 0px -6% 0px', threshold: .01});
    observer = activeObserver;
    observeTargets();
  }

  configure();
  if (preference.addEventListener) preference.addEventListener('change', configure);
  else preference.addListener(configure);
  const stages = document.getElementById('guide-stages');
  if (stages && window.MutationObserver) {
    new MutationObserver(observeTargets).observe(stages, {childList: true});
  }
})();
