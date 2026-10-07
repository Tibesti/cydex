import { PlusSquare, Share } from 'lucide-react';

// Safari has no install button, so we show where to tap
const IosInstallSteps = ({ className }: { className?: string }) => (
  <ol className={className ?? 'space-y-1 text-sm'}>
    <li className="flex items-center gap-1.5">
      1. Tap <Share className="inline h-4 w-4" aria-label="Share" /> <span className="font-medium">Share</span> in Safari's toolbar
    </li>
    <li className="flex items-center gap-1.5">
      2. Choose <PlusSquare className="inline h-4 w-4" aria-hidden /> <span className="font-medium">Add to Home Screen</span>
    </li>
  </ol>
);

export default IosInstallSteps;
