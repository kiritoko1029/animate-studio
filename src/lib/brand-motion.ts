export type BrandPhase = 'idle' | 'loading' | 'ready';

/** Animate only the keyframe; retarget interrupted motion from its visible pose. */
export function createBrandMotion(element: SVGGElement) {
  const document = element.ownerDocument;
  const window = document.defaultView!;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let phase: BrandPhase | undefined;
  let active: Animation | null = null;
  let disposed = false;

  const currentPose = () => window.getComputedStyle(element).transform || 'none';
  function reset() {
    active?.cancel();
    active = null;
    element.style.removeProperty('transform');
  }
  function play(frames: Keyframe[], options: KeyframeAnimationOptions) {
    reset();
    if (disposed || preference.matches || typeof element.animate !== 'function') return;
    const animation = element.animate(frames, { fill: 'forwards', ...options });
    active = animation;
    // A square rotated 90 degrees has its original silhouette, so the resting
    // transform can be cleared without a jump or accumulating quarter turns.
    animation.onfinish = () => { if (active === animation) reset(); };
    if (document.visibilityState === 'hidden') animation.pause();
  }
  function float() {
    play([
      { transform: 'translateY(0)', easing: 'ease-in-out' },
      { transform: 'translateY(-4px)', easing: 'ease-in-out' },
      { transform: 'translateY(0)' },
    ], { duration: 1600, iterations: Infinity });
  }
  function returnToRest() {
    if (disposed || phase === 'loading' || !active) return;
    const from = currentPose();
    play([{ transform: from }, { transform: 'none' }], {
      duration: 180, easing: 'cubic-bezier(.22,1,.36,1)',
    });
  }
  function preferenceChanged() {
    reset();
    if (!preference.matches && phase === 'loading') float();
  }
  function visibilityChanged() {
    if (document.visibilityState === 'hidden') active?.pause();
    else if (active?.playState === 'paused') active.play();
  }
  preference.addEventListener('change', preferenceChanged);
  document.addEventListener('visibilitychange', visibilityChanged);

  return {
    setPhase(next: BrandPhase) {
      if (disposed || next === phase) return;
      const previous = phase;
      phase = next;
      if (next === 'loading') float();
      else if (next === 'ready') {
        const from = previous === 'loading' ? currentPose() : 'translateY(-3px)';
        play([
          { transform: from, offset: 0, easing: 'cubic-bezier(.22,.7,.3,1)' },
          { transform: 'translateY(.8px)', offset: .7, easing: 'ease-out' },
          { transform: 'none', offset: 1 },
        ], { duration: 420 });
      } else reset();
    },
    hover() {
      if (disposed || phase === 'loading' || preference.matches) return;
      const from = currentPose();
      play([
        { transform: from, offset: 0, easing: 'cubic-bezier(.2,.7,.3,1)' },
        { transform: 'translateY(-6px) rotate(90deg)', offset: .5, easing: 'cubic-bezier(.3,0,.6,1)' },
        { transform: 'translateY(.8px) rotate(90deg)', offset: .82, easing: 'ease-out' },
        { transform: 'rotate(90deg)', offset: 1 },
      ], { duration: 480 });
    },
    leave: returnToRest,
    dispose() {
      disposed = true;
      reset();
      preference.removeEventListener('change', preferenceChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
    },
  };
}
