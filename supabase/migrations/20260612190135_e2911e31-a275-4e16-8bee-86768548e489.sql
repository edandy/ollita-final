-- Fix privilege escalation: restrict UPDATE on usuarios_comedor to presidenta of the same comedor.
-- Role/cargo changes and member edits flow through server functions (which verify presidenta).
DROP POLICY IF EXISTS "actualizar mi vinculo" ON public.usuarios_comedor;

CREATE POLICY "presidenta actualiza vinculos"
ON public.usuarios_comedor
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios_comedor uc
    WHERE uc.user_id = auth.uid()
      AND uc.comedor_id = usuarios_comedor.comedor_id
      AND uc.cargo = 'presidenta'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.usuarios_comedor uc
    WHERE uc.user_id = auth.uid()
      AND uc.comedor_id = usuarios_comedor.comedor_id
      AND uc.cargo = 'presidenta'
  )
);

-- Same for DELETE: only presidenta can remove members; users can no longer self-delete via client.
DROP POLICY IF EXISTS "eliminar mi vinculo" ON public.usuarios_comedor;

CREATE POLICY "presidenta elimina vinculos"
ON public.usuarios_comedor
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios_comedor uc
    WHERE uc.user_id = auth.uid()
      AND uc.comedor_id = usuarios_comedor.comedor_id
      AND uc.cargo = 'presidenta'
  )
);