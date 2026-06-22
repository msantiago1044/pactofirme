import { Plus, Wallet } from 'lucide-react';
import { formatCOP } from '../lib/amortization.js';
import EmptyState from './EmptyState.jsx';

export default function LenderDashboard({ pacts, onNewPact, onOpenPact }) {
  const totalOutstanding = pacts.reduce((sum, p) => sum + (p.outstanding_amount || 0), 0);

  return (
    <div className="max-w-md mx-auto px-5 py-8 space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-notary-gold font-medium mb-1">
            Dashboard del Prestador
          </p>
          <h1 className="font-serif text-2xl text-notary-ink">Tu dinero en la calle</h1>
        </div>
        <button
          onClick={onNewPact}
          className="shrink-0 inline-flex items-center gap-1.5 bg-notary-ink text-notary-paperWarm px-4 py-2.5 text-sm font-medium hover:bg-notary-inkLight transition-colors"
        >
          <Plus size={15} /> Nuevo Pagaré
        </button>
      </header>

      {pacts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No tienes dinero en la calle. Crea un nuevo Pagaré para formalizar un préstamo."
          action={
            <button
              onClick={onNewPact}
              className="inline-flex items-center gap-2 text-sm font-medium text-notary-gold hover:text-notary-ink transition-colors"
            >
              <Plus size={15} /> Formalizar mi primer préstamo
            </button>
          }
        />
      ) : (
        <>
          <div className="folio-border bg-notary-paperWarm p-5">
            <p className="text-xs uppercase tracking-wide text-notary-ink/40 mb-1">Total prestado activo</p>
            <p className="font-mono text-3xl text-notary-ink">{formatCOP(totalOutstanding)}</p>
          </div>

          <ul className="space-y-px folio-border divide-y divide-notary-line">
            {pacts.map((pact) => (
              <li key={pact.id}>
                <button
                  onClick={() => onOpenPact(pact)}
                  className="w-full text-left px-4 py-4 bg-notary-paperWarm hover:bg-notary-line/10 transition-colors flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-medium text-notary-ink">{pact.borrower_email}</p>
                    <p className="text-xs text-notary-ink/50 mt-0.5">
                      {pact.installments_count} cuotas · {translateStatus(pact.status)}
                    </p>
                  </div>
                  <span className="font-mono text-sm text-notary-ink shrink-0">
                    {formatCOP(pact.amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function translateStatus(status) {
  const map = {
    draft: 'Borrador',
    active: 'Activo',
    completed: 'Completado',
    defaulted: 'En mora'
  };
  return map[status] || status;
}
