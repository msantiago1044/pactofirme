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
  const [phase, setPhase] = useState('idle'); // idle | draft | signing | sealed
  const [linkCopied, setLinkCopied] = useState(false);
  // Controla si el usuario sigue viendo la pantalla de "¡Trato cerrado!" (con el sello
  // y el botón de descarga) en vez de saltar automáticamente al Libro Mayor. El usuario
  // navega al Libro Mayor explícitamente con el botón "Ir al Libro Mayor →".
  const [viewingSealedScreen, setViewingSealedScreen] = useState(false);
  // Rol con el que la persona actual está viendo este pacto (lender/borrower). MVP sin
  // login: se recuerda por dispositivo vía localStorage (ver lib/viewerRole.js). null
  // significa "todavía no se sabe" -> se muestra el RoleSelector.
  const [viewerRole, setViewerRole] = useState(null);
  // Tour de demostración exclusivo para mockPact.json: como ese pacto ya nace "sellado"
  // (trae seal/hash precalculados), no tiene sentido hacer pasar por KYC o firma real.
  // En su lugar, se recorren las mismas pantallas (invitación -> sellado -> Libro Mayor)
  // usando los datos ya existentes del JSON. null = no es un tour; 'invitation' | 'sealed'
  // | null (listo para Libro Mayor) son los pasos.
  const [mockTourStep, setMockTourStep] = useState(null);

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Al cargar /pacto/:uuid directamente (ej. el deudor abre el link), busca el pacto
  // y recupera el rol que esta persona eligió antes en este dispositivo (si alguno).
  useEffect(() => {
    if (route.name === 'pact' && route.uuid) {
      loadPactByUuid(route.uuid);
      const storedRole = getStoredViewerRole(route.uuid);
      setViewerRole(storedRole);
      // El tour del mock solo arranca la primera vez (sin rol guardado todavía);
      // en visitas siguientes va directo al Libro Mayor, como cualquier pacto real.
      setMockTourStep(route.uuid === mockPact.id && !storedRole ? 'invitation' : null);
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
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('pacts').select('*').eq('id', uuid).single();
      if (!error && data) {
        setActivePact(data);
        setPhase(data.status === 'draft' ? 'signing' : 'sealed');
        return;
      }
    }
    // Modo demo: usa el mock si coincide o si no hay Supabase configurado.
    if (uuid === mockPact.id || !isSupabaseConfigured) {
      setActivePact(mockPact);
      setPhase('sealed');
    }
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
        status: 'draft'
      }]);
    }

    setPacts((prev) => [...prev, newPact]);
    setActivePact(newPact);
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
    setPhase('sealed');
    setViewingSealedScreen(true); // mantiene visible la pantalla de "Trato cerrado"

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

  const meta = resolveMeta(phase, activePact);
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
            phase={phase}
            onPactSealed={handlePactSealed}
            onUploadProof={handleUploadProof}
            onConfirmPayment={handleConfirmPayment}
            linkCopied={linkCopied}
            setLinkCopied={setLinkCopied}
            viewingSealedScreen={viewingSealedScreen}
            onContinueToLedger={() => setViewingSealedScreen(false)}
            viewerRole={viewerRole}
            onSelectRole={(role) => handleSelectRole(activePact.id, role)}
            mockTourStep={mockTourStep}
            setMockTourStep={setMockTourStep}
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
 *  - VirtualNotaryView: el deudor verifica identidad y firma (incluye su propia pantalla
 *    final de "Trato cerrado" con el sello, que permanece visible hasta que el usuario
 *    pulse "Ir al Libro Mayor" — viewingSealedScreen controla esto explícitamente para
 *    que el cambio de pact.status a 'active' no la oculte de golpe).
 *  - LedgerDashboard: Fase C, una vez el usuario decide continuar.
 */
function PactRouteView({
  pact,
  phase,
  onPactSealed,
  onUploadProof,
  onConfirmPayment,
  linkCopied,
  setLinkCopied,
  viewingSealedScreen,
  onContinueToLedger,
  viewerRole,
  onSelectRole,
  mockTourStep,
  setMockTourStep
}) {
  // Tour de demostración del pacto de ejemplo (mockPact.json): recorre las mismas
  // pantallas que un pacto real (invitación -> sellado) usando los datos de seal ya
  // precalculados en el JSON, sin pedir foto de cédula ni firma real.
  if (mockTourStep === 'invitation') {
    return (
      <ShareInvitationPanel
        pact={pact}
        linkCopied={linkCopied}
        setLinkCopied={setLinkCopied}
        onContinue={() => setMockTourStep('sealed')}
      />
    );
  }

  if (mockTourStep === 'sealed') {
    return (
      <MockSealedStep
        pact={pact}
        seal={pact.seal}
        onContinue={() => setMockTourStep(null)}
      />
    );
  }

  const isDraftUnsigned = pact.status === 'draft';

  if (isDraftUnsigned && phase !== 'sealed') {
    // El prestador, justo tras crear el pacto, ve el panel de invitación.
    // El deudor (que llega directo al link) ve la Notaría Virtual.
    const cameFromCreation = phase === 'idle' || phase === 'draft';
    if (cameFromCreation) {
      return (
        <ShareInvitationPanel
          pact={pact}
          linkCopied={linkCopied}
          setLinkCopied={setLinkCopied}
        />
      );
    }
  }

  if (isDraftUnsigned || viewingSealedScreen) {
    return (
      <VirtualNotaryView
        pact={pact}
        onPactSealed={onPactSealed}
        onContinueToLedger={onContinueToLedger}
      />
    );
  }

  // Pacto activo pero todavía no sabemos si quien lo abre es prestador o deudor
  // (MVP sin login real — ver lib/viewerRole.js). Se pregunta una sola vez por
  // dispositivo y se recuerda para las próximas visitas a este mismo pacto.
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

      {/* Solo visible en el tour de demostración del mockPact: simula que el deudor ya
          recibió el link y avanza a la pantalla de sellado sin pedir foto/firma reales. */}
      {onContinue && (
        <button
          onClick={onContinue}
          className="w-full text-sm text-notary-ink/50 hover:text-notary-ink transition-colors py-2"
        >
          Simular que el deudor ya firmó →
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

function resolveMeta(phase, pact) {
  if (phase === 'sealed') return PHASE_META.sealed;
  if (phase === 'signing') return PHASE_META.signing;
  if (phase === 'draft' && pact) return PHASE_META.draft(pact.id?.slice(0, 6));
  return PHASE_META.idle;
}
