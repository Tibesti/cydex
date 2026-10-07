-- Allow customers to view vendor profiles for vendor selection
CREATE POLICY "Customers can view vendor profiles" 
ON public.profiles 
FOR SELECT 
USING (role = 'vendor' OR role = 'VENDOR');