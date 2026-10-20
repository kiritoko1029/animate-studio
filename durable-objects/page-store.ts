import { defineDurableState } from 'void/durable';
import { validatePage } from '../server/validation.mjs';
import type { PageDocument } from '../src/model';

type PageRecord = { page: PageDocument | null; savedAt: string | null };

// The resource name and browser workspace IDs must stay stable across deploys.
export const PageStore = defineDurableState({
  name: 'page-store',
  initialState: { page: null, savedAt: null } as PageRecord,
  methods: {
    read(context) {
      return context.state;
    },
    save(context, page: PageDocument) {
      context.state = { page: validatePage(page), savedAt: new Date().toISOString() };
      return context.state;
    },
  },
});

export default PageStore;
