import React from 'react';
import { Briefcase, Building2, Home, MapPin, Store } from 'lucide-react';

const LABEL_ICONS: Record<string, React.ElementType> = {
  Home,
  Hostel: Building2,
  Office: Briefcase,
  Store,
};

// Icon for an address label; custom labels get a map pin
export const AddressLabelIcon = ({ label, className }: { label: string; className?: string }) => {
  const Icon = LABEL_ICONS[label] ?? MapPin;
  return <Icon className={className} />;
};
