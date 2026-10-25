/** Library organization is metadata; folders never enter component definitions or page snapshots. */
export const componentFolderLimits = Object.freeze({ name: 60, perLibrary: 50 });

export function validateComponentFolderName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > componentFolderLimits.name) {
    throw new Error(`文件夹名称须为 1–${componentFolderLimits.name} 个字符。`);
  }
  return value.trim();
}
