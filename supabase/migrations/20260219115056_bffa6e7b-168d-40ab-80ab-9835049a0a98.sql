
-- Fix security definer view by explicitly setting SECURITY INVOKER
-- This ensures RLS policies of the querying user are enforced
ALTER VIEW public.v_loan_arrears SET (security_invoker = on);
