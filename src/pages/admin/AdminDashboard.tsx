import DashboardLayout from '@/components/layout/DashboardLayout';
import Overview from '@/components/admin/Overview';

const AdminDashboard = () => (
  <DashboardLayout userRole="ADMIN">
    <div className="mx-auto max-w-7xl p-3 sm:p-4 md:p-6">
      <Overview />
    </div>
  </DashboardLayout>
);

export default AdminDashboard;
