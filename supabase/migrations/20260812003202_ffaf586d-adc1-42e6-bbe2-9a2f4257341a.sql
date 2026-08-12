CREATE OR REPLACE FUNCTION public.es_miembro_de(_comedor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS(SELECT 1 FROM public.usuarios_comedor
                WHERE user_id = auth.uid() AND comedor_id = _comedor_id)
      OR public.has_role(auth.uid(), 'admin')
$function$;

ALTER TABLE public.invitaciones ALTER COLUMN comedor_id DROP NOT NULL;