import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SimplePaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

// Previous / "Page x of y" / Next. Renders nothing for a single page.
const SimplePagination = ({ page, pageCount, onPageChange }: SimplePaginationProps) => {
  if (pageCount <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-2 pt-2" aria-label="Pagination">
      <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        <ChevronLeft className="mr-1 h-4 w-4" />
        Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page} of {pageCount}
      </span>
      <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount}>
        Next
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </nav>
  );
};

export default SimplePagination;
