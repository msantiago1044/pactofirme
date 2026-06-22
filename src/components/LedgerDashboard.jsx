import { useState, useRef } from 'react';
import { Upload, Clock, CheckCircle2, AlertCircle, Receipt, ImagePlus } from 'lucide-react';
import { formatCOP } from '../lib/amortization.js';
import DebtProgressBar from './DebtProgressBar.jsx';
import EmptyState from './EmptyState.jsx';

const STATUS_CONFIG = {
  pending: { label: 'Pendiente', icon: Clock, color: 'text-notary-ink/40' },
  reviewing: { label: 'En revisión', icon: AlertCircle, color: 'text-notary-gold' },
  paid: { label: 'Pagada', icon: CheckCircle2, color: 'text-notary-ink' }
};

/**
 * LedgerDashboard — Fase C: Libro Mayor de auditoría de abonos.
 * role: 'lender' | 'borrower' cambia las acciones disponibles por cuota.
 */
export default function LedgerDashboard({ pact, installments, role, onUploadProof, onConfirmPayment }) {
  const totalAmount = installments.reduce((s, i) => s + i.amount_due, 0);
  const paidAmount = installments.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount_due, 0);

  const hasAnyActivity = installments.some((i) => i.status !== 'pending');

  return (
    <div className="max-w-md mx-auto px-5 py-8 space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-notary-gold font-medium mb-1">Libro Mayor</p>
        <h1 className="font-serif text-2xl text-notary-ink">
          {role === 'lender' ? `Préstamo a ${pact.borrower_email}` : `Tu deuda con ${pact.lender_name}`}
        </h1>
      </header>

      <DebtProgressBar totalAmount={totalAmount} paidAmount={paidAmount} />

      <section>
        <h2 className="text-sm font-medium text-notary-ink/70 mb-3">Historial de Abonos</h2>

        {!hasAnyActivity ? (
          <EmptyState
            icon={Receipt}
            title={
              role === 'lender'
                ? 'El deudor aún no ha registrado el primer recibo de pago.'
                : 'Aún no has registrado ningún abono. Sube tu primer comprobante cuando pagues una cuota.'
            }
          />
        ) : (
          <ul className="thin-scroll space-y-px folio-border divide-y divide-notary-line">
            {installments.map((inst) => (
              <InstallmentRow
                key={inst.installment_number}
                installment={inst}
                role={role}
                onUploadProof={onUploadProof}
                onConfirmPayment={onConfirmPayment}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function InstallmentRow({ installment, role, onUploadProof, onConfirmPayment }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const config = STATUS_CONFIG[installment.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onUploadProof(installment.installment_number, file);
    } finally {
      setUploading(false);
    }
  };

  return (
    <li className="flex items-center gap-3 px-4 py-3.5 bg-notary-paperWarm">
      <div className={`shrink-0 ${config.color}`}>
        <StatusIcon size={18} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-notary-ink">
          Cuota #{installment.installment_number}
        </p>
        <p className="text-xs text-notary-ink/50">
          {formatCOP(installment.amount_due)} · vence {installment.due_date}
        </p>
      </div>

      <div className="shrink-0">
        {role === 'borrower' && installment.status === 'pending' && (
          <>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-notary-ink border border-notary-line px-3 py-1.5 hover:border-notary-gold hover:text-notary-gold transition-colors disabled:opacity-50"
            >
              <ImagePlus size={13} />
              {uploading ? 'Subiendo...' : `Abonar Cuota #${installment.installment_number}`}
            </button>
          </>
        )}

        {role === 'lender' && installment.status === 'reviewing' && (
          <button
            onClick={() => onConfirmPayment(installment.installment_number)}
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-notary-ink text-notary-paperWarm px-3 py-1.5 hover:bg-notary-inkLight transition-colors"
          >
            <CheckCircle2 size={13} /> Confirmar ingreso
          </button>
        )}

        {installment.status === 'paid' && (
          <span className="text-xs text-notary-ink/40 font-mono">✓ {installment.paid_at}</span>
        )}

        {installment.status === 'reviewing' && role === 'borrower' && (
          <span className="text-xs text-notary-gold">Esperando confirmación</span>
        )}
      </div>
    </li>
  );
}
