import controls from './official-animation-controls.json' with { type: 'json' };

export const officialAnimationControls = controls;

export function validateAnimationSettings(type, settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings) || Object.getPrototypeOf(settings) !== Object.prototype) throw new Error('动效设置必须为普通对象');
  const fields = Object.fromEntries(Object.entries(controls[type]?.groups ?? {}).flatMap(([group, entries]) => Object.entries(entries).map(([key, field]) => [`${group}.${key}`, field])));
  for (const [key, value] of Object.entries(settings)) {
    const field = Object.hasOwn(fields, key) ? fields[key] : undefined;
    if (!field) throw new Error(`不支持的官方动效设置：${key}`);
    if (field.options) {
      if (!Object.values(field.options).includes(value)) throw new Error(`${key} 的选项无效`);
    } else if (typeof field.value === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < (field.min ?? -10000) || value > (field.max ?? 100000) || field.step === 1 && !Number.isInteger(value)) throw new Error(`${key} 的数值超出范围`);
    } else if (typeof value !== typeof field.value || typeof value === 'string' && value.length > 200) throw new Error(`${key} 的值无效`);
  }
}

/** Defaults are copied from the pinned official demo's controls, not guessed platform timings. */
export function officialAnimationProps(type, group, settings = {}) {
  return Object.fromEntries(Object.entries(controls[type]?.groups[group] ?? {}).map(([key, field]) => [key, Object.hasOwn(settings, `${group}.${key}`) ? settings[`${group}.${key}`] : field.value]));
}
