import { Link } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface PhoneRequiredNoticeProps {
  /** e.g. "accept orders" */
  action: string;
  /** Who needs to reach them, e.g. "Riders and customers" */
  audience: string;
  /** Where the phone number is edited */
  href: string;
  linkLabel: string;
}

// Shown to vendors and riders who can't accept work until their profile has a
// phone number (enforced by vendor_accept_order / rider_accept_order).
const PhoneRequiredNotice = ({ action, audience, href, linkLabel }: PhoneRequiredNoticeProps) => (
  <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-50">
    <Phone className="h-4 w-4 !text-amber-600 dark:!text-amber-300" />
    <AlertTitle>Add your phone number to {action}</AlertTitle>
    <AlertDescription>
      {audience} need a way to reach you.{' '}
      <Link to={href} className="font-medium underline underline-offset-2">
        {linkLabel}
      </Link>
      .
    </AlertDescription>
  </Alert>
);

export default PhoneRequiredNotice;
