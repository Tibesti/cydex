import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { DEFAULT_HOURS, hoursProblem, type OpeningHours } from '@/lib/openingHours';
import OpeningHoursEditor from './OpeningHoursEditor';

// Vendor Settings: preparation time and opening hours
const StoreHoursCard = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [prep, setPrep] = useState('15');
  const [hours, setHours] = useState<OpeningHours>(DEFAULT_HOURS);
  const [saving, setSaving] = useState(false);

  const { data: saved, isLoading } = useQuery({
    queryKey: ['my-vendor-hours', user?.id],
    enabled: !!user?.id,
    queryFn: async () => (await supabase.from('vendor_hours').select('prep_time_minutes, opening_hours').eq('vendor_id', user!.id).maybeSingle()).data,
  });
  const { data: isOpen } = useQuery({
    queryKey: ['my-vendor-open', user?.id, saved?.opening_hours],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => (await supabase.rpc('vendor_hours_info', { p_vendor_ids: [user!.id] })).data?.[0] ?? null,
  });

  const savedHours = saved?.opening_hours && Object.keys(saved.opening_hours as object).length ? (saved.opening_hours as OpeningHours) : null;
  useEffect(() => {
    if (!saved) return;
    setPrep(String(saved.prep_time_minutes));
    if (savedHours) setHours(savedHours);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const problem = hoursProblem(hours);
  const prepOk = prep !== '' && Number(prep) >= 0 && Number(prep) <= 240;
  const changed = !savedHours || JSON.stringify(hours) !== JSON.stringify(savedHours) || Number(prep) !== saved?.prep_time_minutes;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('set_vendor_hours', { p_prep_time_minutes: Number(prep), p_opening_hours: hours });
    setSaving(false);
    if (error) return toast.error(errorMessage(error, 'Could not save your hours'));
    toast.success('Hours saved');
    queryClient.invalidateQueries({ queryKey: ['my-vendor-hours'] });
    queryClient.invalidateQueries({ queryKey: ['vendor-hours-info'] });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Clock className="h-4 w-4" /> Opening hours and preparation time
          {isOpen && savedHours && (
            <Badge variant="outline" className={isOpen.is_open
              ? 'border-transparent bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300'
              : 'border-transparent bg-muted text-muted-foreground'}>
              {isOpen.is_open ? 'Open now' : 'Closed now'}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {savedHours ? 'Customers can only order while you’re open.' : 'You haven’t set your hours yet, so customers can order at any time. Set them below.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <div className="h-48 animate-pulse rounded bg-muted" /> : (
          <>
            <OpeningHoursEditor prepMinutes={prep} onPrepChange={setPrep} hours={hours} onHoursChange={setHours} disabled={saving} />
            {problem && <p className="text-xs text-destructive">{problem}</p>}
            <Button onClick={save} disabled={saving || !changed || !!problem || !prepOk}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save hours
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default StoreHoursCard;
