-- Must live in its own migration: new enum values cannot be used in the same transaction.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';
