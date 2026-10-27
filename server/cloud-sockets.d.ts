declare module 'cloudflare:sockets' {
  export const connect: import('./data-socket').SocketConnector;
}
