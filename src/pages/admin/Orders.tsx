import { Package } from 'lucide-react';
import AdminPage from '@/components/admin/AdminPage';
import AdminOrdersList from '@/components/admin/orders/AdminOrdersList';

const AdminOrders = () => (
  <AdminPage title="Orders" icon={Package} description="Customer orders and vendors' rider requests. Open one for the full details and actions.">
    <AdminOrdersList />
  </AdminPage>
);

export default AdminOrders;
