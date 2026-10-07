// A usable phone number: at least 7 digits. Mirrors public.is_valid_phone in
// the database, so placeholder text such as "No phone" is treated as missing.
export const isValidPhone = (phone?: string | null): phone is string =>
  (phone ?? '').replace(/\D/g, '').length >= 7;
