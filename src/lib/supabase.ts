
import { createClient } from '@supabase/supabase-js';
import { type Database } from '@/types/supabase';

// Initialize the Supabase client
const supabaseUrl = 'https://hsnguuozyigpzstwqkrk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhzbmd1dW96eWlncHpzdHdxa3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4OTU5OTAsImV4cCI6MjEwNTQ3MTk5MH0.W_gzt6ovmXPz36vsroD_MFXjc6vkMjzevYvUtv5yTvs';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
