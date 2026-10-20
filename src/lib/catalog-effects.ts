export const catalogEffects = [
  ['none', '无附加动效'], ['auto-height', '自动高度'], ['blur', '模糊渐入'], ['click', '点击反馈'],
  ['effect', '组合入场'], ['fade', '淡入'], ['highlight', '高亮扫过'], ['magnetic', '磁吸跟随'],
  ['particles', '点击粒子'], ['scroll-fade', '滚动渐显'], ['shine', '光泽扫过'], ['slide', '滑入'],
  ['theme-toggler', '点击切换主题'], ['tilt', '悬浮倾斜'], ['zoom', '缩放进入'], ['spring', '弹簧进入'],
  ['page-transition', '页面切换入场'], ['cursor', '光标跟随'],
] as const;
export type CatalogEffect = typeof catalogEffects[number][0];
