import { useEffect, useState } from 'react';

// Lists across the app show this many rows per page
export const PAGE_SIZE = 10;

export const pageCount = (total: number, size = PAGE_SIZE) => Math.max(1, Math.ceil(total / size));

// For lists already loaded in full: the current page's slice. Goes back to
// page 1 when `resetKey` changes (e.g. a filter or search).
export function usePaged<T>(items: T[], resetKey?: unknown, size = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const pages = pageCount(items.length, size);
  const current = Math.min(page, pages);
  return {
    page: current,
    pageCount: pages,
    setPage,
    items: items.slice((current - 1) * size, current * size),
  };
}
