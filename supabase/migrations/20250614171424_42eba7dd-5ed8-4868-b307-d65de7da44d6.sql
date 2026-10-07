
-- Enable RLS on rider_profiles table (if not already enabled)
ALTER TABLE public.rider_profiles ENABLE ROW LEVEL SECURITY;

-- Create policy that allows users to view their own rider profile
CREATE POLICY "Users can view their own rider profile" 
  ON public.rider_profiles 
  FOR SELECT 
  USING (auth.uid() = id);

-- Create policy that allows users to create their own rider profile
CREATE POLICY "Users can create their own rider profile" 
  ON public.rider_profiles 
  FOR INSERT 
  WITH CHECK (auth.uid() = id);

-- Create policy that allows users to update their own rider profile
CREATE POLICY "Users can update their own rider profile" 
  ON public.rider_profiles 
  FOR UPDATE 
  USING (auth.uid() = id);

-- Create policy that allows users to delete their own rider profile
CREATE POLICY "Users can delete their own rider profile" 
  ON public.rider_profiles 
  FOR DELETE 
  USING (auth.uid() = id);
