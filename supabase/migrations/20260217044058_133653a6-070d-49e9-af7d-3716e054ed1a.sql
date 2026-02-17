
ALTER TABLE public.feedback_submissions
ADD COLUMN submitter_name text NOT NULL DEFAULT '',
ADD COLUMN submitter_state text NOT NULL DEFAULT '',
ADD COLUMN submitter_branch text NOT NULL DEFAULT '';
