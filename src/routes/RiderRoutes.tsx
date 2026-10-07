
import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import RiderOnboarding from '../pages/onboarding/RiderOnboarding';
import VerificationStatus from '../pages/onboarding/VerificationStatus';
import Notifications from '../pages/rider/Notifications';
import DeliveryHistory from '../pages/rider/DeliveryHistory';
import RiderDashboard from '../pages/rider/RiderDashboard';
import AvailableOrders from '../pages/rider/AvailableOrders';
import CurrentDeliveries from '../pages/rider/CurrentDeliveries';
import RiderEarnings from '../pages/rider/Earnings';
import RiderProfile from '../pages/rider/Profile';
import RiderOrderDetail from '../pages/rider/OrderDetail';

const RiderRoutes = () => {
  return (
    <Routes>
      <Route 
        path="/onboarding" 
        element={
          <ProtectedRoute allowedRoles={['RIDER']} skipVerification>
            <RiderOnboarding />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/verification" 
        element={
          <ProtectedRoute allowedRoles={['RIDER']} skipVerification>
            <VerificationStatus role="rider" />
          </ProtectedRoute>
        } 
      />

      <Route 
        path  ="/" 
        element={
          <ProtectedRoute allowedRoles={['RIDER']}>
            <RiderDashboard />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/available" 
        element={
          <ProtectedRoute allowedRoles={['RIDER']}>
            <AvailableOrders />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/current" 
        element={
          <ProtectedRoute allowedRoles={['RIDER']}>
            <CurrentDeliveries />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/earnings" 
        element={
          <ProtectedRoute allowedRoles={['RIDER']}>
            <RiderEarnings />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/profile" 
        element={
          <ProtectedRoute allowedRoles={['RIDER']}>
            <RiderProfile />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/order/:orderId" 
        element={
          <ProtectedRoute allowedRoles={['RIDER']}>
            <RiderOrderDetail />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/deliveries" 
        element={
          <ProtectedRoute allowedRoles={['RIDER']}>
            <DeliveryHistory />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/notifications" 
        element={
          <ProtectedRoute allowedRoles={['RIDER']}>
            <Notifications />
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
};

export default RiderRoutes;
