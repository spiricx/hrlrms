CREATE POLICY "Users can rate own feedback"
ON public.feedback_submissions
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);