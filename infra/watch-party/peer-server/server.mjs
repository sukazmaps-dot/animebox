import { PeerServer } from 'peer';

const port = Number(process.env.PORT || 9000);
const path = process.env.PEER_PATH || '/peerjs';
const key = process.env.PEER_KEY || 'animebox';

const peerServer = PeerServer({
  port,
  path,
  key,
  proxied: process.env.PEER_PROXIED !== 'false',
  allow_discovery: false,
  alive_timeout: 60_000,
  expire_timeout: 5_000,
});

peerServer.on('connection', (client) => {
  console.log('[PeerServer] connected', client.getId());
});

peerServer.on('disconnect', (client) => {
  console.log('[PeerServer] disconnected', client.getId());
});

console.log(`[PeerServer] listening on :${port}${path} key=${key}`);
