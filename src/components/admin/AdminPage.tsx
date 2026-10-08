import type { ReactNode } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { cn } from '@/lib/utils';

interface AdminPageProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: React.ElementType;
  /** Shown on the right of the title (filters, buttons) */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

// Layout for every admin screen (the route already checks the admin role)
const AdminPage = ({ title, description, icon: Icon, actions, className, children }: AdminPageProps) => (
  <DashboardLayout userRole="ADMIN">
    <div className={cn('mx-auto max-w-7xl space-y-4 p-3 sm:p-4 md:p-6', className)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            {Icon && <Icon className="h-6 w-6 shrink-0" />}
            {title}
          </h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  </DashboardLayout>
);

export default AdminPage;
