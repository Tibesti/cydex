import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, MapPin, Plus, Settings } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAddresses } from '@/hooks/useAddresses';
import { addressHeadline, errorMessage } from '@/lib/address';
import { AddressPickerDialog } from '@/components/address/AddressPickerDialog';
import { AddressLabelIcon } from '@/components/address/AddressLabelIcon';

// "Deliver to" bar at the top of customer pages: shows the default address
// and lets the customer switch it, add one, or manage their addresses.
const DeliveryAddressBar = () => {
  const navigate = useNavigate();
  const { addresses, defaultAddress, isLoading, setDefaultAddress } = useAddresses();
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleSelect = async (id: string) => {
    if (id === defaultAddress?.id) return;
    try {
      await setDefaultAddress(id);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not change your delivery address'));
    }
  };

  return (
    <div className="bg-background px-3 sm:px-4 md:px-6 py-2">
      {isLoading ? (
        <div className="h-5 w-48 animate-pulse rounded bg-muted" />
      ) : !defaultAddress ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <MapPin className="h-4 w-4" />
          Add a delivery address
        </button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex max-w-full items-center gap-2 rounded-md text-left text-sm hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MapPin className="h-4 w-4 shrink-0 text-primary" />
              <span className="shrink-0 text-muted-foreground">Deliver to</span>
              <span className="min-w-0 truncate">
                <span className="font-medium">{defaultAddress.label}</span>
                <span className="text-muted-foreground"> · {addressHeadline(defaultAddress)}</span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-2rem)]">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Deliver to</DropdownMenuLabel>
            {addresses.map((address) => (
              <DropdownMenuItem
                key={address.id}
                onSelect={() => handleSelect(address.id)}
                className="cursor-pointer items-start gap-2"
              >
                <AddressLabelIcon label={address.label} className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{address.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{addressHeadline(address)}</span>
                </span>
                {address.is_default && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setPickerOpen(true)} className="cursor-pointer">
              <Plus className="mr-2 h-4 w-4" />
              Add new address
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/customer/profile?tab=addresses')} className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              Manage addresses
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <AddressPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
    </div>
  );
};

export default DeliveryAddressBar;
