
import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import AdminDashboard from '../pages/admin/AdminDashboard';
import AdminUsers from '../pages/admin/Users';
import AdminOrders from '../pages/admin/Orders';
import AdminPayments from '../pages/admin/Payments';
import AdminContent from '../pages/admin/Content';
import AdminSecurity from '../pages/admin/Security';
import AdminVerifications from '../pages/admin/Verifications';

const AdminRoutes = () => {
  return (
    <Routes>
      <Route 
        path="/" 
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminDashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/users" 
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminUsers />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/verifications" 
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminVerifications />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/orders" 
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminOrders />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/payments" 
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminPayments />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/content" 
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminContent />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/security" 
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminSecurity />
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
};

export default AdminRoutes;
