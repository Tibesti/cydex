import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SimplePagination from '@/components/ui/simple-pagination';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/pricing';
import { PAGE_SIZE } from '@/lib/pagination';


// Everyone's Cydex wallet, biggest balance first
const WalletsTab = () => {
  const [role, setRole] = useState('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-wallets', role, debounced, page],
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_wallets', {
        p_role: role === 'all' ? undefined : role, p_search: debounced || undefined,
        p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const total = Number(rows[0]?.total_count ?? 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 xs:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input type="search" placeholder="Name or email" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={role} onValueChange={(v) => { setRole(v); setPage(1); }}>
          <SelectTrigger className="xs:w-40" aria-label="Role"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="customer">Customers</SelectItem>
            <SelectItem value="vendor">Vendors</SelectItem>
            <SelectItem value="rider">Riders</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading && rows.length === 0 ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-muted" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No wallets match.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((w) => (
                <li key={`${w.role}-${w.profile_id}`} className="flex items-center gap-3 p-3 sm:px-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="truncate">{w.name ?? 'Unnamed'}</span>
                      <Badge variant="outline" className="capitalize">{w.role}</Badge>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{w.email}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold">{formatNaira(Number(w.available_balance ?? 0))}</p>
                    {w.total_earned != null && (
                      <p className="text-xs text-muted-foreground">
                        Earned {formatNaira(Number(w.total_earned))} · Withdrawn {formatNaira(Number(w.total_withdrawn ?? 0))}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <SimplePagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPageChange={setPage} />
    </div>
  );
};

export default WalletsTab;
