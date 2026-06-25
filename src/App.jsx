import { useState, useEffect, useCallback } from 'react';
import { Scale, Link as LinkIcon, MessageCircle, Copy, Check } from 'lucide-react';
import PactCreationForm from './components/PactCreationForm.jsx';
import VirtualNotaryView from './components/VirtualNotaryView.jsx';
import LedgerDashboard from './components/LedgerDashboard.jsx';
import LenderDashboard from './components/LenderDashboard.jsx';
import RoleSelector from './components/RoleSelector.jsx';
import NotarySeal from './components/NotarySeal.jsx';
import { useDocumentMeta, PHASE_META } from './lib/useDocumentMeta.js';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient.js';
import { pagarePDFBase64 } from './lib/generatePagarePDF.js';
import { getStoredViewerRole, storeViewerRole } from './lib/viewerRole.js';
import { buildAmortizationSchedule } from './lib/amortization.js';
import mockPact from '../mockPact.json';

/**
 * App.jsx
 * Enruta entre las 3 fases del flujo de PactoFirme según el estado de la URL:
 *
 *  - "/"                  -> Dashboard del Prestador (lista de pactos + botón nuevo pagaré)
 *  - "/nuevo"              -> Fase A: formulario de creación de propuesta
 *  - "/pacto/:uuid"        -> Fase B (si el pacto está en 'draft'/sin firmar) o
 *                             Fase C (si ya está 'active'/firmado) — Libro Mayor
 *
 * Nota: este MVP usa un router manual minimalista (sin react-router) para mantener
 * el bundle pequeño; el comentario inline indica dónde conectar Supabase real.
 */
