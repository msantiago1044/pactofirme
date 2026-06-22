import { useState, useRef } from 'react';
import { Upload, ShieldAlert, Loader2, CheckCircle2, FileWarning } from 'lucide-react';
import SignatureCanvas from './SignatureCanvas.jsx';
import NotarySeal from './NotarySeal.jsx';
import { formatCOP } from '../lib/amortization.js';
import { buildContractHash, fetchClientIP } from '../lib/crypto.js';
import { fileToCompressedBase64 } from '../lib/imageCompression.js';
import { downloadPagarePDF, pagarePDFBase64 } from '../lib/generatePagarePDF.js';

/**
 * VirtualNotaryView — Fase B del flujo.
 * 1) El deudor ve el resumen del pacto.
 * 2) Sube foto de cédula -> /api/verify-kyc procesa con GLM-4V.
 * 3) Si es válida, dibuja su firma -> se genera el sello SHA-256 -> se compila el PDF.
 *
 * Nota de privacidad: la imagen de cédula se sube a almacenamiento temporal y se borra
 * inmediatamente después de confirmarse el sello (ver onPactSealed -> cleanupKycImage).
 */
export default function VirtualNotaryView({ pact, onPactSealed }) {
  const [step, setStep] = useState('review'); // review -> kyc -> sign -> sealed
  const [kycStatus, setKycStatus] = useState('idle'); // idle | loading | error
  const [kycError, setKycError] = useState('');
  const [kycResult, setKycResult] = useState(null); // { documento_numero, nombre_completo }
  const [kycImagePath, setKycImagePath] = useState(null); // ruta en storage temporal, para limpieza
  const fileInputRef = useRef(null);

  const [sealResult, setSealResult] = useState(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setKycStatus('loading');
    setKycError('');

    try {
      const base64 = await fileToCompressedBase64(file);

      const res = await fetch('/api/verify-kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, pactId: pact.id })
      });

      if (res.status === 413) {
        setKycStatus('error');
        setKycError('La imagen sigue siendo muy pesada incluso comprimida. Intenta con otra foto o reduce la resolución de tu cámara.');
        return;
      }

      if (!res.ok) throw new Error('Error de red al verificar el documento');
      const data = await res.json();

      if (!data.es_documento_valido) {
        setKycStatus('error');
        setKycError(data.error || 'El documento no pudo ser validado. Intenta con una foto más clara.');
        return;
      }

      setKycResult({
        documento_numero: data.documento_numero,
        nombre_completo: data.nombre_completo
      });
      setKycImagePath(data.tempImagePath || null);
      setKycStatus('idle');
      setStep('sign');
    } catch (err) {
      setKycStatus('error');
      setKycError('No pudimos procesar la imagen. Verifica tu conexión e intenta de nuevo.');
    }
  };

  const handleSignatureConfirm = async (signatureDataUrl) => {
    const timestampUTC = new Date().toISOString();
    const ip = await fetchClientIP();
    const hash = await buildContractHash({
      amount: pact.amount,
      cedula: kycResult.documento_numero,
      ip,
      timestampUTC
    });

    const seal = {
      signatureDataUrl,
      ip,
      timestampUTC,
      hash,
      cedula: kycResult.documento_numero,
      nombreCompleto: kycResult.nombre_completo
    };

    setSealResult(seal);
    setStep('sealed');

    // Limpieza de la imagen de cédula tras confirmar el sello (retención mínima).
    if (kycImagePath) {
      fetch('/api/cleanup-kyc-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: kycImagePath })
      }).catch(() => {});
    }

    onPactSealed?.({ pact, seal });
  };

  const handleDownloadPDF = () => {
    downloadPagarePDF(pact, sealResult, `pagare-${pact.id || 'pactofirme'}.pdf`);
  };

  return (
    <div className="max-w-md mx-auto px-5 py-8">
      {step === 'review' && (
        <ReviewStep pact={pact} onContinue={() => setStep('kyc')} />
      )}

      {step === 'kyc' && (
        <KycStep
          status={kycStatus}
          error={kycError}
          onFileSelect={handleFileSelect}
          fileInputRef={fileInputRef}
        />
      )}

      {step === 'sign' && (
        <SignStep pact={pact} onConfirm={handleSignatureConfirm} />
      )}

      {step === 'sealed' && sealResult && (
        <SealedStep pact={pact} seal={sealResult} onDownload={handleDownloadPDF} />
      )}
    </div>
  );
}

