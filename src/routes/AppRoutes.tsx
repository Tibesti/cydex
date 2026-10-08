
import { Route, Routes } from 'react-router-dom';
import Index from '../pages/Index';
import Auth from '../pages/Auth';
import ResetPassword from '../pages/Auth/ResetPassword';
import SetPassword from '../pages/Auth/SetPassword';
import AdminLogin from '../pages/admin/AdminLogin';
import NotFound from '../pages/NotFound';
import HowItWorks from '../pages/HowItWorks';
import AboutUs from '../pages/AboutUs';
import Faq from '../pages/Faq';
import Contact from '../pages/Contact';
import PrivacyPolicy from '../pages/PrivacyPolicy';
import CustomerRoutes from './CustomerRoutes';
import VendorRoutes from './VendorRoutes';
import RiderRoutes from './RiderRoutes';
import AdminRoutes from './AdminRoutes';

const AppRoutes = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/auth/reset-password" element={<ResetPassword />} />
      <Route path="/auth/set-password" element={<SetPassword />} />
      <Route path="/how-it-works" element={<HowItWorks />} />
      <Route path="/about" element={<AboutUs />} />
      <Route path="/faq" element={<Faq />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      
      {/* Protected Routes */}
      <Route path="/customer/*" element={<CustomerRoutes />} />
      <Route path="/vendor/*" element={<VendorRoutes />} />
      <Route path="/rider/*" element={<RiderRoutes />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/*" element={<AdminRoutes />} />
      
      {/* Catch-all route for 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppRoutes;
