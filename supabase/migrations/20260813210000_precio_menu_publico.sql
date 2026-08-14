ALTER TABLE public.comedores
  ADD COLUMN IF NOT EXISTS precio_menu_publico NUMERIC(6,2);