function ReviewStep({ pact, onContinue }) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-notary-gold font-medium mb-2">Propuesta de Préstamo</p>
        <h1 className="font-serif text-2xl text-notary-ink leading-snug">
          {pact.lender_name} te ofrece {formatCOP(pact.amount)}
        </h1>
      </div>

      <div className="folio-border paper-texture p-5">
        <p className="text-notary-ink/80 leading-relaxed">
          Devolverás <strong className="font-mono">{pact.installments_count}</strong> cuota(s) de{' '}
          <strong className="font-mono text-notary-ink">{formatCOP(pact.installment_amount)}</strong>, en
          modalidad {translateFreq(pact.frequency)}.
        </p>
        {pact.interest_rate > 0 && (
          <p className="text-sm text-notary-ink/50 mt-2">
            Tasa de interés: {pact.interest_rate}% mensual.
          </p>
        )}
      </div>

      <div className="bg-notary-ink/5 border border-notary-ink/10 px-4 py-3 text-sm text-notary-ink/70 leading-relaxed">
        Al continuar, deberás verificar tu identidad con tu cédula y firmar en pantalla. Esto generará un
        Pagaré legal con sello criptográfico de fecha, IP y huella digital del documento.
      </div>

      <button
        onClick={onContinue}
        className="w-full bg-notary-ink text-notary-paperWarm py-3.5 font-medium tracking-wide hover:bg-notary-inkLight transition-colors"
      >
        Continuar a verificación de identidad
      </button>
    </div>
  );
}

function KycStep({ status, error, onFileSelect, fileInputRef }) {
  return (
    <div className="space-y-6 text-center">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-notary-gold font-medium mb-2">Validación eKYC</p>
        <h2 className="font-serif text-xl text-notary-ink">Verifica tu identidad</h2>
        <p className="text-sm text-notary-ink/60 mt-2">
          Sube una foto del frente de tu cédula. Solo se usa para confirmar tu identidad y se elimina
          automáticamente al firmar.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileSelect}
        className="hidden"
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={status === 'loading'}
        className="w-full folio-border border-dashed py-10 flex flex-col items-center gap-3 hover:border-notary-gold transition-colors disabled:opacity-60"
      >
        {status === 'loading' ? (
          <>
            <Loader2 size={28} className="text-notary-gold animate-spin" />
            <span className="text-sm text-notary-ink/60">Analizando documento...</span>
          </>
        ) : (
          <>
            <Upload size={28} className="text-notary-ink/40" />
            <span className="text-sm text-notary-ink/60">Subir foto de mi cédula (frente)</span>
          </>
        )}
      </button>

      {status === 'error' && error && (
        <div className="flex items-start gap-2 text-left bg-notary-alert/5 border border-notary-alert/20 px-4 py-3 text-sm text-notary-alert">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

function SignStep({ pact, onConfirm }) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async (dataUrl) => {
    setConfirming(true);
    await onConfirm(dataUrl);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-notary-gold font-medium mb-2">
          Identidad verificada
        </p>
        <h2 className="font-serif text-xl text-notary-ink">Firma para sellar el pacto</h2>
        <p className="text-sm text-notary-ink/60 mt-2">
          Por {formatCOP(pact.amount)} a favor de {pact.lender_name}.
        </p>
      </div>

      <SignatureCanvas onConfirm={handleConfirm} disabled={confirming} />

      <p className="text-xs text-notary-ink/40 text-center leading-relaxed">
        Al firmar, se registrará tu IP y la hora exacta (UTC) junto con un hash criptográfico
        irreversible que protege la integridad de este documento.
      </p>
    </div>
  );
}

function SealedStep({ pact, seal, onDownload }) {
  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <NotarySeal animate size="lg" />
      </div>

      <div>
        <h2 className="font-serif text-2xl text-notary-ink">¡Trato cerrado!</h2>
        <p className="text-sm text-notary-ink/60 mt-2">
          El contrato es ahora inmutable. Se envió una copia por correo a ambas partes.
        </p>
      </div>

      <div className="folio-border bg-notary-paperWarm p-4 text-left">
        <p className="text-[10px] uppercase tracking-wide text-notary-ink/40 mb-1">Sello criptográfico</p>
        <p className="font-mono text-[11px] text-notary-ink/70 break-all">{seal.hash}</p>
        <p className="font-mono text-[11px] text-notary-ink/50 mt-2">{seal.timestampUTC}</p>
        <p className="font-mono text-[11px] text-notary-ink/50">IP: {seal.ip}</p>
      </div>

      <button
        onClick={onDownload}
        className="w-full flex items-center justify-center gap-2 bg-notary-ink text-notary-paperWarm py-3.5 font-medium tracking-wide hover:bg-notary-inkLight transition-colors"
      >
        <CheckCircle2 size={17} /> Descargar Pagaré en PDF
      </button>
    </div>
  );
}

function translateFreq(freq) {
  const map = { monthly: 'mensual', biweekly: 'quincenal', weekly: 'semanal' };
  return map[freq] || 'mensual';
}


