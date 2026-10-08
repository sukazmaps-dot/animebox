export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { configurationIssues, deploymentRelease } = await import('./lib/deployment-readiness');
  const issues = configurationIssues();
  console.info('[AnimeBox readiness]', JSON.stringify({
    release: deploymentRelease(),
    issues: issues.map(({ code, severity }) => ({ code, severity })),
  }));
}
