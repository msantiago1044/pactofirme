import { formatCOP } from '../lib/amortization.js';

export default function DebtProgressBar({ totalAmount, paidAmount }) {
  const pct = totalAmount > 0 ? Math.min(100, Math.round((paidAmount / totalAmount) * 100)) : 0;

  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-xs uppercase tracking-wide text-notary-ink/60 font-medium">
          Progreso del pacto
        </span>
        <span className="font-mono text-sm text-notary-gold font-medium">{pct}%</span>
      </div>
      <div className="h-2.5 w-full bg-notary-line/40 overflow-hidden">
        <div
          className="h-full bg-notary-ink transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <div className="flex justify-between mt-2 text-sm">
        <span className="text-notary-ink/70">
          Abonado: <strong className="text-notary-ink font-mono">{formatCOP(paidAmount)}</strong>
        </span>
        <span className="text-notary-ink/70">
          Total: <strong className="text-notary-ink font-mono">{formatCOP(totalAmount)}</strong>
        </span>
      </div>
    </div>
  );
}
