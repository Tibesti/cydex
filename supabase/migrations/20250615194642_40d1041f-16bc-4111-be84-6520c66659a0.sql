
-- Drop the existing problematic policy and create a proper one
DROP POLICY IF EXISTS "Users can create their own rider profile" ON public.rider_profiles;

-- Create a proper policy that allows users to insert their own rider profile
CREATE POLICY "Users can insert their own rider profile" 
  ON public.rider_profiles 
  FOR INSERT 
  WITH CHECK (auth.uid() = id);

-- Also ensure the SELECT policy is working correctly
DROP POLICY IF EXISTS "Users can view their own rider profile" ON public.rider_profiles;

CREATE POLICY "Users can view their own rider profile" 
  ON public.rider_profiles 
  FOR SELECT 
  USING (auth.uid() = id);
