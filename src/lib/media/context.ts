import { createContext } from 'react';
import type { MediaAsset } from '../../../shared/media.mjs';
import type { StudioDocument } from '../../model.ts';

export type MediaMigration = { uploaded: number; failed: number };
export type MediaContextValue = {
  kind: 'guest' | 'cloud' | 'shared';
  document: StudioDocument;
  cloudPageId?: string;
  assets: MediaAsset[];
  loading: boolean;
  error: string;
  migrationPending: number;
  resolve: (id: string) => Promise<string>;
  refresh: () => Promise<MediaAsset[]>;
  upload: (file: File) => Promise<MediaAsset>;
  remove: (id: string) => Promise<{ retained: boolean }>;
  migrate: (targetId: string) => Promise<MediaMigration>;
};
export const MediaContext = createContext<MediaContextValue | null>(null);
export type MediaAdapter = {
  kind: MediaContextValue['kind'];
  list: () => Promise<MediaAsset[]>;
  upload: (file: File, id?: string) => Promise<MediaAsset>;
  read: (id: string) => Promise<Blob>;
  remove: (id: string) => Promise<{ retained: boolean }>;
};
