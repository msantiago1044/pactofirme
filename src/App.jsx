import { useState, useEffect, useCallback } from 'react';
import { Scale, Link as LinkIcon, MessageCircle, Copy, Check } from 'lucide-react';
import PactCreationForm from './components/PactCreationForm.jsx';
import VirtualNotaryView from './components/VirtualNotaryView.jsx';
import LedgerDashboard from './components/LedgerDashboard.jsx';
import LenderDashboard from './components/LenderDashboard.jsx';
import { useDocumentMeta, PHASE_META } from './lib/useDocumentMeta.js';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient.js';
import { pagarePDFBase64 } from './lib/generatePagarePDF.js';
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

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Al cargar /pacto/:uuid directamente (ej. el deudor abre el link), busca el pacto.
  useEffect(() => {
    if (route.name === 'pact' && route.uuid) {
      loadPactByUuid(route.uuid);
    }
  }, [route]);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setRoute(parseRoute(path));
  };

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
    navigate(`/pacto/${newPact.id}`);
  }, []);

  const handlePactSealed = useCallback(async ({ pact, seal }) => {
    const sealedPact = { ...pact, status: 'active', contract_hash: seal.hash };

    if (isSupabaseConfigured) {
      // RLS bloquea cambios a contract_hash/amount una vez 'active'; este UPDATE
      // es la única vez que se escribe ese valor (ver sql/schema.sql).
      await supabase.from('pacts').update({
        status: 'active',
        contract_hash: seal.hash
      }).eq('id', pact.id);
    }

    setActivePact(sealedPact);
    setPacts((prev) => prev.map((p) => (p.id === pact.id ? sealedPact : p)));
    setPhase('sealed');

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
 * Decide si mostrar la Notaría Virtual (Fase B, pacto aún sin firmar) o el
 * Libro Mayor (Fase C, pacto ya activo). Justo después de sellarse, muestra el
 * panel de "compartir enlace" antes de pasar al libro mayor.
 */
function PactRouteView({ pact, phase, onPactSealed, onUploadProof, onConfirmPayment, linkCopied, setLinkCopied }) {
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

  if (pact.status === 'draft') {
    return <VirtualNotaryView pact={pact} onPactSealed={onPactSealed} />;
  }

  return (
    <LedgerDashboard
      pact={pact}
      installments={pact.installments || []}
      role={pact.viewer_role || 'lender'}
      onUploadProof={onUploadProof}
      onConfirmPayment={onConfirmPayment}
    />
  );
}

function ShareInvitationPanel({ pact, linkCopied, setLinkCopied }) {
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