export default function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  const [pacts, setPacts] = useState([]); // pactos del prestador actual (demo: en memoria)
  const [activePact, setActivePact] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  // ÚNICA fuente de verdad sobre qué pantalla mostrar para el pacto activo. Se asigna
  // explícitamente en cada transición (crear, cargar, sellar) — nunca se "hereda" de
  // un pacto anterior, a diferencia del viejo esquema con `phase` + `viewingSealedScreen`
  // como banderas separadas, que podían quedar desincronizadas entre pactos distintos
  // dentro de la misma sesión del navegador (bug real que causaba saltos de pantalla).
  //
  // Valores: 'invitation' | 'notary' | 'sealed' | 'ledger'
  const [pactUiStep, setPactUiStep] = useState(null);
  // Rol con el que la persona actual está viendo este pacto (lender/borrower). MVP sin
  // login: se recuerda por dispositivo vía localStorage (ver lib/viewerRole.js). null
  // significa "todavía no se sabe" -> se muestra el RoleSelector.
  const [viewerRole, setViewerRole] = useState(null);

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Al cargar /pacto/:uuid directamente (ej. el deudor abre el link), busca el pacto
  // y recupera el rol que esta persona eligió antes en este dispositivo (si alguno).
  // Se omite por completo si `uuid` ya corresponde al pacto que tenemos en memoria
  // (por ejemplo, justo después de crearlo con handleCreatePact) — de lo contrario,
  // esta carga asíncrona puede "ganarle la carrera" al estado recién asignado y
  // sobrescribir el pacto completo con una versión parcial de Supabase (que no
  // guarda campos como `schedule`/`installment_amount`, solo usados en memoria).
  useEffect(() => {
    if (route.name === 'pact' && route.uuid && route.uuid !== activePact?.id) {
      loadPactByUuid(route.uuid);
    }
  }, [route]);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setRoute(parseRoute(path));
  };

  const handleSelectRole = useCallback((pactId, role) => {
    storeViewerRole(pactId, role);
    setViewerRole(role);
  }, []);

  const loadPactByUuid = useCallback(async (uuid) => {
    // Nota: si `uuid` ya corresponde al pacto recién creado/sellado en esta misma
    // sesión, ese pacto vive solo en memoria (sin Supabase configurado) y su estado
    // de paso/rol ya fue asignado explícitamente por handleCreatePact/handlePactSealed.
    // Las ramas de abajo simplemente no aplican para ese caso (no es Supabase ni mock),
    // así que no hay nada que sobreescribir.
    const storedRole = getStoredViewerRole(uuid);

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('pacts').select('*').eq('id', uuid).single();
      if (!error && data) {
        // `installment_amount`/`schedule` son campos DERIVADOS que solo existían en
        // memoria al crear el pacto — la tabla `pacts` no los persiste (serían
        // redundantes con amount/interest_rate/installments_count/frequency, que sí
        // se guardan). Se recalculan aquí siempre, para que ReviewStep nunca muestre
        // $0 por depender de un campo que la base de datos nunca tuvo.
        const recalculated = buildAmortizationSchedule(
          data.amount,
          data.interest_rate,
          data.installments_count,
          data.frequency || 'monthly'
        );

        let installments = recalculated.schedule;
        if (data.status === 'active') {
          // Pacto ya sellado: las cuotas reales (con su status pending/reviewing/paid
          // real) viven en la tabla `installments`, no en el recálculo en memoria.
          const { data: realInstallments } = await supabase
            .from('installments')
            .select('*')
            .eq('pact_id', uuid)
            .order('installment_number', { ascending: true });
          if (realInstallments && realInstallments.length > 0) {
            installments = realInstallments;
          }
        }

        const hydratedPact = {
          ...data,
          schedule: recalculated.schedule,
          installment_amount: recalculated.installmentAmount,
          total_to_pay: recalculated.totalToPay,
          installments
        };
        setActivePact(hydratedPact);
        setViewerRole(storedRole);
        setPactUiStep(data.status === 'draft' ? 'notary' : 'ledger');
        return;
      }
    }
    // Modo demo: usa el mock si coincide o si no hay Supabase configurado.
    if (uuid === mockPact.id) {
      setActivePact(mockPact);
      setViewerRole(storedRole);
      // El tour del mock solo arranca la primera vez (sin rol guardado todavía);
      // en visitas siguientes va directo al Libro Mayor, como cualquier pacto real.
      setPactUiStep(storedRole ? 'ledger' : 'invitation');
      return;
    }
    // Pacto creado en esta misma sesión (vive solo en memoria de React, sin Supabase
    // configurado): su estado ya fue asignado por handleCreatePact/handlePactSealed,
    // no hay nada más que cargar aquí. Si alguien recarga la página en este modo demo
    // sin backend, el pacto se pierde (no hay persistencia real sin Supabase).
  }, []);

  const handleCreatePact = useCallback(async (formData) => {
    const newPact = {
      ...formData,
      id: crypto.randomUUID(),
      status: 'draft',
      created_at: new Date().toISOString(),
      outstanding_amount: formData.total_to_pay
    };

    if (isSupabaseConfigured) {
      await supabase.from('pacts').insert([{
        id: newPact.id,
        lender_name: newPact.lender_name,
        lender_email: newPact.lender_email || null,
        borrower_email: newPact.borrower_email,
        amount: newPact.amount,
        interest_rate: newPact.interest_rate,
        installments_count: newPact.installments_count,
        frequency: newPact.frequency,
        status: 'draft'
      }]);
    }

    setPacts((prev) => [...prev, newPact]);
    setActivePact(newPact);
    setPactUiStep('invitation'); // siempre arranca aquí, sin importar el estado previo de otro pacto
    storeViewerRole(newPact.id, 'lender'); // quien crea el pacto es, por definición, el prestador
    setViewerRole('lender');
    navigate(`/pacto/${newPact.id}`);
  }, []);

  const handlePactSealed = useCallback(async ({ pact, seal }) => {
    // FIX: PactCreationForm guarda el array de cuotas calculado como `schedule`,
    // pero LedgerDashboard (Fase C) lee `installments`. Sin este mapeo, el pacto
    // queda sellado con status='active' pero sin cuotas visibles — el Libro Mayor
    // muestra 0% / $0 / vacío aunque el préstamo sí tenga monto y plazo.
    const installments = (pact.installments && pact.installments.length > 0)
      ? pact.installments
      : (pact.schedule || []).map((row) => ({
          installment_number: row.installment_number,
          due_date: row.due_date,
          amount_due: row.amount_due,
          status: 'pending',
          proof_image_url: null,
          paid_at: null
        }));

    const sealedPact = { ...pact, status: 'active', contract_hash: seal.hash, installments };

    // Quien acaba de firmar (pasó por KYC) es, por definición, el deudor — se guarda
    // su rol automáticamente para que no tenga que elegir en el RoleSelector después.
    storeViewerRole(pact.id, 'borrower');
    setViewerRole('borrower');

    if (isSupabaseConfigured) {
      // RLS bloquea cambios a contract_hash/amount una vez 'active'; este UPDATE
      // es la única vez que se escribe ese valor (ver sql/schema.sql).
      await supabase.from('pacts').update({
        status: 'active',
        contract_hash: seal.hash
      }).eq('id', pact.id);

      // Inserta las cuotas calculadas en la tabla installments (solo la primera vez).
      if (installments.length > 0) {
        await supabase.from('installments').insert(
          installments.map((i) => ({
            pact_id: pact.id,
            installment_number: i.installment_number,
            due_date: i.due_date,
            amount_due: i.amount_due,
            status: 'pending'
          }))
        );
      }
    }

    setActivePact(sealedPact);
    setPacts((prev) => prev.map((p) => (p.id === pact.id ? sealedPact : p)));
    // No se cambia uiStep aquí: VirtualNotaryView sigue montado y muestra su propia
    // pantalla interna de "Trato cerrado" (con el botón de descargar PDF). El padre
    // solo avanza a 'ledger' cuando el usuario pulsa "Ir al Libro Mayor" desde ahí
    // (ver onContinueToLedger en PactRouteView).

    // Envía el PDF sellado por correo a ambas partes (no bloquea la UI si falla).
    try {
      const pdfBase64 = pagarePDFBase64(sealedPact, seal);
      fetch('/api/send-pagare-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lenderEmail: pact.lender_email,
          borrowerEmail: pact.borrower_email,
          pdfBase64,
          pactId: pact.id,
          amount: pact.amount,
          lenderName: pact.lender_name
        })
      }).catch(() => {});
    } catch (e) {
      console.error('No se pudo preparar el correo del pagaré', e);
    }
  }, []);

  const handleUploadProof = useCallback(async (installmentNumber, file) => {
    // Demo: actualiza estado local a 'reviewing'. En producción: sube `file` a
    // Supabase Storage y hace UPDATE installments SET status='reviewing', proof_image_url=...
    setActivePact((prev) => ({
      ...prev,
      installments: prev.installments.map((i) =>
        i.installment_number === installmentNumber ? { ...i, status: 'reviewing' } : i
      )
    }));
  }, []);

  const handleConfirmPayment = useCallback(async (installmentNumber) => {
    setActivePact((prev) => ({
      ...prev,
      installments: prev.installments.map((i) =>
        i.installment_number === installmentNumber
          ? { ...i, status: 'paid', paid_at: new Date().toISOString().slice(0, 10) }
          : i
      )
    }));
  }, []);

  const meta = resolveMeta(pactUiStep, activePact);
  useDocumentMeta(meta.title, meta.emoji);

  return (
    <div className="min-h-screen bg-notary-paper">
      <TopBar onLogoClick={() => navigate('/')} />

      <main>
        {route.name === 'home' && (
          <LenderDashboard
            pacts={pacts}
            onNewPact={() => navigate('/nuevo')}
            onOpenPact={(p) => navigate(`/pacto/${p.id}`)}
          />
        )}

        {route.name === 'new' && (
          <div className="max-w-md mx-auto px-5 py-8">
            <h1 className="font-serif text-2xl text-notary-ink mb-1">Nuevo Pagaré</h1>
            <p className="text-sm text-notary-ink/50 mb-6">
              Cuentas claras, amistades largas. Llena los datos del préstamo.
            </p>
            <PactCreationForm onCreatePact={handleCreatePact} />
          </div>
        )}

        {route.name === 'pact' && activePact && (
          <PactRouteView
            pact={activePact}
            uiStep={pactUiStep}
            setUiStep={setPactUiStep}
            onPactSealed={handlePactSealed}
            onUploadProof={handleUploadProof}
            onConfirmPayment={handleConfirmPayment}
            linkCopied={linkCopied}
            setLinkCopied={setLinkCopied}
            viewerRole={viewerRole}
            onSelectRole={(role) => handleSelectRole(activePact.id, role)}
          />
        )}
      </main>
    </div>
  );
}

