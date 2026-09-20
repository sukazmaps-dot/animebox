-- Legacy manual episode completion is no longer part of the product flow.
-- Verified completion is derived only from animebox_watch.progress.
-- Keep the function for historical compatibility, but close the direct
-- authenticated RPC path so it cannot bypass heartbeat/coverage validation.

revoke execute
on function public.record_episode(bigint, integer, boolean, text)
from authenticated;
