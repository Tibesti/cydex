import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/contexts/ConfirmContext';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';

// The categories vendors choose from at onboarding
const BusinessCategories = () => {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const { data: categories = [] } = useQuery({
    queryKey: ['admin-business-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('business_categories').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-business-categories'] });
    queryClient.invalidateQueries({ queryKey: ['business-categories'] });
  };

  const add = async () => {
    if (!(await confirm({
      title: `Are you sure you want to add “${name.trim()}”?`,
      description: 'Vendors can pick it when they set up their store.',
      confirmLabel: 'Yes, add it',
    }))) return;
    const { error } = await supabase.from('business_categories').insert({ name: name.trim() });
    if (error) return toast.error(errorMessage(error, 'Could not add the category'));
    setName('');
    refresh();
  };
  const toggle = async (id: string, label: string, isActive: boolean) => {
    if (!(await confirm({
      title: `Are you sure you want to ${isActive ? 'show' : 'hide'} “${label}”?`,
      description: isActive ? 'Vendors can pick it again.' : 'New vendors can’t pick it. Stores already in it keep it.',
      confirmLabel: isActive ? 'Yes, show it' : 'Yes, hide it',
      destructive: !isActive,
    }))) return;
    const { error } = await supabase.from('business_categories').update({ is_active: isActive }).eq('id', id);
    if (error) return toast.error(errorMessage(error, 'Could not update the category'));
    refresh();
  };

  return (
    <div className="max-w-lg space-y-4">
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category, e.g. Pharmacy" maxLength={60} />
        <Button onClick={add} disabled={!name.trim()}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>
      <ul className="divide-y rounded-lg border">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 p-3">
            <span className={c.is_active ? '' : 'text-muted-foreground line-through'}>{c.name}</span>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Offered
              <Switch checked={c.is_active} onCheckedChange={(v) => toggle(c.id, c.name, v)} />
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Turning a category off hides it from new sign-ups; vendors already in it keep it.</p>
    </div>
  );
};

export default BusinessCategories;
