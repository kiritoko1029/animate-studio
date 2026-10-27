import { connect } from 'cloudflare:sockets';
import { fetchSocket, type DataConnection } from './data-socket.ts';

export function fetchCloudData(connection: DataConnection): Promise<Response> {
  return fetchSocket(connection, connect);
}
