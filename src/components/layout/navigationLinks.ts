
import { 
  Bell, Bike, Boxes, Home, Package, Wallet, Recycle, User, Settings, Users, ShieldCheck, Navigation, FileText,
  Banknote, Mail, ScrollText, Shield, SlidersHorizontal, Star,
} from 'lucide-react';

interface SidebarLink {
  name: string;
  href: string;
  icon: React.ElementType;
}

/**
 * Get navigation links based on user role
 */
export const getNavLinks = (userRole: 'CUSTOMER' | 'RIDER' | 'VENDOR' | 'ADMIN'): SidebarLink[] => {
  switch (userRole) {
    case 'CUSTOMER':
      return [
        { name: 'Home', href: '/customer', icon: Home },
        { name: 'Orders', href: '/customer/orders', icon: Package },
        { name: 'Notifications', href: '/customer/notifications', icon: Bell },
        { name: 'Wallet', href: '/customer/wallet', icon: Wallet },
        // { name: 'Recycling', href: '/customer/recycling', icon: Recycle },
        { name: 'Profile', href: '/customer/profile', icon: User },
      ];
    case 'RIDER':
      return [
        { name: 'Dashboard', href: '/rider', icon: Home },
        { name: 'Available Orders', href: '/rider/available', icon: Package },
        { name: 'Current Deliveries', href: '/rider/current', icon: Navigation },
        { name: 'Notifications', href: '/rider/notifications', icon: Bell },
        { name: 'Earnings', href: '/rider/earnings', icon: Wallet },
        { name: 'Profile', href: '/rider/profile', icon: User },
      ];
    case 'VENDOR':
      return [
        { name: 'Dashboard', href: '/vendor', icon: Home },
        { name: 'Orders', href: '/vendor/orders', icon: Package },
        { name: 'Products', href: '/vendor/products', icon: Boxes },
        { name: 'Request Rider', href: '/vendor/rider-requests', icon: Bike },
        { name: 'Notifications', href: '/vendor/notifications', icon: Bell },
        { name: 'Wallet', href: '/vendor/wallet', icon: Wallet },
        // { name: 'Recycling', href: '/vendor/recycling', icon: Recycle },
        { name: 'Settings', href: '/vendor/settings', icon: Settings },
      ];
    case 'ADMIN':
      return [
        { name: 'Overview', href: '/admin', icon: Home },
        { name: 'Orders', href: '/admin/orders', icon: Package },
        { name: 'Money', href: '/admin/payments', icon: Banknote },
        { name: 'Users', href: '/admin/users', icon: Users },
        { name: 'Verifications', href: '/admin/verifications', icon: ShieldCheck },
        { name: 'Reviews', href: '/admin/reviews', icon: Star },
        { name: 'Pricing', href: '/admin/pricing', icon: SlidersHorizontal },
        { name: 'Notifications', href: '/admin/notifications', icon: Bell },
        { name: 'Emails', href: '/admin/emails', icon: Mail },
        { name: 'Activity log', href: '/admin/activity', icon: ScrollText },
        { name: 'Content', href: '/admin/content', icon: FileText },
        { name: 'Security', href: '/admin/security', icon: Shield },
      ];
    default:
      return [];
  }
};

/**
 * Get user role title for display
 */
export const getRoleTitle = (userRole: string): string => {
  switch (userRole) {
    case 'CUSTOMER':
      return 'Customer';
    case 'RIDER':
      return 'Rider';
    case 'VENDOR':
      return 'Vendor';
    case 'ADMIN':
      return 'Administrator';
    default:
      return '';
  }
};