function TopBar({ onLogoClick }) {
  return (
    <header className="border-b border-notary-line">
      <div className="max-w-md mx-auto px-5 py-4 flex items-center gap-2">
        <button onClick={onLogoClick} className="flex items-center gap-2">
          <Scale size={20} className="text-notary-ink" strokeWidth={1.75} />
          <span className="font-serif text-lg text-notary-ink">PactoFirme</span>
        </button>
        <span className="ml-auto text-[11px] text-notary-ink/40 italic font-serif hidden sm:inline">
          Cuentas claras. Amistades largas.
        </span>
      </div>
    </header>
  );
}

/**
 * Decide qué vista mostrar para un pacto dado:
 *  - ShareInvitationPanel: justo tras crear el pacto, el prestador ve el link para compartir.
 *  - VirtualNotaryView: el deudor verifica identidad y firma.
 *  - "sealed": pantalla de "Trato cerrado" (propia o la del mock), visible hasta que
 *    el usuario pulse "Ir al Libro Mayor" explícitamente.
 *  - RoleSelector: si el pacto está activo pero no sabemos el rol del visitante.
 *  - LedgerDashboard: Fase C.
 *
 * uiStep es la ÚNICA fuente de verdad de qué mostrar, asignada explícitamente por
 * App.jsx en cada transición (crear, cargar, sellar) — nunca inferida combinando
 * varias banderas, que es lo que causaba que el panel de invitación o la pantalla
 * de sellado se saltaran al crear un pacto nuevo justo después de haber visitado
 * otro pacto en la misma sesión del navegador.
 */
