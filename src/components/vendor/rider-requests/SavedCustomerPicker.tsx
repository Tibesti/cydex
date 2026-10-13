import { useState } from 'react';
import { Check, ChevronsUpDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Tables } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';

export type SavedCustomer = Tables<'vendor_customers'>;

interface Props {
  customers: SavedCustomer[];
  selectedId: string | null;
  onPick: (c: SavedCustomer) => void;
  onRemove: (c: SavedCustomer) => void;
}

// A searchable dropdown of the vendor's saved customers (the list can get long)
const SavedCustomerPicker = ({ customers, selectedId, onPick, onRemove }: Props) => {
  const [open, setOpen] = useState(false);
  const selected = customers.find((c) => c.id === selectedId);
  if (customers.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? `${selected.name} · ${selected.phone}` : `Choose a saved customer (${customers.length})`}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name, phone or address" />
          <CommandList>
            <CommandEmpty>No saved customer matches.</CommandEmpty>
            <CommandGroup>
              {customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.phone} ${c.email ?? ''} ${c.formatted_address}`}
                  onSelect={() => { onPick(c); setOpen(false); }}
                  className="items-start gap-2"
                >
                  <Check className={cn('mt-0.5 h-4 w-4 shrink-0', selectedId === c.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.phone} · {c.formatted_address}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${c.name}`}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); onRemove(c); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SavedCustomerPicker;
