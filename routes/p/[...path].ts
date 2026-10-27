import { defineHandler } from 'void';
import { handleCloudPublicPage } from '../../server/cloud-account-api.ts';

const handler = defineHandler(async c => {
  const response = await handleCloudPublicPage(c.req.raw, c.env);
  return response ?? c.notFound();
});
export { handler as GET, handler as HEAD };
