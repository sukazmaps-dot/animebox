-- AnimeBox Patch 18.5.5.3
-- Keep the internal lease table explicit in Security Advisor as service-role-only.

create policy runtime_refresh_leases_service_role_only
on private.runtime_refresh_leases
for all
to service_role
using (true)
with check (true);
