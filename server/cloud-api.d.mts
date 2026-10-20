import type { PageDocument } from '../src/model';

type PageRecord = { page: PageDocument | null; savedAt: string | null };
type PageStore = { read(): Promise<PageRecord>; save(page: PageDocument): Promise<PageRecord> };
export function handleCloudApi(request: Request, getStore: (workspace: string) => PageStore): Promise<Response>;
