// Product availability (docs/ORDER_FLOW.md → Products and stock). The database
// keeps status in line with stock: a stock-tracked product is 'active' while
// it has stock and 'out_of_stock' at 0; other products are 'active' or
// 'inactive' (the vendor's toggle).
export interface StockInfo {
  status: string | null;
  track_stock?: boolean | null;
  stock_quantity?: number | null;
}

export const isAvailable = (p: StockInfo) => p.status === 'active';

// Most a customer can add: the stock for tracked products, otherwise no limit
export const maxOrderable = (p: StockInfo) =>
  p.track_stock ? Math.max(0, p.stock_quantity ?? 0) : Number.POSITIVE_INFINITY;

export const stockLabel = (p: StockInfo): string | null => {
  if (!isAvailable(p)) return p.status === 'out_of_stock' ? 'Out of stock' : 'Unavailable';
  if (p.track_stock && p.stock_quantity != null) return `${p.stock_quantity} left`;
  return null;
};

// Cart limit for a product: its stock when tracked, otherwise no limit (null)
export const stockLimit = (p: StockInfo): number | null =>
  p.track_stock ? Math.max(0, p.stock_quantity ?? 0) : null;
