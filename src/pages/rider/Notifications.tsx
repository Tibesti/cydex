import DashboardLayout from '@/components/layout/DashboardLayout';
import NotificationsPage from '@/components/notifications/NotificationsPage';

const Notifications = () => (
  <DashboardLayout userRole="RIDER">
    <NotificationsPage role="rider" />
  </DashboardLayout>
);

export default Notifications;
