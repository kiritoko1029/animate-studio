/** Persistence tests do not measure animation. Complete missing JSDOM WAAPI timelines immediately. */
export function installWebAnimations(window) {
  window.Element.prototype.animate = function (_frames, options = {}) {
    const animation = new window.EventTarget();
    let done = false, resolveFinished;
    const finish = () => {
      if (done) return;
      done = true; animation.playState = 'finished'; resolveFinished(animation);
      animation.onfinish?.(new window.Event('finish')); animation.dispatchEvent(new window.Event('finish'));
    };
    Object.assign(animation, {
      currentTime: 0, startTime: 0, playbackRate: 1, playState: 'running', pending: false,
      effect: { getTiming: () => options, getComputedTiming: () => ({ duration: 0, endTime: 0, progress: 1 }), updateTiming() {} },
      finished: new Promise(resolve => { resolveFinished = resolve; }),
      ready: Promise.resolve(animation),
      cancel() { done = true; animation.playState = 'idle'; resolveFinished(animation); },
      finish, play() {}, pause() {}, reverse() {}, commitStyles() {}, persist() {},
    });
    queueMicrotask(finish);
    return animation;
  };
}
