
-- Add receipt_url and notes columns to transactions table
ALTER TABLE public.transactions ADD COLUMN receipt_url text DEFAULT '';
ALTER TABLE public.transactions ADD COLUMN notes text DEFAULT '';
