import DashboardLayout from '@/components/layout/DashboardLayout';
import NotificationsPage from '@/components/notifications/NotificationsPage';

const Notifications = () => (
  <DashboardLayout userRole="VENDOR">
    <NotificationsPage role="vendor" />
  </DashboardLayout>
);

export default Notifications;
