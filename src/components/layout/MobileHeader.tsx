
import React, { useState } from 'react';
import { Bell, ShoppingCart, Menu } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Link } from 'react-router-dom';
import { User, MessageSquare, LogOut, Sun, Moon, Monitor } from 'lucide-react';
import { User as UserType } from '@/types/auth.types';
import LogoutConfirmationDialog from '@/components/auth/LogoutConfirmationDialog';
import { useCartContext } from '@/contexts/CartContext';
import { useTheme } from '@/contexts/ThemeContext';
import { toast } from 'sonner';
import UnreadBadge from '@/components/notifications/UnreadBadge';
import { useNotifications } from '@/hooks/useNotifications';

interface MobileHeaderProps {
  onMenuToggle: () => void;
  user: UserType | null;
  userRole: string;
  handleLogout: () => void;
}

const MobileHeader: React.FC<MobileHeaderProps> = ({ 
  onMenuToggle, 
  user, 
  userRole,
  handleLogout 
}) => {
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const { cartItems, setIsCartOpen } = useCartContext();
  const { theme, setTheme } = useTheme();
  const { unreadCount } = useNotifications();
  const role = userRole.toLowerCase();
  const hasNotifications = role === 'customer' || role === 'vendor' || role === 'rider';

  // Get role title for display
  const getRoleTitle = () => {
    switch (userRole) {
      case 'customer':
        return 'Customer';
      case 'rider':
        return 'Rider';
      case 'vendor':
        return 'Vendor';
      case 'admin':
        return 'Administrator';
      default:
        return '';
    }
  };

  const onLogoutClick = () => {
    setShowLogoutDialog(true);
  };

  const onConfirmLogout = () => {
    handleLogout();
    setShowLogoutDialog(false);
  };

  const handleMessages = (e: React.MouseEvent) => {
    e.preventDefault();
    toast.info('Messages feature coming soon!');
  };

  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
      <div className="flex items-center">
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-md hover:bg-muted mr-2"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-xl font-bold flex items-center">
          <img 
            src="/lovable-uploads/525fd30a-476a-4e14-ae55-ec2b11d54013.png" 
            alt="Cydex Logo" 
            className="h-6 dark:invert"
          />
        </span>
      </div>
      <div className="flex items-center space-x-2">
        {hasNotifications && (
          <Link
            to={`/${role}/notifications`}
            className="p-2 rounded-full hover:bg-muted relative transition-colors"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            <UnreadBadge count={unreadCount} className="absolute -top-1 -right-1" />
          </Link>
        )}
        {userRole === 'customer' && (
          <button 
            className="p-2 rounded-full hover:bg-muted relative transition-colors"
            onClick={() => setIsCartOpen(true)}
            title="Shopping Cart"
          >
            <ShoppingCart className="h-5 w-5" />
            {cartItems.length > 0 && (
              <Badge className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-primary text-black text-xs rounded-full min-w-[18px] h-5 flex items-center justify-center">
                {cartItems.length}
              </Badge>
            )}
          </button>
        )}
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-0.5">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatar} alt={user?.name || 'User'} />
                <AvatarFallback>{user?.name?.[0] || 'U'}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div>
                <p className="font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{getRoleTitle()}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={`/${userRole}/profile`} className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleMessages} className="opacity-60 cursor-pointer">
              <MessageSquare className="mr-2 h-4 w-4" />
              <span>Messages</span>
              <span className="ml-auto text-xs text-muted-foreground">Coming Soon</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setTheme('light')} className="cursor-pointer">
              <Sun className="mr-2 h-4 w-4" />
              <span>Light</span>
              {theme === 'light' && <span className="ml-auto text-primary">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')} className="cursor-pointer">
              <Moon className="mr-2 h-4 w-4" />
              <span>Dark</span>
              {theme === 'dark' && <span className="ml-auto text-primary">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')} className="cursor-pointer">
              <Monitor className="mr-2 h-4 w-4" />
              <span>System</span>
              {theme === 'system' && <span className="ml-auto text-primary">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogoutClick} className="text-red-500 cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Logout</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <LogoutConfirmationDialog 
        isOpen={showLogoutDialog}
        onClose={() => setShowLogoutDialog(false)}
        onConfirm={onConfirmLogout}
      />
    </div>
  );
};

export default MobileHeader;
