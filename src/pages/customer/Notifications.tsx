import DashboardLayout from '@/components/layout/DashboardLayout';
import NotificationsPage from '@/components/notifications/NotificationsPage';

const Notifications = () => (
  <DashboardLayout userRole="CUSTOMER">
    <NotificationsPage role="customer" />
  </DashboardLayout>
);

export default Notifications;
