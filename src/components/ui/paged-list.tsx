import { Fragment, type ReactNode } from 'react';
import SimplePagination from '@/components/ui/simple-pagination';
import { PAGE_SIZE, usePaged } from '@/lib/pagination';

interface PagedListProps<T> {
  items: T[];
  render: (item: T, index: number) => ReactNode;
  getKey?: (item: T, index: number) => string | number;
  /** Back to page 1 when this changes (filters, search) */
  resetKey?: unknown;
  pageSize?: number;
  /** Around the Previous / Next bar, e.g. padding inside a card */
  paginationClassName?: string;
}

// A list that's already loaded in full, shown a page at a time
function PagedList<T>({ items, render, getKey, resetKey, pageSize = PAGE_SIZE, paginationClassName }: PagedListProps<T>) {
  const paged = usePaged(items, resetKey, pageSize);
  return (
    <>
      {paged.items.map((item, i) => (
        <Fragment key={getKey ? getKey(item, i) : i}>{render(item, i)}</Fragment>
      ))}
      {paged.pageCount > 1 && (
        <div className={paginationClassName}>
          <SimplePagination page={paged.page} pageCount={paged.pageCount} onPageChange={paged.setPage} />
        </div>
      )}
    </>
  );
}

export default PagedList;
