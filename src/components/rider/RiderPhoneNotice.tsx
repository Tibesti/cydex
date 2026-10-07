import PhoneRequiredNotice from '@/components/profile/PhoneRequiredNotice';
import { useHasPhone } from '@/hooks/useHasPhone';

// Renders nothing once the rider has a phone number
const RiderPhoneNotice = () => {
  const hasPhone = useHasPhone();
  if (hasPhone) return null;
  return (
    <PhoneRequiredNotice
      action="accept deliveries"
      audience="Customers and vendors"
      href="/rider/profile"
      linkLabel="Add it in Profile → Personal"
    />
  );
};

export default RiderPhoneNotice;
