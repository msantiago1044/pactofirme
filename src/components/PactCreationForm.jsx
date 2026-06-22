import { useState, useMemo } from 'react';
import { Send, Calculator, MessageCircle } from 'lucide-react';
import { buildAmortizationSchedule, formatCOP } from '../lib/amortization.js';

const FREQUENCIES = [
  { value: 'monthly', label: 'Mensual' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'weekly', label: 'Semanal' }
];

export default function PactCreationForm({ onCreatePact }) {
  const [form, setForm] = useState({
    lenderName: '',
    amount: '',
    interestRate: '',
    frequency: 'monthly',
    installmentsCount: '',
    borrowerEmail: ''
  });

  const preview = useMemo(() => {
    if (!form.amount || !form.installmentsCount) return null;
    return buildAmortizationSchedule(
      Number(form.amount),
      Number(form.interestRate || 0),
      Number(form.installmentsCount),
      form.frequency
    );
  }, [form.amount, form.interestRate, form.installmentsCount, form.frequency]);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const isValid =
    form.lenderName.trim() &&
    Number(form.amount) > 0 &&
    Number(form.installmentsCount) > 0 &&
    /\S+@\S+\.\S+/.test(form.borrowerEmail);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid || !preview) return;
    onCreatePact({
      lender_name: form.lenderName,
      amount: Number(form.amount),
      interest_rate: Number(form.interestRate || 0),
      frequency: form.frequency,
      installments_count: Number(form.installmentsCount),
      borrower_email: form.borrowerEmail,
      schedule: preview.schedule,
      installment_amount: preview.installmentAmount,
      total_to_pay: preview.totalToPay
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-notary-ink mb-1.5">Tu nombre</label>
        <input
          type="text"
          value={form.lenderName}
          onChange={update('lenderName')}
          placeholder="Como aparecerá en el pagaré"
          className="w-full border-0 border-b-2 border-notary-line bg-transparent py-2 text-notary-ink placeholder:text-notary-ink/30 focus:border-notary-gold focus:outline-none transition-colors"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-notary-ink mb-1.5">Monto a prestar</label>
          <div className="relative">
            <span className="absolute left-0 top-2 text-notary-ink/40">$</span>
            <input
              type="number"
              min="0"
              value={form.amount}
              onChange={update('amount')}
              placeholder="1.000.000"
              className="w-full border-0 border-b-2 border-notary-line bg-transparent py-2 pl-5 text-notary-ink font-mono placeholder:text-notary-ink/30 focus:border-notary-gold focus:outline-none transition-colors"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-notary-ink mb-1.5">Interés mensual</label>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.interestRate}
              onChange={update('interestRate')}
              placeholder="0"
              className="w-full border-0 border-b-2 border-notary-line bg-transparent py-2 pr-6 text-notary-ink font-mono placeholder:text-notary-ink/30 focus:border-notary-gold focus:outline-none transition-colors"
            />
            <span className="absolute right-0 top-2 text-notary-ink/40">%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-notary-ink mb-1.5">Modalidad de pago</label>
          <select
            value={form.frequency}
            onChange={update('frequency')}
            className="w-full border-0 border-b-2 border-notary-line bg-transparent py-2 text-notary-ink focus:border-notary-gold focus:outline-none transition-colors"
          >
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-notary-ink mb-1.5">Número de cuotas</label>
          <input
            type="number"
            min="1"
            value={form.installmentsCount}
            onChange={update('installmentsCount')}
            placeholder="4"
            className="w-full border-0 border-b-2 border-notary-line bg-transparent py-2 text-notary-ink font-mono placeholder:text-notary-ink/30 focus:border-notary-gold focus:outline-none transition-colors"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-notary-ink mb-1.5">Correo del deudor</label>
        <input
          type="email"
          value={form.borrowerEmail}
          onChange={update('borrowerEmail')}
          placeholder="correo@ejemplo.com"
          className="w-full border-0 border-b-2 border-notary-line bg-transparent py-2 text-notary-ink placeholder:text-notary-ink/30 focus:border-notary-gold focus:outline-none transition-colors"
          required
        />
      </div>

      {preview && (
        <div className="folio-border bg-notary-paperWarm px-5 py-4 flex items-start gap-3">
          <Calculator size={18} className="text-notary-gold mt-0.5 shrink-0" />
          <div className="text-sm text-notary-ink/80 leading-relaxed">
            <p>
              Tu conocido pagará{' '}
              <strong className="font-mono text-notary-ink">{form.installmentsCount}</strong> cuotas de{' '}
              <strong className="font-mono text-notary-ink">{formatCOP(preview.installmentAmount)}</strong>.
            </p>
            <p className="text-notary-ink/50 mt-1">
              Total a recibir: {formatCOP(preview.totalToPay)} · Intereses: {formatCOP(preview.totalInterest)}
            </p>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={!isValid}
        className="w-full inline-flex items-center justify-center gap-2 bg-notary-ink text-notary-paperWarm py-3.5 font-medium tracking-wide hover:bg-notary-inkLight transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Send size={17} /> Generar Pagaré y enlace de invitación
      </button>

      <p className="text-center text-xs text-notary-ink/40 flex items-center justify-center gap-1.5">
        <MessageCircle size={13} /> Después podrás enviarlo por WhatsApp con un clic
      </p>
    </form>
  );
}
