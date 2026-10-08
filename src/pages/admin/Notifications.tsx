import DashboardLayout from '@/components/layout/DashboardLayout';
import NotificationsPage from '@/components/notifications/NotificationsPage';

const AdminNotifications = () => (
  <DashboardLayout userRole="ADMIN">
    <NotificationsPage role="admin" />
  </DashboardLayout>
);

export default AdminNotifications;
