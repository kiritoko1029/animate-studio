export type StoredMedia = { bytes: Uint8Array; mime: string };
export type MediaStorage = {
  put: (key: string, bytes: Uint8Array, mime: string) => Promise<void>;
  get: (key: string) => Promise<StoredMedia | null>;
  remove: (key: string) => Promise<void>;
};
type R2Object = { arrayBuffer: () => Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } };
type R2Bucket = {
  put: (key: string, value: Uint8Array, options: { httpMetadata: { contentType: string }; onlyIf: { etagDoesNotMatch: string } }) => Promise<unknown>;
  get: (key: string) => Promise<R2Object | null>;
  delete: (key: string) => Promise<void>;
};
export function createR2MediaStorage(bucket: R2Bucket | undefined): MediaStorage | null {
  if (!bucket) return null;
  return {
    async put(key, bytes, mime) { await bucket.put(key, bytes, { httpMetadata: { contentType: mime }, onlyIf: { etagDoesNotMatch: '*' } }); },
    async get(key) { const object = await bucket.get(key); return object ? { bytes: new Uint8Array(await object.arrayBuffer()), mime: object.httpMetadata?.contentType ?? 'application/octet-stream' } : null; },
    async remove(key) { await bucket.delete(key); },
  };
}
