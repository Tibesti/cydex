import PhoneRequiredNotice from '@/components/profile/PhoneRequiredNotice';

const VendorPhoneNotice = () => (
  <PhoneRequiredNotice
    action="accept orders"
    audience="Riders and customers"
    href="/vendor/settings"
    linkLabel="Add it in Settings"
  />
);

export default VendorPhoneNotice;
