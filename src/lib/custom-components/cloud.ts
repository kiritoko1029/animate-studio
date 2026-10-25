import type { CustomComponentDefinition } from '../../../shared/custom-components.mjs';
import type { ComponentFolder } from '../../../shared/component-folders.mjs';
import { AccountApiError, accountApi } from '../account-api.ts';

/** Account component records as returned by /api/account/components. */
export type CloudComponentSummary = {
  id: string; name: string; description: string; revision: number;
  createdAt: string; updatedAt: string;
  folderId: string | null;
  shareToken: string | null; publishedAt: string | null; sharedRevision: number | null;
};
export type CloudComponentRecord = CloudComponentSummary & { component: CustomComponentDefinition };
export type SharedComponent = { component: CustomComponentDefinition; publishedAt: string; revision: number };
export type ShareState = { token: string; publishedAt: string; revision: number };

export class CloudConflictError extends Error {
  revision: number | null;
  constructor(message: string, revision: number | null) { super(message); this.revision = revision; }
}

export const cloudComponentsPath = '/api/account/components';
export const cloudComponentPath = (id: string) => `${cloudComponentsPath}/${encodeURIComponent(id)}`;
export const sharedComponentPath = (token: string) => `/api/shared/components/${encodeURIComponent(token)}`;
export const componentShareUrl = (token: string) => `${window.location.origin}/c/${encodeURIComponent(token)}`;

export const listCloudComponents = (signal?: AbortSignal) => accountApi<{ components: CloudComponentSummary[] }>(cloudComponentsPath, { signal }).then(result => result.components);
export const getCloudComponent = (id: string, signal?: AbortSignal) => accountApi<CloudComponentRecord>(cloudComponentPath(id), { signal });
export const createCloudComponent = (component: CustomComponentDefinition, folderId?: string | null) => accountApi<CloudComponentRecord>(cloudComponentsPath, { method: 'POST', body: { component, ...(folderId === undefined ? {} : { folderId }) } });
export const deleteCloudComponent = (id: string) => accountApi<void>(cloudComponentPath(id), { method: 'DELETE' });
export const publishCloudComponent = (id: string) => accountApi<ShareState>(`${cloudComponentPath(id)}/share`, { method: 'POST', body: {} });
export const unpublishCloudComponent = (id: string) => accountApi<void>(`${cloudComponentPath(id)}/share`, { method: 'DELETE' });
export const readSharedComponent = (token: string, signal?: AbortSignal) => accountApi<SharedComponent>(sharedComponentPath(token), { signal });

const foldersPath = '/api/account/component-folders';
export const listCloudFolders = (signal?: AbortSignal) => accountApi<{ folders: ComponentFolder[] }>(foldersPath, { signal }).then(result => result.folders);
export const createCloudFolder = (name: string) => accountApi<ComponentFolder>(foldersPath, { method: 'POST', body: { name } });
export const renameCloudFolder = (id: string, name: string) => accountApi<ComponentFolder>(`${foldersPath}/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name } });
export const deleteCloudFolder = (id: string) => accountApi<void>(`${foldersPath}/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const moveCloudComponent = (id: string, folderId: string | null) => accountApi<CloudComponentRecord>(`${cloudComponentPath(id)}/folder`, { method: 'PATCH', body: { folderId } });

/** Saves only when the account copy is still at `baseRevision`; otherwise throws CloudConflictError. */
export async function updateCloudComponent(id: string, component: CustomComponentDefinition, baseRevision: number) {
  try {
    return await accountApi<CloudComponentRecord>(cloudComponentPath(id), { method: 'PUT', body: { component, baseRevision } });
  } catch (error) {
    if (error instanceof AccountApiError && error.status === 409) throw new CloudConflictError(error.message, null);
    throw error;
  }
}
