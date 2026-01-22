-- Add image_url column to questions table for image-based questions
alter table public.questions
  add column if not exists image_url text;

-- Add comment
comment on column public.questions.image_url is
  'Optional URL to an image associated with the question';
