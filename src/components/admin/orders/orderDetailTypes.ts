import type { Tables } from '@/integrations/supabase/types';

// Shape returned by admin_order_detail()
export interface AdminPerson {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status?: string | null;
  verification_status?: string | null;
  vehicle_type?: string | null;
  rating?: number | null;
  rider_status?: string | null;
}

export interface AdminOrderDetail {
  order: Omit<Tables<'orders'>, 'verification_code'> & { delivery_address: Record<string, unknown> | null };
  customer: AdminPerson | null;
  vendor: AdminPerson | null;
  rider: AdminPerson | null;
  pickup: Record<string, unknown> | null;
  items: { name: string; quantity: number; unit_price: number; total_price: number }[];
  hold: {
    status: string; total_amount: number; vendor_amount: number; rider_amount: number; platform_fee: number;
    created_at: string; vendor_released_at: string | null; rider_released_at: string | null;
  } | null;
  split: {
    paid_by: string; amount_paid: number; vendor_got: number; rider_got: number;
    cydex_from_customer: number; cydex_from_vendor: number; cydex_from_rider: number; cydex_total: number;
  } | null;
  codes: { kind: 'pickup' | 'delivery'; failed_attempts: number; used_at: string | null; created_at: string; locked: boolean }[];
  delivery: {
    status: string; accepted_at: string | null; picking_up_at: string | null; picked_up_at: string | null;
    delivered_at: string | null; cancelled_at: string | null; rider_earning: number | null;
  } | null;
  transactions: { who: 'customer' | 'vendor' | 'rider'; type: string; amount: number; status: string; description: string | null; created_at: string }[];
  ratings: {
    vendor: { rating: number; feedback: string | null; hidden_at: string | null } | null;
    rider: { rating: number; feedback: string | null; hidden_at: string | null } | null;
  };
  admin_actions: { action: string; admin: string | null; details: Record<string, unknown> | null; created_at: string }[];
}

export const addressText = (a: Record<string, unknown> | null | undefined) =>
  a ? String(a.formatted_address ?? a.address ?? a.street ?? '') : '';
