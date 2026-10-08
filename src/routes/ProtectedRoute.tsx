
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import LoadingDisplay from '@/components/ui/LoadingDisplay';
import { useMyVerification } from '@/hooks/useMyVerification';
import { accessFor } from '@/lib/verification';
import { useAccountStatus } from '@/hooks/useAccountStatus';
import AccountSuspended from '@/pages/customer/AccountSuspended';

export const ProtectedRoute = ({ 
  children, 
  allowedRoles = [],
  skipVerification = false
}: { 
  children: JSX.Element, 
  allowedRoles?: Array<string>,
  /** For the onboarding and verification-status pages themselves */
  skipVerification?: boolean
}) => {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();
  // Vendors and riders must finish onboarding (and riders be verified) first
  const needsVerification = !skipVerification && (user?.role === 'VENDOR' || user?.role === 'RIDER');
  const { verification, loading: verificationLoading } = useMyVerification(needsVerification);
  // Customers can be suspended by an admin (vendors and riders through verification)
  const isCustomer = user?.role === 'CUSTOMER';
  const account = useAccountStatus(isCustomer);
  
  // Show loading while determining auth state
  if (loading) {
    return <LoadingDisplay fullScreen message="Checking authentication..." size="md" />;
  }
  
  if (!isAuthenticated) {
    // Pass only the pathname, search and hash as a string to avoid the Location object serialization issue
    return <Navigate to="/auth" state={{ from: location.pathname + location.search }} replace />;
  }
  
  // If user exists but no role check needed, allow access
  if (allowedRoles.length === 0) {
    return children;
  }
  
  // If user doesn't exist yet but is authenticated, show loading
  if (!user) {
    return <LoadingDisplay fullScreen message="Loading user data..." size="md" />;
  }
  
  // Check role if allowedRoles is provided and not empty
  if (!allowedRoles.includes(user.role)) {
    // Redirect to dashboard specific to their role
    const rolePath = user.role.toLowerCase();
    return <Navigate to={`/${rolePath}`} replace />;
  }
  
  if (isCustomer) {
    if (account.loading) return <LoadingDisplay fullScreen message="Loading your account..." size="md" />;
    if (account.suspended) return <AccountSuspended reason={account.reason} onCheckAgain={() => account.refetch()} />;
  }

  if (needsVerification) {
    if (verificationLoading) {
      return <LoadingDisplay fullScreen message="Loading your account..." size="md" />;
    }
    const role = user.role === 'VENDOR' ? 'vendor' : 'rider';
    const access = accessFor(role, verification);
    if (access === 'onboarding') return <Navigate to={`/${role}/onboarding`} replace />;
    if (access !== 'ok') return <Navigate to={`/${role}/verification`} replace />;
  }

  return children;
};
