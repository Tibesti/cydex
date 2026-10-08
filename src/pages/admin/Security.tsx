import { Shield } from 'lucide-react';
import AdminPage from '@/components/admin/AdminPage';
import { Security as SecurityComponent } from '@/components/admin/Security';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Placeholder kept for planning: the figures below are sample data, not live
const AdminSecurity = () => (
  <AdminPage title="Security" icon={Shield} description="Login and account security.">
    <Alert>
      <AlertDescription>
        Preview only: this page shows sample data and isn't connected yet. Admin actions are recorded in the Activity log.
      </AlertDescription>
    </Alert>
    <SecurityComponent />
  </AdminPage>
);

export default AdminSecurity;
