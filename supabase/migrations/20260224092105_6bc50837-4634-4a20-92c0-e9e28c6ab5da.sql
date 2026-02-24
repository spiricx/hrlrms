-- Allow all authenticated users to view all staff members
CREATE POLICY "All authenticated users can view staff"
ON public.staff_members
FOR SELECT
TO authenticated
USING (true);