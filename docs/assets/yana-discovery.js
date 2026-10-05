// The tour is a prepared example. These states never perform file or network I/O.
export const createDiscoveryState = () => ({ step: 0, decision: null, humanApproved: false });

export function transitionDiscovery(state, action) {
  const resolved = state.decision === 'allow' || state.decision === 'deny';
  if (action.type === 'reset') return createDiscoveryState();
  if (action.type === 'decision' && state.step === 2 && ['allow', 'ask', 'deny'].includes(action.value)) {
    return { ...state, decision: action.value, humanApproved: false };
  }
  if (action.type === 'confirm' && state.step === 2 && state.decision === 'ask') {
    return { ...state, decision: 'allow', humanApproved: true };
  }
  if (action.type === 'next' && state.step < 4 && (state.step !== 2 || resolved)) {
    return { ...state, step: state.step + 1 };
  }
  const target = action.type === 'back' ? state.step - 1 : action.type === 'visit' ? action.step : -1;
  if (Number.isInteger(target) && target >= 0 && target < state.step) {
    return target <= 2 ? { step: target, decision: null, humanApproved: false } : { ...state, step: target };
  }
  return state;
}

function mountDiscovery(root) {
  const copy = JSON.parse(root.querySelector('[data-discovery-copy]').textContent);
  const panels = [...root.querySelectorAll('[data-discovery-panel]')];
  const steps = [...root.querySelectorAll('[data-discovery-step]')];
  const decisions = [...root.querySelectorAll('button[data-decision]')];
  const next = root.querySelector('[data-discovery-next]');
  const back = root.querySelector('[data-discovery-back]');
  const confirm = root.querySelector('[data-discovery-confirm]');
  const live = root.querySelector('[data-discovery-live]');
  const controls = root.querySelector('[data-discovery-controls]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new AbortController();
  let state = createDiscoveryState();
  let animation;

  const settleMotion = () => {
    animation?.kill();
    animation = null;
    root.querySelectorAll('[data-discovery-animate]').forEach(element => {
      element.style.removeProperty('transform');
      element.style.removeProperty('opacity');
    });
  };

  const render = (changedStep = false) => {
    settleMotion();
    panels.forEach((panel, index) => { panel.hidden = index !== state.step; });
    steps.forEach((button, index) => {
      button.disabled = index > state.step;
      if (index === state.step) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    decisions.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.decision === state.decision)));
    back.disabled = state.step === 0;
    next.hidden = state.step === 4;
    next.disabled = state.step === 2 && !['allow', 'deny'].includes(state.decision);
    next.textContent = copy.next[state.step] || copy.next[0];
    confirm.hidden = state.decision !== 'ask';
    root.dataset.state = state.decision || 'ready';
    root.dataset.step = String(state.step);
    root.querySelector('[data-discovery-count]').textContent = `${String(state.step + 1).padStart(2, '0')} / 05`;
    const outcome = state.humanApproved ? 'confirmed' : state.decision || 'ready';
    root.querySelector('[data-discovery-status]').textContent = copy.status[outcome];
    root.querySelector('[data-discovery-status-detail]').textContent = copy.detail[outcome];
    root.querySelectorAll('[data-result-allowed]').forEach(item => { item.hidden = state.decision !== 'allow'; });
    root.querySelectorAll('[data-result-denied]').forEach(item => { item.hidden = state.decision !== 'deny'; });
    root.querySelector('[data-receipt-decision]').textContent = copy.status[outcome];
    root.querySelector('[data-receipt-outcome]').textContent = state.decision === 'allow' ? copy.changed : copy.unchanged;
    const stepLabel = steps[state.step].querySelector('span').textContent.trim();
    live.textContent = `${copy.step} ${state.step + 1} / 5. ${stepLabel}. ${state.step >= 2 ? copy.detail[outcome] : ''}`;

    if (changedStep) {
      const panel = panels[state.step];
      const heading = panel.querySelector('h3');
      heading.focus({ preventScroll: true });
      if (!motion.matches && !document.hidden && window.gsap) {
        animation = window.gsap.fromTo(panels[state.step].querySelectorAll('[data-discovery-animate]'),
          { x: -16, y: 10, rotationY: -5, opacity: 0, scale: .98 },
          { x: 0, y: 0, rotationY: 0, opacity: 1, scale: 1, duration: .6, stagger: .07, ease: 'power3.out', clearProps: 'transform,opacity' }
        );
      }
      // Panel reflow changes the coordinates of the existing page scroll scenes.
      window.ScrollTrigger?.refresh();
      window.dispatchEvent(new Event('yana:discovery-resize'));
      const bounds = heading.getBoundingClientRect();
      // On phones the controls are below the panel. Return to its new content.
      if (bounds.top < 96 || bounds.bottom > window.innerHeight - 48) {
        panel.scrollIntoView({ block: 'start', behavior: motion.matches ? 'instant' : 'smooth' });
      }
    }
  };

  const dispatch = action => {
    const previous = state;
    state = transitionDiscovery(state, action);
    if (state !== previous) {
      render(state.step !== previous.step);
      // Confirmation removes its button; keep keyboard focus on the next action.
      if (action.type === 'confirm') next.focus({ preventScroll: true });
    }
  };
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button) || button.disabled) return;
    if (button.hasAttribute('data-discovery-next')) dispatch({ type: 'next' });
    else if (button.hasAttribute('data-discovery-back')) dispatch({ type: 'back' });
    else if (button.hasAttribute('data-discovery-reset')) dispatch({ type: 'reset' });
    else if (button.hasAttribute('data-discovery-confirm')) dispatch({ type: 'confirm' });
    else if (button.hasAttribute('data-decision')) dispatch({ type: 'decision', value: button.dataset.decision });
    else if (button.hasAttribute('data-discovery-step')) dispatch({ type: 'visit', step: Number(button.dataset.discoveryStep) });
  }, { signal: listeners.signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) settleMotion(); }, { signal: listeners.signal });
  motion.addEventListener('change', settleMotion, { signal: listeners.signal });
  window.addEventListener('pagehide', event => {
    settleMotion();
    if (!event.persisted) listeners.abort();
  }, { signal: listeners.signal });
  controls.hidden = false;
  root.classList.add('is-enhanced');
  render();
}

if (typeof document !== 'undefined') {
  document.querySelectorAll('[data-guided-discovery]').forEach(mountDiscovery);
}
