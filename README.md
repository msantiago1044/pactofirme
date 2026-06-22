# PactoFirme

> Cuentas claras. Amistades largas.

Notario digital para formalizar préstamos entre personas: pagaré legal en PDF, firma en pantalla, tabla de amortización y libro mayor de abonos inmutable.

## Stack

- **Frontend:** Vite + React + Tailwind CSS + Lucide React + jsPDF (PDF del lado del cliente)
- **eKYC:** Vercel Serverless Function (`/api/verify-kyc.js`) → GLM-4V (ZhipuAI) para OCR de cédula
- **Base de datos:** Supabase PostgreSQL
- **Mailing:** Resend (`/api/send-pagare-email.js`)

## Arranque rápido (modo demo, sin backend)

```bash
npm install
cp .env.example .env   # opcional en modo demo
npm run dev
```

Sin configurar Supabase, la app funciona en **modo demo**: usa `mockPact.json`
(un préstamo de 6 cuotas — 3 pagadas, 1 en revisión, 2 pendientes) para que puedas
probar la tabla de amortización y los botones del Libro Mayor hoy mismo. Visita
`/pacto/a3f1c8e2-7b4d-4e6a-9c0d-1f2e3a4b5c6d` para verlo directamente.

## Arranque con backend real

1. Crea un proyecto en [Supabase](https://supabase.com).
2. Ejecuta `sql/schema.sql` en el SQL Editor de Supabase (crea tablas, RLS, bucket KYC).
3. Ejecuta `sql/cleanup_job.sql` para activar el borrado automático de imágenes de cédula abandonadas.
4. Completa `.env` con tus credenciales (ver `.env.example`).
5. Despliega en Vercel: `vercel deploy` (las funciones en `/api` se despliegan automáticamente).

## Estructura

```
src/
  App.jsx                    # Router de las 3 fases
  components/
    PactCreationForm.jsx      # Fase A — formulario del prestador
    VirtualNotaryView.jsx     # Fase B — eKYC + firma + sello
    LedgerDashboard.jsx       # Fase C — libro mayor de abonos
    LenderDashboard.jsx       # Dashboard del prestador
    SignatureCanvas.jsx       # Captura de firma táctil
    NotarySeal.jsx            # Sello notarial animado
  lib/
    amortization.js           # Cálculo de tabla de amortización
    crypto.js                 # SHA-256 del sello (Web Crypto API)
    generatePagarePDF.js       # Compilación del PDF legal
    supabaseClient.js
    useDocumentMeta.js         # Título/favicon dinámicos por fase
api/
  verify-kyc.js                # OCR de cédula vía GLM-4V
  cleanup-kyc-image.js         # Borrado de imagen tras firma
  send-pagare-email.js         # Envío del PDF por correo
sql/
  schema.sql                   # Tablas + RLS de inmutabilidad
  cleanup_job.sql              # Job de TTL para imágenes KYC
mockPact.json                  # Datos de prueba
```

## Notas legales y de privacidad (leer antes de producción)

- **El Pagaré es una plantilla técnica**, redactada con referencia al Código de
  Comercio colombiano (pagaré a la orden). No sustituye asesoría legal; se
  recomienda revisión por un abogado para montos significativos.
- **El hash SHA-256 prueba integridad del archivo**, no es por sí solo una
  certificación de identidad. El documento lo declara explícitamente en su pie de
  sello para no sobre-prometer validez legal.
- **Las fotos de cédula son temporales**: se almacenan en el bucket privado
  `kyc-temp` (solo accesible por `service_role`, nunca por el cliente) y se
  borran automáticamente al confirmarse la firma. Si el deudor abandona el
  flujo, el job de `cleanup_job.sql` las borra a las 24 horas.
- Ajusta las políticas RLS de `pacts_select_participants` antes de producción
  multi-tenant: el MVP las deja abiertas (`using (true)`) para simplificar
  las pruebas iniciales.
