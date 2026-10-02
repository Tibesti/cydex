import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { CartItem } from '@/hooks/useCart';

interface CartVendorConflictDialogProps {
  conflict: { item: Omit<CartItem, 'quantity'>; quantity: number } | null;
  cartVendorName?: string;
  onResolve: (startNewCart: boolean) => void;
}

// Each order is from one vendor, so adding another vendor's item asks first
const CartVendorConflictDialog = ({ conflict, cartVendorName, onResolve }: CartVendorConflictDialogProps) => (
  <AlertDialog open={!!conflict} onOpenChange={(open) => !open && onResolve(false)}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>One vendor per order</AlertDialogTitle>
        <AlertDialogDescription>
          Your cart has items from <span className="font-medium text-foreground">{cartVendorName || 'another vendor'}</span>.
          You can only order from one vendor at a time, because each order is prepared and delivered from one store.
          Start a new cart with {conflict?.item.name} from{' '}
          <span className="font-medium text-foreground">{conflict?.item.vendor_name}</span>? Your current cart will be emptied.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={() => onResolve(false)}>Keep current cart</AlertDialogCancel>
        <AlertDialogAction onClick={() => onResolve(true)}>Start new cart</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default CartVendorConflictDialog;
