-- =====================================================================
-- PactoFirme — Job de limpieza de imágenes eKYC abandonadas
-- =====================================================================
-- Cubre el caso en que el deudor sube su cédula pero NUNCA llega a firmar
-- (cierra el navegador, abandona el flujo). La vía "feliz" de borrado
-- (al confirmar la firma) vive en /api/cleanup-kyc-image.js; este job es
-- el respaldo que garantiza que ninguna imagen quede más de TTL_HOURS.
--
-- Requiere la extensión pg_cron (disponible en Supabase: Database > Extensions).
-- =====================================================================

create extension if not exists pg_cron;

-- Borra objetos del bucket kyc-temp con más de 24 horas de antigüedad.
-- Ejecuta la función vía pg_cron cada hora.
create or replace function public.cleanup_stale_kyc_images()
returns void
language plpgsql
security definer
as $$
declare
  ttl_hours constant int := 24;
begin
  delete from storage.objects
  where bucket_id = 'kyc-temp'
    and created_at < (now() - (ttl_hours || ' hours')::interval);
end;
$$;

select cron.schedule(
  'cleanup-stale-kyc-images',  -- nombre del job
  '0 * * * *',                  -- cada hora, en el minuto 0
  $$ select public.cleanup_stale_kyc_images(); $$
);

-- Para revisar manualmente los jobs programados:
--   select * from cron.job;
-- Para desactivar este job:
--   select cron.unschedule('cleanup-stale-kyc-images');
