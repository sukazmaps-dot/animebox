import SystemHealthDashboard from '@/components/admin/SystemHealthDashboard';
import ReliabilityDashboard from '@/components/admin/ReliabilityDashboard';

export default function ProductionHealthAdminPage() {
  return (
    <main>
      <ReliabilityDashboard />
      <SystemHealthDashboard />
    </main>
  );
}
