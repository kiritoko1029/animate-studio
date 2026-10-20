import { defineHandler } from 'void';
import { PageStore } from '../../durable-objects/page-store';
import { handleCloudApi } from '../../server/cloud-api.mjs';

const handler = defineHandler(c => handleCloudApi(c.req.raw, workspace => PageStore.get(workspace)));

export { handler as GET, handler as PUT, handler as POST, handler as DELETE, handler as PATCH, handler as OPTIONS };
