import { supabase } from '@/integrations/supabase/client';

// Calls a Supabase Edge Function and throws with the function's own error
// message ({ error }) instead of the generic "non-2xx status code".
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    try {
      const payload = await (error as { context?: Response }).context?.json();
      if (payload?.error) message = String(payload.error);
    } catch {
      // response wasn't JSON
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}
