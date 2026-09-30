import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import Notifications from '../pages/customer/Notifications';
import CustomerDashboard from '../pages/customer/CustomerDashboard';
import NewOrder from '../pages/customer/NewOrder';
import Orders from '../pages/customer/Orders';
import OrderDetail from '../pages/customer/OrderDetail';
import Wallet from '../pages/customer/Wallet';
// import Recycling from '../pages/customer/Recycling';
import Profile from '../pages/customer/Profile';
import OrderConfirmation from '../pages/customer/OrderConfirmation';
import ProductDetails from '../pages/customer/ProductDetails';

const CustomerRoutes = () => {
  return (
    <Routes>
      <Route 
        path="/" 
        element={
          <ProtectedRoute allowedRoles={['CUSTOMER']}>
            <CustomerDashboard />
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/new-order" 
        element={
          <ProtectedRoute allowedRoles={['CUSTOMER']}>
            <NewOrder />
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/orders" 
        element={
          <ProtectedRoute allowedRoles={['CUSTOMER']}>
            <Orders />
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/orders/:orderId" 
        element={
          <ProtectedRoute allowedRoles={['CUSTOMER']}>
            <OrderDetail />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/products/:productId" 
        element={
          <ProtectedRoute allowedRoles={['CUSTOMER']}>
            <ProductDetails />
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/wallet" 
        element={
          <ProtectedRoute allowedRoles={['CUSTOMER']}>
            <Wallet />
          </ProtectedRoute>
        } 
      />

      {/* <Route 
        path="/recycling" 
        element={
          <ProtectedRoute allowedRoles={['CUSTOMER']}>
            <Recycling />
          </ProtectedRoute>
        } 
      /> */}
      
      <Route 
        path="/profile" 
        element={
          <ProtectedRoute allowedRoles={['CUSTOMER']}>
            <Profile />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/order-confirmation" 
        element={
          <ProtectedRoute allowedRoles={['CUSTOMER']}>
            <OrderConfirmation />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/notifications" 
        element={
          <ProtectedRoute allowedRoles={['CUSTOMER']}>
            <Notifications />
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
};

export default CustomerRoutes;