function PactRouteView({
  pact,
  uiStep,
  setUiStep,
  onPactSealed,
  onUploadProof,
  onConfirmPayment,
  linkCopied,
  setLinkCopied,
  viewerRole,
  onSelectRole
}) {
  if (uiStep === 'invitation') {
    return (
      <ShareInvitationPanel
        pact={pact}
        linkCopied={linkCopied}
        setLinkCopied={setLinkCopied}
        // El pacto de ejemplo (mock) ya viene con un `seal` precalculado, así que el
        // botón avanza directo a la pantalla de sellado usando esos datos. Un pacto
        // real avanza a la Notaría Virtual real (KYC + firma con canvas).
        onContinue={() => setUiStep(pact.seal ? 'sealed' : 'notary')}
      />
    );
  }

  if (uiStep === 'notary') {
    return (
      <VirtualNotaryView
        pact={pact}
        onPactSealed={onPactSealed}
        onContinueToLedger={() => setUiStep('ledger')}
      />
    );
  }

  // Este paso es exclusivo del tour del pacto de ejemplo (mockPact.json): como ya
  // trae un `seal` precalculado (sin pasar por KYC/firma real), se muestra una
  // versión simplificada de la pantalla de cierre. Un pacto real nunca llega aquí —
  // su propia pantalla de "Trato cerrado" vive dentro de VirtualNotaryView (uiStep
  // se queda en 'notary' hasta que el usuario decide continuar desde ahí).
  if (uiStep === 'sealed') {
    return (
      <MockSealedStep
        pact={pact}
        seal={pact.seal}
        onContinue={() => setUiStep('ledger')}
      />
    );
  }

  // uiStep === 'ledger' (o cualquier otro caso ya resuelto): falta decidir el rol.
  if (!viewerRole) {
    return <RoleSelector pact={pact} onSelect={onSelectRole} />;
  }

  return (
    <LedgerDashboard
      pact={pact}
      installments={pact.installments || []}
      role={viewerRole}
      onUploadProof={onUploadProof}
      onConfirmPayment={onConfirmPayment}
    />
  );
}

