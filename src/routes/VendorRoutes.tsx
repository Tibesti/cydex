
import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import VendorOnboarding from '../pages/onboarding/VendorOnboarding';
import VerificationStatus from '../pages/onboarding/VerificationStatus';
import Notifications from '../pages/vendor/Notifications';
import Products from '../pages/vendor/Products';
import RiderRequests from '../pages/vendor/rider-requests/RiderRequests';
import NewRiderRequest from '../pages/vendor/rider-requests/NewRiderRequest';
import RiderRequestDetail from '../pages/vendor/rider-requests/RiderRequestDetail';
import VendorDashboard from '../pages/vendor/VendorDashboard';
import VendorOrders from '../pages/vendor/Orders';
import VendorOrderDetail from '../pages/vendor/OrderDetail';
import ProcessOrder from '../pages/vendor/ProcessOrder';
import VendorWallet from '../pages/vendor/Wallet';
// import VendorRecycling from '../pages/vendor/Recycling';
import VendorSettings from '../pages/vendor/Settings';
import AddProduct from '../pages/vendor/AddProduct';

const VendorRoutes = () => {
  return (
    <Routes>
      <Route 
        path="/onboarding" 
        element={
          <ProtectedRoute allowedRoles={['VENDOR']} skipVerification>
            <VendorOnboarding />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/verification" 
        element={
          <ProtectedRoute allowedRoles={['VENDOR']} skipVerification>
            <VerificationStatus role="vendor" />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/" 
        element={
          <ProtectedRoute allowedRoles={['VENDOR']}>
            <VendorDashboard />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/orders" 
        element={
          <ProtectedRoute allowedRoles={['VENDOR']}>
            <VendorOrders />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/orders/:orderId" 
        element={
          <ProtectedRoute allowedRoles={['VENDOR']}>
            <VendorOrderDetail />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/process-order" 
        element={
          <ProtectedRoute allowedRoles={['VENDOR']}>
            <ProcessOrder />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/wallet" 
        element={
          <ProtectedRoute allowedRoles={['VENDOR']}>
            <VendorWallet />
          </ProtectedRoute>
        } 
      />

      {/* <Route 
        path="/recycling" 
        element={
          <ProtectedRoute allowedRoles={['VENDOR']}>
            <VendorRecycling />
          </ProtectedRoute>
        } 
      /> */}

      <Route 
        path="/settings" 
        element={
          <ProtectedRoute allowedRoles={['VENDOR']}>
            <VendorSettings />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/rider-requests" 
        element={
          <ProtectedRoute allowedRoles={['VENDOR']}>
            <RiderRequests />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/rider-requests/new" 
        element={
          <ProtectedRoute allowedRoles={['VENDOR']}>
            <NewRiderRequest />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/rider-requests/:orderId" 
        element={
          <ProtectedRoute allowedRoles={['VENDOR']}>
            <RiderRequestDetail />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/products" 
        element={
          <ProtectedRoute allowedRoles={['VENDOR']}>
            <Products />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/edit-product/:productId" 
        element={
          <ProtectedRoute allowedRoles={['VENDOR']}>
            <AddProduct />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/add-product" 
        element={
          <ProtectedRoute allowedRoles={['VENDOR']}>
            <AddProduct />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/notifications" 
        element={
          <ProtectedRoute allowedRoles={['VENDOR']}>
            <Notifications />
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
};

export default VendorRoutes;
