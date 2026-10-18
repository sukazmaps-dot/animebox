import { request } from 'node:https';
import { lookup } from 'node:dns';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

/** Fail closed for private, special-use and IPv4-mapped IPv6 DNS answers. */
export function isPublicImageAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  // Global unicast only; exclude mapped, NAT64, transition/tunnel and docs.
  if (family === 6) {
    const [first, second] = address.split(':').map(part => parseInt(part || '0', 16));
    return first >= 0x2000 && first < 0x3fff && first !== 0x2002 &&
      !(first === 0x2001 && (second < 0x200 || second === 0xdb8));
  }
  return false;
}

/** Native HTTPS transport validates DNS inside the socket's lookup callback.
 * No preflight DNS/fetch gap, proxy env routing, redirect following, or second
 * resolution of a previously approved address. TLS still checks the hostname. */
export function fetchImageUpstream(url: URL, init: {headers: HeadersInit; signal: AbortSignal}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'GET', headers: Object.fromEntries(new Headers(init.headers)), signal: init.signal,
      lookup(hostname, options, callback) {
        lookup(hostname, {all: true, verbatim: true}, (error, addresses) => {
          if (error) { callback(error, '', 4); return; }
          if (!addresses.length || addresses.some(item => !isPublicImageAddress(item.address))) {
            callback(new Error('image-dns-address-not-public'), '', 4); return;
          }
          // Node's autoSelectFamily can request all answers. Every returned
          // address has been checked, including fallback addresses.
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        });
      },
    }, incoming => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) for (const item of value) headers.append(name, item);
        else if (value !== undefined) headers.set(name, value);
      }
      const status = incoming.statusCode ?? 502;
      const noBody = status === 204 || status === 304;
      if (noBody) incoming.resume();
      resolve(new Response(noBody ? null : Readable.toWeb(incoming) as ReadableStream<Uint8Array>, {status, headers}));
    });
    req.on('error', reject);
    req.end();
  });
}
