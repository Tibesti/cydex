import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import AdminDashboard from '../pages/admin/AdminDashboard';
import AdminUsers from '../pages/admin/Users';
import AdminOrders from '../pages/admin/Orders';
import AdminOrderDetail from '../pages/admin/OrderDetail';
import AdminPayments from '../pages/admin/Payments';
import AdminPricing from '../pages/admin/Pricing';
import AdminReviews from '../pages/admin/Reviews';
import AdminEmails from '../pages/admin/Emails';
import AdminNotifications from '../pages/admin/Notifications';
import AdminActivity from '../pages/admin/Activity';
import AdminContent from '../pages/admin/Content';
import AdminVerifications from '../pages/admin/Verifications';
import AdminSecurity from '../pages/admin/Security';

const PAGES: [string, JSX.Element][] = [
  ['/', <AdminDashboard />],
  ['/orders', <AdminOrders />],
  ['/orders/:id', <AdminOrderDetail />],
  ['/payments', <AdminPayments />],
  ['/users', <AdminUsers />],
  ['/verifications', <AdminVerifications />],
  ['/reviews', <AdminReviews />],
  ['/pricing', <AdminPricing />],
  ['/emails', <AdminEmails />],
  ['/notifications', <AdminNotifications />],
  ['/activity', <AdminActivity />],
  ['/content', <AdminContent />],
  ['/security', <AdminSecurity />],
];

const AdminRoutes = () => (
  <Routes>
    {PAGES.map(([path, page]) => (
      <Route key={path} path={path} element={<ProtectedRoute allowedRoles={['ADMIN']}>{page}</ProtectedRoute>} />
    ))}
  </Routes>
);

export default AdminRoutes;
