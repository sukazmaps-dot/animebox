const ts = require('typescript');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const script = ts.transpileModule(fs.readFileSync('lib/home-watch-room-policy.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
new Function('module', 'exports', script)(mod, mod.exports);
const { selectHomeWatchRooms, isHomePublicWatchRoom } = mod.exports;
const room = (key, animeId, status, participants) => ({
  roomId: key.repeat(24), roomCode: 'ABC234', animeId, animeTitle: 'Anime', coverUrl: null,
  episode: 1, visibility: 'public', status, participantCount: participants, maxParticipants: 50,
  isFull: false, host: { username: 'Host' },
});
const rows = [room('a', 1, 'waiting', 2), room('b', 2, 'watching', 1),
  room('c', 3, 'watching', 5), room('d', 4, 'waiting', 3)];
const original = JSON.stringify(rows);
assert.deepEqual(selectHomeWatchRooms(rows, [1]).map(x => x.roomId), ['a', 'c', 'b'].map(x => x.repeat(24)));
assert.deepEqual(selectHomeWatchRooms(rows, []).map(x => x.roomId), ['c', 'b', 'd'].map(x => x.repeat(24)));
assert.equal(JSON.stringify(rows), original, 'selection cannot mutate cached responses');
assert.deepEqual(selectHomeWatchRooms(null, []), []);
assert.equal(selectHomeWatchRooms([rows[0], rows[0]], []).length, 1);
assert.equal(isHomePublicWatchRoom({ ...rows[0], isFull: true }), false);
assert.equal(isHomePublicWatchRoom({ ...rows[0], visibility: 'private' }), false);
assert.equal(isHomePublicWatchRoom({ ...rows[0], roomId: 'invalid' }), false);
assert.equal(isHomePublicWatchRoom({ ...rows[0], participantCount: 50 }), false);
const shell = fs.readFileSync('components/home/HomePageShell.tsx', 'utf8');
const old = fs.readFileSync('components/HomeRetentionHub.tsx', 'utf8');
const hero = fs.readFileSync('components/HomeHeroCarousel.tsx', 'utf8');
const lobby = fs.readFileSync('components/home/HomeWatchTogetherLobby.tsx', 'utf8');
const deferred = fs.readFileSync('components/home/HomeWatchTogetherDeferred.tsx', 'utf8');
assert(shell.indexOf('<HomeHeroSection />') < shell.indexOf('<HomeWatchTogetherSection />'));
assert(shell.indexOf('<HomeDiscoverySection />') < shell.indexOf('<HomeCatalogSections />'));
assert(shell.indexOf('<HomeCatalogSections />') < shell.indexOf('<HomeWatchTogetherSection />'));
assert(!old.includes("fetch('/api/watch-party/rooms"), 'legacy duplicate rooms fetch removed');
assert(!lobby.includes('<iframe') && !lobby.includes("from 'peerjs'"), 'homepage must remain video-free');
assert(lobby.includes('/api/watch-party/rooms/resolve?roomId='), 'join resolves secret only on click');
assert(lobby.includes("intent: 'watch_party'"), 'guest entry supports authentication');
assert(deferred.includes('DeferredMount') && deferred.includes('ssr: false'), 'heavy lobby is deferred');
assert(hero.includes('href="/watch-together"'), 'hero links to main USP');
console.log('Patch 29 social homepage: selection, safe join, lazy lobby, guest and ordering PASS.');
