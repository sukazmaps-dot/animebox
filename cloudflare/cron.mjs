export const cronJobs = {
  '17 3 * * *': '/api/cron/boosty-premium',
  '47 3 * * *': '/api/cron/premium-lifecycle',
  '23 4 * * *': '/api/cron/catalog-availability',
  '53 4 * * *': '/api/cron/seo-anime-index',
  '17 5 * * *': '/api/cron/production-maintenance',
  '8 0 * * 1': '/api/cron/leaderboard-seasons',
};
export async function runScheduled(controller, env) {
  if (env.ANIMEBOX_CRON_ENABLED !== 'true') return;
  const path = cronJobs[controller.cron];
  if (!path || !env.CRON_SECRET) throw new Error('Cron path or CRON_SECRET missing');
  const response = await env.WORKER_SELF_REFERENCE.fetch(new Request('https://youranimebox.com' + path, {
    headers: { authorization: 'Bearer ' + env.CRON_SECRET },
  }));
  if (!response.ok) throw new Error('Cron failed: ' + path + ' status=' + response.status);
  await response.arrayBuffer();
}
