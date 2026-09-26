const origin = process.env.ANIMEBOX_SMOKE_ORIGIN?.trim();

if (!origin) {
  console.error(
    'Set ANIMEBOX_SMOKE_ORIGIN to the deployed origin, e.g. https://youranimebox.com',
  );
  process.exit(2);
}

let base;
try {
  base = new URL(origin);
} catch {
  console.error('ANIMEBOX_SMOKE_ORIGIN must be an absolute http(s) URL.');
  process.exit(2);
}

if (!/^https?:$/.test(base.protocol)) {
  console.error('ANIMEBOX_SMOKE_ORIGIN must use http or https.');
  process.exit(2);
}

const routes = [
  '/',
  '/search',
  '/leaderboard',
  '/premium',
  '/settings',
];

const failures = [];

for (const route of routes) {
  const target = new URL(route, base);

  try {
    const response = await fetch(target, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'AnimeBox-Clickjacking-Smoke/18.6.5',
      },
    });

    const csp = response.headers.get('content-security-policy') ?? '';
    const xfo = response.headers.get('x-frame-options') ?? '';

    const frameAncestorsNone =
      /(?:^|;)\s*frame-ancestors\s+'none'\s*(?:;|$)/i.test(csp);

    if (!frameAncestorsNone) {
      failures.push(
        `${route}: missing CSP frame-ancestors 'none' (status ${response.status}).`,
      );
    }

    if (xfo.trim().toUpperCase() !== 'DENY') {
      failures.push(
        `${route}: X-Frame-Options is ${JSON.stringify(xfo)} instead of DENY (status ${response.status}).`,
      );
    }

    console.log(
      `[clickjacking-smoke] ${route} -> ${response.status} | CSP=${JSON.stringify(csp)} | XFO=${JSON.stringify(xfo)}`,
    );
  } catch (error) {
    failures.push(
      `${route}: request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (failures.length) {
  console.error('\n[AnimeBox Clickjacking Smoke] Failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log(
  '\n[AnimeBox Clickjacking Smoke] all tested document routes reject framing.',
);
