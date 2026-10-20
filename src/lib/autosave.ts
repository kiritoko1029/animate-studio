export type AutosaveState = 'pending' | 'saving' | 'saved' | 'error';

type AutosaveOptions<T> = {
  write: (value: T) => Promise<unknown>;
  onState: (state: AutosaveState, error?: unknown) => void;
  delay?: number;
  initialSaved?: T;
};

type Snapshot<T> = { value: T; key: string | undefined };

/**
 * Autosave for JSON-compatible documents. Only the latest desired document is
 * retained. Edits are debounced until a write starts; edits during that write
 * are coalesced and committed immediately afterward, one request at a time.
 */
export function createAutosave<T>(options: AutosaveOptions<T>) {
  const { write, onState, delay = 700 } = options;
  const snapshot = (value: T): Snapshot<T> => ({ value: structuredClone(value), key: JSON.stringify(value) });
  let hasSaved = Object.hasOwn(options, 'initialSaved');
  let savedKey = hasSaved ? JSON.stringify(options.initialSaved) : undefined;
  let desired = hasSaved ? snapshot(options.initialSaved as T) : undefined;
  let active: Snapshot<T> | undefined;
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let stoppedOnError = false;
  // A rejected request may have committed on the server before its response
  // was lost. Retrying must write even if the desired value matches savedKey.
  let uncertain = false;

  function isDirty() {
    return !!desired && (uncertain || !hasSaved || desired.key !== savedKey || (!!active && active.key !== desired.key));
  }

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function emit(state: AutosaveState, error?: unknown) {
    if (!disposed) onState(state, error);
  }

  async function drain() {
    if (desired && !isDirty()) emit('saved');
    while (!disposed && desired && isDirty()) {
      const attempt = desired;
      active = attempt;
      emit('saving');
      try {
        await write(attempt.value);
        hasSaved = true;
        savedKey = attempt.key;
        uncertain = false;
        active = undefined;
        if (disposed) return;
        emit(isDirty() ? 'pending' : 'saved');
      } catch (error) {
        active = undefined;
        uncertain = true;
        stoppedOnError = true;
        emit('error', error);
        // Keep the latest desired document for an explicit flush or new edit.
        return;
      }
    }
  }

  function flush(): Promise<void> {
    clearTimer();
    if (disposed) return Promise.resolve();
    stoppedOnError = false;
    if (running) return running;
    if (!desired || !isDirty()) {
      if (desired) emit('saved');
      return Promise.resolve();
    }
    // Deferring drain one microtask assigns running before callbacks can cause
    // a reentrant flush, and lets synchronous edits collapse into one write.
    running = Promise.resolve().then(drain).finally(() => {
      running = undefined;
      // A new schedule can arrive between drain completing and this finalizer.
      // It must not be stranded simply because running was still assigned.
      if (!disposed && isDirty() && !stoppedOnError) void flush();
    });
    return running;
  }

  function schedule(value: T) {
    if (disposed) return;
    stoppedOnError = false;
    desired = snapshot(value);
    clearTimer();
    if (!isDirty()) {
      emit('saved');
      return;
    }
    emit('pending');
    if (!running) timer = setTimeout(() => { timer = undefined; void flush(); }, delay);
  }

  function dispose() {
    disposed = true;
    clearTimer();
  }

  return { schedule, flush, dispose, isDirty };
}
