import { defineHandler } from 'void';
import { PageStore } from '../../durable-objects/page-store';
import { handleCloudApi } from '../../server/cloud-api.mjs';
import { handleCloudAccountApi } from '../../server/cloud-account-api.ts';

const legacyHandler = defineHandler(c => handleCloudApi(c.req.raw, workspace => PageStore.get(workspace)));

const handler = defineHandler(async c => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/auth/') || path.startsWith('/api/account/') || path.startsWith('/api/shared/')) {
    return handleCloudAccountApi(c.req.raw, c.env);
  }
  return legacyHandler(c);
});

export { handler as GET, handler as PUT, handler as POST, handler as DELETE, handler as PATCH, handler as OPTIONS };
