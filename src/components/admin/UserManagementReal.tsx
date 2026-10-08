import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, MailPlus, MoreHorizontal, Pencil, RotateCw, Search, ShieldCheck, UserCheck, UserMinus, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SimplePagination from '@/components/ui/simple-pagination';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { invokeFunction } from '@/lib/edgeFunctions';
import { isValidPhone } from '@/lib/phone';
import { STATUS_LABELS, type VerificationStatus } from '@/lib/verification';
import ReasonDialog from './ReasonDialog';
import { PAGE_SIZE } from '@/lib/pagination';

type Row = {
  id: string; name: string | null; email: string | null; phone: string | null; role: string; status: string;
  suspension_reason: string | null; verification_status: string | null; created_at: string; last_login_at: string | null;
  joined: boolean; total_count: number;
};

// Admin: everyone on Cydex. Customers are suspended here; vendors and riders
// through Verifications. Admins are invited by email.
export function UserManagementReal() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [role, setRole] = useState('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [suspending, setSuspending] = useState<Row | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-users', role, debounced, page],
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_users', {
        p_search: debounced || undefined, p_role: role === 'all' ? undefined : role,
        p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const total = Number(rows[0]?.total_count ?? 0);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const openEdit = (u: Row) => {
    setEditing(u);
    setEditName(u.name ?? '');
    setEditPhone(u.phone ?? '');
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!(await confirm({ title: `Are you sure you want to save changes to ${editing.name || 'this account'}?`, confirmLabel: 'Yes, save' }))) return;
    setSavingEdit(true);
    const { error } = await supabase.from('profiles')
      .update({ name: editName.trim(), phone: editPhone.trim() || null }).eq('id', editing.id);
    setSavingEdit(false);
    if (error) return toast.error(errorMessage(error, 'Could not save'));
    toast.success('Saved');
    setEditing(null);
    refresh();
  };

  const reinstate = async (u: Row) => {
    if (!(await confirm({
      title: `Are you sure you want to reinstate ${u.name ?? 'this customer'}?`,
      description: 'They can log in and place orders again.',
      confirmLabel: 'Yes, reinstate',
    }))) return;
    setBusyId(u.id);
    const { error } = await supabase.rpc('admin_set_customer_suspended', { p_profile_id: u.id, p_suspended: false });
    setBusyId(null);
    if (error) return toast.error(errorMessage(error, 'Could not reinstate'));
    toast.success(`${u.name ?? 'Customer'} can order again`);
    refresh();
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await confirm({
      title: `Are you sure you want to make ${inviteName.trim()} an admin?`,
      description: `${inviteEmail.trim()} gets full admin access: orders, money, withdrawals, users and pricing.`,
      confirmLabel: 'Yes, send invite',
    }))) return;
    setInviting(true);
    try {
      await invokeFunction('admin-team', { action: 'invite', email: inviteEmail.trim(), name: inviteName.trim() });
      toast.success(`Invite sent to ${inviteEmail.trim()}`);
      setInviteOpen(false);
      setInviteName('');
      setInviteEmail('');
      refresh();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not send the invite'));
    } finally {
      setInviting(false);
    }
  };

  const adminAction = async (action: 'resend' | 'remove', u: Row) => {
    if (action === 'resend' && !(await confirm({
      title: `Are you sure you want to resend ${u.email}'s invite?`,
      description: 'The link in their last invite email stops working.',
      confirmLabel: 'Yes, resend',
    }))) return;
    setBusyId(u.id);
    try {
      await invokeFunction('admin-team', { action, profile_id: u.id });
      toast.success(action === 'resend' ? `New invite sent to ${u.email}` : `${u.name || u.email} no longer has admin access`);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err, 'Something went wrong'));
    } finally {
      setBusyId(null);
      setRemoving(null);
    }
  };

  const editPhoneOk = !editPhone.trim() || isValidPhone(editPhone);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input type="search" placeholder="Name, email or phone" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Select value={role} onValueChange={(v) => { setRole(v); setPage(1); }}>
            <SelectTrigger className="flex-1 md:w-40" aria-label="Role"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="customer">Customers</SelectItem>
              <SelectItem value="vendor">Vendors</SelectItem>
              <SelectItem value="rider">Riders</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setInviteOpen(true)}>
            <MailPlus className="mr-1.5 h-4 w-4" /> Invite admin
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{isLoading ? 'Loading…' : `${total} account${total === 1 ? '' : 's'}`}</p>

      <Card>
        <CardContent className="p-0">
          {isLoading && rows.length === 0 ? (
            <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded bg-muted" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No accounts match.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((u) => {
                const isMe = u.id === me?.id;
                const suspended = u.status === 'suspended';
                const verification = u.verification_status as VerificationStatus | null;
                return (
                  <li key={u.id} className="flex items-start gap-3 p-3 sm:px-4">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        <span className="truncate">{u.name || 'Unnamed'}</span>
                        <Badge variant="outline" className="capitalize">{u.role}</Badge>
                        {isMe && <Badge variant="secondary">You</Badge>}
                        {u.role === 'admin' && !u.joined && <Badge variant="outline">Invited</Badge>}
                        {suspended && <Badge variant="destructive">Suspended</Badge>}
                        {(u.role === 'vendor' || u.role === 'rider') && (
                          <Link to="/admin/verifications">
                            <Badge variant="secondary" className="hover:bg-secondary/70">
                              {verification ? STATUS_LABELS[verification] ?? verification : 'Not onboarded'}
                            </Badge>
                          </Link>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{[u.email, u.phone].filter(Boolean).join(' · ')}</p>
                      <p className="text-xs text-muted-foreground">
                        Joined {format(new Date(u.created_at), 'd MMM yyyy')}
                        {u.last_login_at && ` · Last seen ${format(new Date(u.last_login_at), 'd MMM yyyy')}`}
                      </p>
                      {suspended && u.suspension_reason && <p className="text-xs text-destructive">Reason: {u.suspension_reason}</p>}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={busyId === u.id} aria-label={`Actions for ${u.name ?? 'user'}`}>
                          {busyId === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(u)}><Pencil className="mr-2 h-4 w-4" /> Edit name and phone</DropdownMenuItem>
                        {u.role === 'customer' && (suspended ? (
                          <DropdownMenuItem onClick={() => reinstate(u)}><UserCheck className="mr-2 h-4 w-4" /> Reinstate</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setSuspending(u)}>
                            <UserX className="mr-2 h-4 w-4" /> Suspend
                          </DropdownMenuItem>
                        ))}
                        {(u.role === 'vendor' || u.role === 'rider') && (
                          <DropdownMenuItem asChild>
                            <Link to="/admin/verifications"><ShieldCheck className="mr-2 h-4 w-4" /> Verify or suspend in Verifications</Link>
                          </DropdownMenuItem>
                        )}
                        {u.role === 'admin' && !isMe && (
                          <>
                            <DropdownMenuSeparator />
                            {!u.joined && (
                              <DropdownMenuItem onClick={() => adminAction('resend', u)}><RotateCw className="mr-2 h-4 w-4" /> Resend invite</DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setRemoving(u)}>
                              <UserMinus className="mr-2 h-4 w-4" /> {u.joined ? 'Remove admin access' : 'Cancel invite'}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <SimplePagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPageChange={setPage} />

      <Dialog open={!!editing} onOpenChange={(o) => !o && !savingEdit && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editing?.name || 'account'}</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">{editing?.role === 'vendor' ? 'Store name' : 'Name'}</Label>
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input id="edit-phone" type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              {!editPhoneOk && <p className="text-xs text-destructive">Enter a full phone number.</p>}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={savingEdit}>Cancel</Button>
            <Button onClick={saveEdit} disabled={savingEdit || editName.trim().length < 2 || !editPhoneOk}>
              {savingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={(o) => !inviting && setInviteOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite an admin</DialogTitle>
            <DialogDescription>
              They get an email to set a password, then they can log in with full admin access. Use an email that doesn't
              already have a Cydex account.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={invite} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Name</Label>
              <Input id="invite-name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)} disabled={inviting}>Cancel</Button>
              <Button type="submit" disabled={inviting || inviteName.trim().length < 2 || !inviteEmail.includes('@')}>
                {inviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send invite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={!!suspending}
        title={`Are you sure you want to suspend ${suspending?.name ?? 'this customer'}?`}
        description="They see an “Account suspended” screen with your reason and can't place orders until you reinstate them. They also get an email."
        confirmLabel="Yes, suspend"
        placeholder="e.g. Repeated failed payments"
        destructive
        onClose={() => setSuspending(null)}
        onConfirm={async (reason) => {
          const { error } = await supabase.rpc('admin_set_customer_suspended', { p_profile_id: suspending!.id, p_suspended: true, p_reason: reason });
          if (error) throw error;
          toast.success('Customer suspended');
          setSuspending(null);
          refresh();
        }}
      />

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && !busyId && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{removing?.joined ? `Are you sure you want to remove ${removing?.name || removing?.email}'s admin access?` : `Are you sure you want to cancel the invite to ${removing?.email}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.joined
                ? 'They lose admin access straight away. Their login stays, as a regular customer account.'
                : 'The link in their email stops working.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busyId}>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!!busyId}
              onClick={(e) => { e.preventDefault(); if (removing) adminAction('remove', removing); }}
            >
              {busyId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {removing?.joined ? 'Yes, remove access' : 'Yes, cancel invite'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
