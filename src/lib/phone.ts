// A usable phone number: at least 7 digits. Mirrors public.is_valid_phone in
// the database, so placeholder text such as "No phone" is treated as missing.
export const isValidPhone = (phone?: string | null): phone is string =>
  (phone ?? '').replace(/\D/g, '').length >= 7;

// Same rule as the database's is_valid_email()
export const isValidEmail = (email?: string | null): email is string =>
  /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((email ?? '').trim());
