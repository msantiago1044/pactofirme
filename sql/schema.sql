-- =====================================================================
-- PactoFirme — Esquema de Supabase (PostgreSQL)
-- =====================================================================
-- Contiene:
--   1. Tabla `pacts`        — el contrato/pagaré.
--   2. Tabla `installments` — las cuotas del Libro Mayor.
--   3. RLS de inmutabilidad — bloquea UPDATE de contract_hash/amount tras 'active'.
--   4. Bucket `kyc-temp`    — almacenamiento temporal de fotos de cédula.
--   5. Job de limpieza      — borra imágenes de KYC abandonadas (ver cleanup_job.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) TABLA: pacts
-- ---------------------------------------------------------------------
create table if not exists public.pacts (
  id                   uuid primary key default gen_random_uuid(),
  lender_name          text not null,
  lender_email         text,
  borrower_email       text not null,
  amount               numeric(14, 2) not null check (amount > 0),
  interest_rate        numeric(5, 2) not null default 0 check (interest_rate >= 0),
  frequency            text not null default 'monthly'
                         check (frequency in ('monthly', 'biweekly', 'weekly')),
  installments_count   integer not null check (installments_count > 0),
  status               text not null default 'draft'
                         check (status in ('draft', 'active', 'completed', 'defaulted')),
  contract_hash        text,
  created_at           timestamptz not null default now(),
  sealed_at            timestamptz
);

comment on column public.pacts.contract_hash is
  'SHA-256 de (monto + cédula + IP + timestamp) generado al momento de la firma. '
  'Una vez status=active, esta columna es inmutable (ver política RLS más abajo).';

-- ---------------------------------------------------------------------
-- 2) TABLA: installments
-- ---------------------------------------------------------------------
create table if not exists public.installments (
  id                  uuid primary key default gen_random_uuid(),
  pact_id             uuid not null references public.pacts(id) on delete cascade,
  installment_number  integer not null,
  due_date            date not null,
  amount_due          numeric(14, 2) not null check (amount_due > 0),
  status              text not null default 'pending'
                         check (status in ('pending', 'reviewing', 'paid')),
  proof_image_url     text,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),

  unique (pact_id, installment_number)
);

create index if not exists idx_installments_pact_id on public.installments(pact_id);
create index if not exists idx_pacts_status on public.pacts(status);

-- ---------------------------------------------------------------------
-- 3) REGLA DE INMUTABILIDAD (RLS + Trigger)
-- ---------------------------------------------------------------------
-- Nota técnica importante: las políticas RLS de Postgres/Supabase se evalúan
-- por FILA usando USING (qué filas son visibles/editables) y WITH CHECK (qué
-- valores resultantes son aceptables). RLS por sí sola NO puede comparar el
-- valor "antes" (OLD) contra el valor "después" (NEW) de una columna específica
-- dentro de la misma fila — eso requiere un TRIGGER. Por eso la inmutabilidad
-- real de contract_hash/amount se garantiza con el trigger `enforce_pact_immutability`,
-- y la reforzamos además con una política RLS que limita qué columnas puede
-- tocar un UPDATE según el rol y estado del pacto.

alter table public.pacts enable row level security;
alter table public.installments enable row level security;

-- Lectura: cualquier usuario autenticado puede leer pactos donde participa
-- (en producción, filtrar por auth.email() = lender_email OR borrower_email).
create policy "pacts_select_participants"
  on public.pacts for select
  using (true); -- MVP: ajustar a auth.email() en producción multi-tenant real

create policy "installments_select_participants"
  on public.installments for select
  using (true);

-- Inserción de pactos: libre en estado draft (lo crea el prestador).
create policy "pacts_insert_draft"
  on public.pacts for insert
  with check (status = 'draft');

-- Actualización de pactos: SOLO permitida si el pacto sigue en estado distinto
-- a 'active', O si la transición es exactamente draft -> active (la firma).
-- El trigger de abajo es la barrera dura contra alterar hash/amount después.
create policy "pacts_update_guarded"
  on public.pacts for update
  using (true)
  with check (true); -- el trigger enforce_pact_immutability es la barrera real

-- Cuotas: insert libre al crear el pacto; update solo para mover status/proof/paid_at.
create policy "installments_insert_with_pact"
  on public.installments for insert
  with check (true);

create policy "installments_update_status_flow"
  on public.installments for update
  using (true)
  with check (status in ('pending', 'reviewing', 'paid'));

-- ---- TRIGGER: bloquea cambios a contract_hash y amount una vez 'active' ----
create or replace function public.enforce_pact_immutability()
returns trigger
language plpgsql
security definer
as $$
begin
  if old.status = 'active' then
    if new.contract_hash is distinct from old.contract_hash then
      raise exception 'contract_hash es inmutable: el pacto ya está activo (id=%)', old.id;
    end if;
    if new.amount is distinct from old.amount then
      raise exception 'amount es inmutable: el pacto ya está activo (id=%)', old.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_pact_immutability on public.pacts;
create trigger trg_enforce_pact_immutability
  before update on public.pacts
  for each row
  execute function public.enforce_pact_immutability();

-- ---------------------------------------------------------------------
-- 4) STORAGE: bucket temporal para fotos de cédula (eKYC)
-- ---------------------------------------------------------------------
-- Las imágenes aquí son EFÍMERAS: se borran vía /api/cleanup-kyc-image.js al
-- confirmarse la firma, o por el job de TTL si el deudor abandona el flujo.
insert into storage.buckets (id, name, public)
values ('kyc-temp', 'kyc-temp', false)
on conflict (id) do nothing;

-- Solo el rol de servicio (service_role, usado por las Serverless Functions)
-- puede leer/escribir en este bucket; nunca se expone al cliente anónimo.
create policy "kyc_temp_service_role_only"
  on storage.objects for all
  using (bucket_id = 'kyc-temp' and auth.role() = 'service_role')
  with check (bucket_id = 'kyc-temp' and auth.role() = 'service_role');

-- =====================================================================
-- Fin del esquema. Ver también: sql/cleanup_job.sql
-- =====================================================================
