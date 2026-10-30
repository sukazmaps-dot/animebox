# Patch 31.23 — Runtime Memory Diagnostics

**Status:** implementation branch; CI and review pending. No merge or production deployment.

## Goal

Expose a safe, low-overhead point-in-time memory snapshot for the existing authenticated System Health dashboard. The snapshot is intended to distinguish JavaScript heap growth from external/native and ArrayBuffer memory before choosing the next optimization.

## Implementation

- Read process.memoryUsage() and process.uptime() from the existing Node.js process.
- Return RSS, heapTotal, heapUsed, external and arrayBuffers as integer bytes, plus sample time and process uptime.
- Sample at the beginning of getSystemHealthSnapshot(), after the admin route has authenticated the caller and before the diagnostics fan out into Supabase. This avoids attributing the health query's temporary result arrays to the process baseline.
- Render the values in the existing admin System Health dashboard in MiB.
- Preserve the current admin role guard and private, no-store response policy.

## Interpretation

- This is one Node.js process snapshot, not a Railway container-level metric and not an aggregate across replicas.
- RSS is resident memory used by the process. It includes more than the V8 heap and must not be added to heap or external values.
- arrayBuffers is included in external; do not add those two values together.
- heapUsed / heapTotal helps identify V8 heap pressure. A high RSS with a relatively stable heap can point toward external/native allocations or allocator retention, but requires repeated observations and cannot identify a leaking module by itself.
- Uptime helps identify a process restart between readings. No PID, host identifier, environment values, user records, cache keys or request data are exposed.

## Safety boundaries

- No new endpoint, database table, SQL migration, persistent history, log emission, timer, forced garbage collection, heap limit or dependency.
- No public health response or unauthenticated diagnostic path.
- No changes to caching, playback, media delivery, auth, Premium, Watch Together or user data.
- The endpoint remains manually refreshed; production trend conclusions require multiple readings from the same process and comparable traffic windows.

## Validation

1. Run npm run patch31-23:check for mocked process metrics, normalization, early-sampling order, admin/no-store boundary and dashboard wiring.
2. Run TypeScript and targeted ESLint.
3. Run the full AnimeBox Quality Gate and production build on the exact PR head SHA.
4. After a separately approved Railway release, collect repeated System Health snapshots and compare RSS, heapUsed, external and arrayBuffers with Railway RAM graphs. Do not claim savings from CI or a single snapshot.

## Rollback

Revert the PR. There are no migrations, environment changes or infrastructure operations to undo.