function ShareInvitationPanel({ pact, linkCopied, setLinkCopied, onContinue }) {
  const link = `${window.location.origin}/pacto/${pact.id}`;
  const whatsappText = encodeURIComponent(
    `${pact.lender_name} te invita a formalizar un préstamo en PactoFirme: ${link}`
  );

  const copyLink = async () => {
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div className="max-w-md mx-auto px-5 py-12 text-center space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-notary-ink">Pagaré redactado</h1>
        <p className="text-sm text-notary-ink/60 mt-2">
          Comparte este enlace con tu conocido para que verifique su identidad y firme.
        </p>
      </div>

      <div className="folio-border bg-notary-paperWarm px-4 py-3 flex items-center gap-2">
        <LinkIcon size={15} className="text-notary-ink/40 shrink-0" />
        <span className="text-xs font-mono text-notary-ink/70 truncate">{link}</span>
        <button onClick={copyLink} className="shrink-0 text-notary-gold">
          {linkCopied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </div>

      <a
        href={`https://wa.me/?text=${whatsappText}`}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full inline-flex items-center justify-center gap-2 bg-[#1ea952] text-white py-3.5 font-medium tracking-wide hover:bg-[#188a43] transition-colors"
      >
        <MessageCircle size={17} /> Enviar propuesta por WhatsApp
      </a>

      {/* Para pactos reales: permite continuar manualmente a la Notaría Virtual,
          útil cuando la misma persona está probando ambos roles (prestador y deudor)
          en el mismo dispositivo, sin tener que abrir el link en otra pestaña. */}
      {onContinue && (
        <button
          onClick={onContinue}
          className="w-full text-sm text-notary-ink/50 hover:text-notary-ink transition-colors py-2"
        >
          {pact.seal ? 'Simular que el deudor ya firmó →' : 'Continuar a la Notaría Virtual →'}
        </button>
      )}
    </div>
  );
}

function MockSealedStep({ pact, seal, onContinue }) {
  return (
    <div className="max-w-md mx-auto px-5 py-8 space-y-6 text-center">
      <div className="flex justify-center">
        <NotarySeal animate size="lg" />
      </div>

      <div>
        <h2 className="font-serif text-2xl text-notary-ink">¡Trato cerrado!</h2>
        <p className="text-sm text-notary-ink/60 mt-2">
          Este es el pacto de ejemplo, ya firmado previamente por {seal?.nombreCompleto || 'el deudor'}.
        </p>
      </div>

      <div className="folio-border bg-notary-paperWarm p-4 text-left">
        <p className="text-[10px] uppercase tracking-wide text-notary-ink/40 mb-1">Sello criptográfico</p>
        <p className="font-mono text-[11px] text-notary-ink/70 break-all">{seal?.hash}</p>
        <p className="font-mono text-[11px] text-notary-ink/50 mt-2">{seal?.timestampUTC}</p>
        <p className="font-mono text-[11px] text-notary-ink/50">IP: {seal?.ip}</p>
      </div>

      <button
        onClick={onContinue}
        className="w-full inline-flex items-center justify-center gap-2 bg-notary-ink text-notary-paperWarm py-3.5 font-medium tracking-wide hover:bg-notary-inkLight transition-colors"
      >
        Ir al Libro Mayor →
      </button>
    </div>
  );
}

function parseRoute(pathname) {
  if (pathname === '/' || pathname === '') return { name: 'home' };
  if (pathname === '/nuevo') return { name: 'new' };
  const pactMatch = pathname.match(/^\/pacto\/([a-zA-Z0-9-]+)$/);
  if (pactMatch) return { name: 'pact', uuid: pactMatch[1] };
  return { name: 'home' };
}

function resolveMeta(uiStep, pact) {
  if (uiStep === 'sealed') return PHASE_META.sealed;
  if (uiStep === 'notary') return PHASE_META.signing;
  if (uiStep === 'invitation' && pact) return PHASE_META.draft(pact.id?.slice(0, 6));
  return PHASE_META.idle;
}
