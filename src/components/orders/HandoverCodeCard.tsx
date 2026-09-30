import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type Kind = 'pickup' | 'delivery';

const COPY: Record<Kind, { title: string; hint: string; used: string }> = {
  pickup: {
    title: 'Pickup code',
    hint: 'Give this code to the vendor when you collect the order.',
    used: 'The vendor confirmed the pickup.',
  },
  delivery: {
    title: 'Delivery code',
    hint: 'Give this code to your rider when the order arrives. Only share it once you have your order.',
    used: 'Your rider confirmed the delivery.',
  },
};

// The giving side of a handover. The database only returns a code to the
// person meant to give it (the rider sees the pickup code, the customer the
// delivery code), and only once the vendor has accepted the order.
const HandoverCodeCard = ({ orderId, kind, className }: { orderId: string; kind: Kind; className?: string }) => {
  const { data: code } = useQuery({
    queryKey: ['handover-code', orderId, kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_handover_codes')
        .select('code, used_at')
        .eq('order_id', orderId)
        .eq('kind', kind)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => (query.state.data?.used_at ? false : 15000),
  });

  if (!code) return null;
  const copy = COPY[kind];

  return (
    <div className={cn('rounded-lg border border-primary/40 bg-primary/5 p-4', className)}>
      <div className="flex items-center gap-2 text-sm font-medium">
        {code.used_at ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <KeyRound className="h-4 w-4" />}
        {copy.title}
      </div>
      {code.used_at ? (
        <p className="mt-1 text-sm text-muted-foreground">{copy.used}</p>
      ) : (
        <>
          <p className="mt-2 font-mono text-3xl font-bold tracking-[0.4em]">{code.code}</p>
          <p className="mt-1 text-sm text-muted-foreground">{copy.hint}</p>
        </>
      )}
    </div>
  );
};

export default HandoverCodeCard;
