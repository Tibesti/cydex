import { Users as UsersIcon } from 'lucide-react';
import AdminPage from '@/components/admin/AdminPage';
import { UserManagementReal } from '@/components/admin/UserManagementReal';

const AdminUsers = () => (
  <AdminPage title="Users" icon={UsersIcon} description="Customers, vendors, riders and admins. Suspend customers here; vendors and riders through Verifications.">
    <UserManagementReal />
  </AdminPage>
);

export default AdminUsers;
