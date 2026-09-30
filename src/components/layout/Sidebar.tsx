
import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronDown, LogOut } from 'lucide-react';
import { User } from '@/types/auth.types';
import LogoutConfirmationDialog from '@/components/auth/LogoutConfirmationDialog';
import UnreadBadge from '@/components/notifications/UnreadBadge';
import { useNotifications } from '@/hooks/useNotifications';

interface SidebarLink {
  name: string;
  href: string;
  icon: React.ElementType;
}

interface SidebarProps {
  navLinks: SidebarLink[];
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  user: User | null;
  handleLogout: () => void;
  userRole: string;
}

const Sidebar: React.FC<SidebarProps> = ({
  navLinks,
  isSidebarOpen,
  setIsSidebarOpen,
  user,
  handleLogout,
  userRole
}) => {
  const location = useLocation();
  const { unreadCount } = useNotifications();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

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

  const handleMouseEnter = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    
    if (!isSidebarOpen) {
      setIsHovering(true);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    
    hoverTimerRef.current = setTimeout(() => {
      setIsHovering(false);
    }, 300);
  };

  // Handle clicks outside the sidebar to close hover state
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node) && !isSidebarOpen) {
        setIsHovering(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSidebarOpen]);

  return (
    <aside 
      ref={sidebarRef}
      className={cn(
        "fixed inset-y-0 left-0 bg-background shadow-md z-40 overflow-hidden transition-all duration-300 ease-in-out",
        (isSidebarOpen || isHovering) ? "w-64" : "w-20",
        "hidden lg:block"
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="h-full flex flex-col justify-between">
        <div>
          {/* Logo and collapse button */}
          <div className="flex items-center justify-between h-16 px-4 border-b">
            <Link to="/" className={cn("flex items-center", !(isSidebarOpen || isHovering) && "justify-center w-full")}>
              {(isSidebarOpen || isHovering) ? (
                <img 
                  src="/lovable-uploads/525fd30a-476a-4e14-ae55-ec2b11d54013.png" 
                  alt="Cydex Logo" 
                  className="h-8 dark:invert"
                />
              ) : (
                <img 
                  src="/og-tab.png" 
                  alt="Cydex Icon" 
                  className="h-8 w-8 dark:invert"
                />
              )}
            </Link>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={cn("p-1 rounded-md hover:bg-muted", !(isSidebarOpen || isHovering) && "hidden")}
            >
              <ChevronDown className={cn("h-5 w-5 transform transition-transform", isSidebarOpen ? "rotate-90" : "rotate-0")} />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="px-2 py-4">
            <ul className="space-y-1">
              {navLinks.map((link) => {
                const isActive = location.pathname === link.href;
                const isNotifications = link.href.endsWith('/notifications');
                
                return (
                  <li key={link.href}>
                    <Link
                      to={link.href}
                      className={cn(
                        "flex items-center py-2 px-3 rounded-md transition-colors",
                        isActive 
                          ? "bg-muted/80 dark:bg-muted/60 text-foreground" 
                          : "text-foreground hover:bg-muted",
                        !(isSidebarOpen || isHovering) && "justify-center"
                      )}
                    >
                      <span className="relative">
                        <link.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
                        {isNotifications && !(isSidebarOpen || isHovering) && (
                          <UnreadBadge count={unreadCount} className="absolute -right-2.5 -top-2 h-4 min-w-4 text-[10px]" />
                        )}
                      </span>
                      {(isSidebarOpen || isHovering) && <span className="ml-3 flex-1">{link.name}</span>}
                      {isNotifications && (isSidebarOpen || isHovering) && <UnreadBadge count={unreadCount} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        {/* User Section */}
        <div className="border-t p-4">
          {(isSidebarOpen || isHovering) ? (
            <div className="flex items-center">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatar} alt={user?.name || 'User'} />
                <AvatarFallback>{user?.name?.[0] || 'U'}</AvatarFallback>
              </Avatar>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground truncate">{getRoleTitle()}</p>
              </div>
              <button 
                onClick={onLogoutClick}
                className="p-1 rounded-full hover:bg-muted"
              >
                <LogOut className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <div className="flex justify-center">
              <Avatar 
                className="h-8 w-8 cursor-pointer" 
                onClick={() => setIsSidebarOpen(true)}
              >
                <AvatarImage src={user?.avatar} alt={user?.name || 'User'} />
                <AvatarFallback>{user?.name?.[0] || 'U'}</AvatarFallback>
              </Avatar>
            </div>
          )}
        </div>
      </div>

      <LogoutConfirmationDialog 
        isOpen={showLogoutDialog}
        onClose={() => setShowLogoutDialog(false)}
        onConfirm={onConfirmLogout}
      />
    </aside>
  );
};

export default Sidebar;
