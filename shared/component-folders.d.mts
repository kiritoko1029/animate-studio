export type ComponentFolder = { id: string; name: string; createdAt: string; updatedAt: string };
export const componentFolderLimits: Readonly<{ name: 60; perLibrary: 50 }>;
export function validateComponentFolderName(value: unknown): string;
