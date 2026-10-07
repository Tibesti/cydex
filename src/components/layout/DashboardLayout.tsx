
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { cn } from '@/lib/utils';
import Sidebar from './Sidebar';
import MobileMenu from './MobileMenu';
import MobileHeader from './MobileHeader';
import { getNavLinks, getRoleTitle } from './navigationLinks';
import { UserRole } from '@/types/auth.types';
import AddressOnboarding from '@/components/address/AddressOnboarding';
import DeliveryAddressBar from '@/components/customer/address/DeliveryAddressBar';
import RiderLocationBar from '@/components/rider/location/RiderLocationBar';
import RiderLocationGate from '@/components/rider/location/RiderLocationGate';
import { useNotificationsRealtime } from '@/hooks/useNotifications';
import RiderRatingPrompt from '@/components/customer/ratings/RiderRatingPrompt';
import PushPrompt from '@/components/notifications/PushPrompt';

interface DashboardLayoutProps {
  children: React.ReactNode;
  userRole: UserRole;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, userRole }) => {
  const { user, logout, loading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  useNotificationsRealtime();

  // Memoize navigation links to prevent recreation on every render
  const navLinks = useMemo(() => getNavLinks(userRole), [userRole]);
  const userRoleTitle = useMemo(() => getRoleTitle(userRole), [userRole]);
  
  // Memoize handlers to prevent recreation on every render
  const handleLogout = useMemo(() => () => {
    logout();
    navigate('/auth');
  }, [logout, navigate]);

  const handleMenuToggle = useMemo(() => () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  }, [isMobileMenuOpen]);

  const handleMobileMenuClose = useMemo(() => () => {
    setIsMobileMenuOpen(false);
  }, []);

  // Show loading state while auth is being determined
  if (loading) {
    console.log('DashboardLayout: Showing loading state');
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to auth if not authenticated
  if (!isAuthenticated) {
    console.log('DashboardLayout: Not authenticated, redirecting to auth');
    navigate('/auth');
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar for larger screens */}
      <Sidebar 
        navLinks={navLinks}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        user={user}
        handleLogout={handleLogout}
        userRole={userRole}
      />

      {/* Mobile Header */}
      <MobileHeader 
        onMenuToggle={handleMenuToggle}
        user={user}
        userRole={userRole}
        handleLogout={handleLogout}
      />

      {/* Mobile Menu */}
      <MobileMenu 
        isOpen={isMobileMenuOpen}
        onClose={handleMobileMenuClose}
        navLinks={navLinks}
        user={user}
        handleLogout={handleLogout}
        userRoleTitle={userRoleTitle}
      />

      {/* Main Content */}
      <main className={cn(
        "flex-1 transition-all duration-300 ease-in-out",
        isSidebarOpen ? "lg:ml-64" : "lg:ml-20",
        "pt-16 lg:pt-0"
      )}>
        {userRole === 'CUSTOMER' && <DeliveryAddressBar />}
        {userRole === 'RIDER' && <RiderLocationBar />}
        {/* Vendors are asked to turn on push so they don't miss orders (a reminder, never a block) */}
        {userRole === 'VENDOR' && <PushPrompt tone="warning" className="m-2 sm:m-4 md:mx-6" />}
        {children}
      </main>

      {/* Customers without a saved address and vendors without a store location are asked to add one */}
      {(userRole === 'CUSTOMER' || userRole === 'VENDOR') && <AddressOnboarding role={userRole} />}
      {/* Customers are asked once per session to rate the rider of their latest delivery */}
      {userRole === 'CUSTOMER' && <RiderRatingPrompt />}
      {/* Riders must share their live location while using the app */}
      {userRole === 'RIDER' && <RiderLocationGate />}
    </div>
  );
};

export default DashboardLayout;
