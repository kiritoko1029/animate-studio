/** Self-contained: serialized into HTML/Vue/React exports without extra runtime packages. */
export function mountCatalogFeatures(root: HTMLElement) {
  const cleanups: Array<() => void> = [];
  const animations = new Set<Animation>();
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced = () => media?.matches ?? false;
  const all = (selector: string) => Array.from(root.querySelectorAll<HTMLElement>(selector));
  const on = (target: EventTarget, type: string, fn: EventListener, options?: AddEventListenerOptions) => { target.addEventListener(type, fn, options); cleanups.push(() => target.removeEventListener(type, fn, options)); };
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => { const timer = setTimeout(() => { timeouts.delete(timer); fn(); }, ms); timeouts.add(timer); return timer; };
  const animate = (el: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions = {}) => {
    if (reduced() || !el.animate) return;
    const animation = el.animate(frames, { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)', ...options });
    animations.add(animation);
    animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
  };
  function popup(box: HTMLElement, open: boolean, anchor?: HTMLElement) {
    if (open) {
      if (box.showPopover) { if (!box.matches(':popover-open')) box.showPopover(); }
      else box.hidden = false;
      if (anchor && !box.classList.contains('as-page-catalog-toast')) {
        const a = anchor.getBoundingClientRect(), rect = box.getBoundingClientRect();
        box.style.left = Math.max(12, Math.min(a.left, innerWidth - rect.width - 12)) + 'px';
        const style = getComputedStyle(root), top = parseFloat(style.getPropertyValue('--catalog-vtop')) || 0, height = parseFloat(style.getPropertyValue('--catalog-vheight')) || innerHeight;
        box.style.maxHeight = Math.max(80, height - 24) + 'px';
        box.style.top = Math.max(top + 12, Math.min(a.bottom + 8, top + height - rect.height - 12)) + 'px';
      }
      animate(box, [{ opacity: 0, transform: 'translateY(-6px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 180 });
    } else if (box.hidePopover) { if (box.matches(':popover-open')) box.hidePopover(); }
    else box.hidden = true;
    anchor?.setAttribute('aria-expanded', String(open));
  }
  function theme() {
    const dark = root.dataset.catalogScheme !== 'dark';
    root.dataset.catalogScheme = dark ? 'dark' : 'light';
    root.style.colorScheme = dark ? 'dark' : 'light';
    all('[data-catalog-action="theme"] .as-page-catalog-status').forEach(el => el.textContent = dark ? '深色主题' : '浅色主题');
  }
  const toastTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  on(root, 'click', event => {
    const target = (event.target as Element).closest<HTMLElement>('[data-catalog-action]');
    if (!target || !root.contains(target) || target.closest('[inert]')) return;
    const host = target.closest<HTMLElement>('[data-catalog]');
    if (!host) return;
    const action = target.dataset.catalogAction;
    if (['close-dialog', 'confirm-dialog', 'close-toast'].includes(action || '')) event.stopPropagation();
    if (action === 'open-dialog') {
      const dialog = host.querySelector<HTMLDialogElement>('dialog');
      if (dialog && !dialog.open) { dialog.showModal(); animate(dialog, [{ opacity: 0, transform: 'translateY(16px) scale(.97)' }, { opacity: 1, transform: 'none' }]); }
    } else if (action === 'close-dialog' || action === 'confirm-dialog') {
      host.querySelector<HTMLDialogElement>('dialog')?.close();
      const status = host.querySelector<HTMLElement>('[role=status]');
      if (status && action === 'confirm-dialog') status.textContent = '已确认';
    } else if (action === 'open-popover') {
      const box = host.querySelector<HTMLElement>('[popover]');
      if (box) popup(box, target.getAttribute('aria-expanded') !== 'true', target);
    } else if (action === 'toast') {
      const box = host.querySelector<HTMLElement>('[popover]');
      if (box) { const timer = toastTimers.get(box); if (timer) { clearTimeout(timer); timeouts.delete(timer); } popup(box, true); toastTimers.set(box, later(() => popup(box, false), Math.max(500, Number(box.dataset.duration) || 3000))); }
    } else if (action === 'close-toast') { const box = target.closest<HTMLElement>('[popover]'); if (box) popup(box, false); }
    else if (action === 'theme') theme();
    else if (action === 'question-nav') later(() => { const next = host.querySelector<HTMLElement>('fieldset:not([hidden]) input, [role=status]:not([hidden])'); if (next) { if (!next.matches('input')) next.tabIndex = -1; next.focus(); } }, 0);
    else if (action === 'copy') {
      const text = target.dataset.copyText ?? host.querySelector('code')?.textContent ?? '';
      const status = host.querySelector<HTMLElement>('[role=status]');
      if (!navigator.clipboard?.writeText) { if (status) status.textContent = '当前环境不支持复制，请手动选择文字'; return; }
      navigator.clipboard.writeText(text).then(() => { if (root.isConnected && status) status.textContent = '已复制'; }, () => { if (root.isConnected && status) status.textContent = '复制失败，请手动选择文字'; });
    }
  });
  for (const box of all('[popover]')) {
    const host = box.closest<HTMLElement>('[data-catalog]');
    const trigger = host?.querySelector<HTMLElement>('[data-catalog-action="open-popover"]');
    if (!box.showPopover) box.hidden = true;
    on(box, 'toggle', ((event: Event & { newState?: string }) => trigger?.setAttribute('aria-expanded', String(event.newState === 'open'))) as EventListener);
    if (host && trigger && ['hoverCard', 'tooltip', 'previewLinkCard'].includes(host.dataset.catalog || '')) {
      on(trigger, 'pointerenter', () => popup(box, true, trigger));
      on(host, 'pointerleave', () => popup(box, false, trigger));
      on(trigger, 'focus', () => popup(box, true, trigger));
      on(host, 'focusout', event => { if (!host.contains((event as FocusEvent).relatedTarget as Node)) popup(box, false, trigger); });
    }
    if (host && trigger && host.dataset.catalog === 'contextMenu') {
      on(host, 'contextmenu', event => { event.preventDefault(); popup(box, true, trigger); });
      on(trigger, 'keydown', event => { const e = event as KeyboardEvent; if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); popup(box, true, trigger); } });
    }
    on(box, 'keydown', event => { const e = event as KeyboardEvent; if (e.key === 'Escape') { popup(box, false, trigger ?? undefined); trigger?.focus(); } });
    cleanups.push(() => { if (box.hidePopover && box.matches(':popover-open')) box.hidePopover(); });
  }
  for (const dialog of all('.as-page-catalog-dialog')) {
    on(dialog, 'click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); const e = event as MouseEvent; if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) (dialog as HTMLDialogElement).close(); } });
    on(dialog, 'keydown', event => event.stopPropagation());
    cleanups.push(() => { if ((dialog as HTMLDialogElement).open) (dialog as HTMLDialogElement).close(); });
  }
  for (const text of all('[data-text-effect]')) {
    const effect = text.dataset.textEffect || '', duration = Number(text.dataset.duration) || 1800;
    if (text.dataset.textItems) {
      let items: string[] = [];
      try { items = JSON.parse(text.dataset.textItems); } catch { /* Authoring always serializes an array. */ }
      let index = 0;
      if (!reduced() && items.length > 1) {
        const timer = setInterval(() => {
          if (document.hidden || reduced()) return;
          index = (index + 1) % items.length; text.textContent = items[index];
          animate(text, effect === 'morphingText' ? [{ filter: 'blur(12px)', opacity: 0 }, { filter: 'blur(0)', opacity: 1 }] : effect === 'rotatingText' ? [{ transform: 'rotateX(90deg)', opacity: 0 }, { transform: 'rotateX(0)', opacity: 1 }] : [{ transform: 'translateY(60%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: Math.min(650, duration / 2) });
        }, duration); cleanups.push(() => clearInterval(timer));
      }
    } else if (['typingText', 'splittingText', 'slidingText', 'rollingText'].includes(effect) && !reduced()) {
      const value = text.querySelector<HTMLElement>('[data-text-value]');
      if (!value) continue;
      const overlay = document.createElement('span'); overlay.setAttribute('aria-hidden', 'true'); overlay.className = 'as-page-text-overlay'; text.append(overlay);
      let reveal: ReturnType<typeof setTimeout> | undefined;
      const run = () => {
        if (reveal) { clearTimeout(reveal); timeouts.delete(reveal); }
        const original = value.textContent || '';
        if (reduced()) { overlay.hidden = true; value.style.opacity = ''; return; }
        value.style.opacity = '0'; overlay.hidden = false;
        overlay.replaceChildren(...Array.from(original).map((char, i) => {
          const span = document.createElement('span'); span.textContent = char; span.style.display = 'inline-block'; span.style.whiteSpace = 'pre';
          const frames = effect === 'typingText' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: effect === 'rollingText' ? 'rotateX(-90deg)' : effect === 'slidingText' ? 'translateX(14px)' : 'translateY(18px)' }, { opacity: 1, transform: 'none' }];
          animate(span, frames, { duration: effect === 'typingText' ? 1 : 400, delay: i * Math.min(120, duration / Math.max(1, original.length)), fill: 'backwards' }); return span;
        }));
        reveal = later(() => { overlay.hidden = true; value.style.opacity = ''; }, duration + 450);
      };
      const observer = new MutationObserver(run); observer.observe(value, { childList: true, characterData: true, subtree: true }); run();
      cleanups.push(() => { observer.disconnect(); overlay.remove(); value.style.opacity = ''; });
    }
  }
  for (const number of all('[data-catalog-number]')) {
    if (reduced()) continue;
    const valueNode = number.querySelector<HTMLElement>('[data-number-value]');
    if (!valueNode) continue;
    const overlay = document.createElement('span'); overlay.setAttribute('aria-hidden', 'true'); overlay.className = 'as-page-number-overlay'; number.append(overlay);
    let frame = 0, previous = 0;
    const run = () => {
      cancelAnimationFrame(frame); const target = Number(valueNode.textContent) || 0, start = performance.now(), from = previous; previous = target;
      if (reduced()) return;
      valueNode.style.opacity = '0'; overlay.hidden = false;
      const tick = (time: number) => { const progress = Math.min(1, (time - start) / (Number(number.dataset.duration) || 1600)); overlay.textContent = Math.round(from + (target - from) * (1 - (1 - progress) ** 3)).toLocaleString(); if (progress < 1) frame = requestAnimationFrame(tick); else { valueNode.style.opacity = ''; overlay.hidden = true; } };
      frame = requestAnimationFrame(tick);
      animate(number, number.dataset.catalogNumber === 'slidingNumber' ? [{ transform: 'translateY(8px)' }, { transform: 'none' }] : number.dataset.catalogNumber === 'scrollingNumber' ? [{ filter: 'blur(3px)' }, { filter: 'none' }] : [{ opacity: .6 }, { opacity: 1 }]);
    };
    const observer = new MutationObserver(run); observer.observe(valueNode, { childList: true, characterData: true, subtree: true }); run();
    cleanups.push(() => { observer.disconnect(); cancelAnimationFrame(frame); overlay.remove(); valueNode.style.opacity = ''; });
  }
  const bars = all('[data-catalog-scroll]');
  if (bars.length) {
    const update = () => { const doc = document.scrollingElement || document.documentElement; const span = doc.scrollHeight - doc.clientHeight; bars.forEach(el => (el as HTMLProgressElement).value = span > 0 ? doc.scrollTop / span * 100 : 100); };
    on(window, 'scroll', update, { passive: true }); on(window, 'resize', update); update();
  }
  for (const link of all('[data-github-url]')) {
    const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/.exec(link.dataset.githubUrl || '');
    if (!match || !window.fetch) continue;
    const controller = new AbortController();
    window.fetch('https://api.github.com/repos/' + match[1] + '/' + match[2], { signal: controller.signal }).then(response => response.ok ? response.json() : null).then(data => { const count = link.querySelector('[data-github-count]'); if (count && data && Number.isFinite(data.stargazers_count) && root.isConnected) count.textContent = Number(data.stargazers_count).toLocaleString(); }).catch(() => {});
    cleanups.push(() => controller.abort());
  }
  for (const block of all('[data-catalog-effect]:not([data-catalog-effect="none"])')) {
    const effect = block.dataset.catalogEffect;
    if (['magnetic', 'tilt', 'cursor'].includes(effect || '') && !reduced()) {
      on(block, 'pointermove', event => { if (reduced()) return; const e = event as PointerEvent, rect = block.getBoundingClientRect(); const x = (e.clientX - rect.left) / Math.max(1, rect.width) - .5, y = (e.clientY - rect.top) / Math.max(1, rect.height) - .5; block.style.setProperty('--pointer-x', `${(x + .5) * 100}%`); block.style.setProperty('--pointer-y', `${(y + .5) * 100}%`); if (effect !== 'cursor') block.style.transform = effect === 'tilt' ? `perspective(700px) rotateX(${-y * 12}deg) rotateY(${x * 12}deg)` : `translate(${x * 12}px, ${y * 12}px)`; });
      on(block, 'pointerleave', () => { block.style.transform = ''; });
    }
    if (effect === 'click' || effect === 'particles' || effect === 'theme-toggler') on(block, 'click', () => {
      if (effect === 'theme-toggler') { theme(); return; }
      animate(block, [{ transform: 'scale(1)' }, { transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: 260 });
      if (effect === 'particles' && !reduced()) for (let i = 0; i < 10; i++) { const dot = document.createElement('i'); dot.className = 'as-page-click-particle'; block.append(dot); animate(dot, [{ transform: 'translate(-50%,-50%)', opacity: 1 }, { transform: `translate(${Math.cos(i * .628) * 90}px,${Math.sin(i * .628) * 90}px)`, opacity: 0 }], { duration: 550 }); later(() => dot.remove(), 560); }
    });
    if (effect === 'auto-height' && typeof ResizeObserver !== 'undefined') {
      const content = block.querySelector<HTMLElement>('.as-page-block-content');
      if (content) {
        const priorHeight = block.style.height, priorMin = content.style.minHeight;
        content.style.minHeight = '0';
        const measure = () => { block.style.height = Math.max(32, content.scrollHeight) + 'px'; };
        const observer = new ResizeObserver(measure); observer.observe(content); measure();
        cleanups.push(() => { observer.disconnect(); block.style.height = priorHeight; content.style.minHeight = priorMin; });
      }
    }
    if (effect === 'scroll-fade' && typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) { animate(block, [{ opacity: 0 }, { opacity: 1 }], { duration: 700 }); observer.disconnect(); } }); observer.observe(block); cleanups.push(() => observer.disconnect());
    }
    cleanups.push(() => { block.style.transform = ''; block.querySelectorAll('.as-page-click-particle').forEach(node => node.remove()); });
  }
  return () => { animations.forEach(animation => animation.cancel()); cleanups.reverse().forEach(dispose => dispose()); timeouts.forEach(timer => clearTimeout(timer)); };
}
