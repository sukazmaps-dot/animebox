import LeaderboardHealthPanel from '@/components/admin/LeaderboardHealthPanel';
import SystemHealthDashboard from '@/components/admin/SystemHealthDashboard';

export default function ProductionHealthAdminPage() {
  return (
    <main>
      <SystemHealthDashboard />
      <LeaderboardHealthPanel />
    </main>
  );
}
