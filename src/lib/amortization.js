/**
 * amortization.js
 * Cálculo de tabla de amortización simple: Cuota fija = Capital/N + Interés sobre saldo.
 * Modelo de "interés simple sobre saldo insoluto" — el más común y transparente
 * para préstamos informales entre personas, evita la opacidad del interés compuesto
 * francés que generaría disputas ("¿por qué pagué tanto y debo casi lo mismo?").
 */

/**
 * @param {number} amount - Monto principal prestado.
 * @param {number} monthlyRatePct - Tasa de interés mensual en porcentaje (ej: 2 = 2%).
 * @param {number} installmentsCount - Número total de cuotas.
 * @param {'monthly'|'biweekly'|'weekly'} frequency - Modalidad de pago.
 * @param {string|Date} startDate - Fecha de inicio (primer pacto/desembolso).
 * @returns {{ schedule: Array, totalToPay: number, totalInterest: number, installmentAmount: number }}
 */
export function buildAmortizationSchedule(
  amount,
  monthlyRatePct,
  installmentsCount,
  frequency = 'monthly',
  startDate = new Date()
) {
  const principal = Number(amount) || 0;
  const n = Math.max(1, Math.floor(Number(installmentsCount) || 1));
  const rate = Number(monthlyRatePct) || 0;

  // Periodos por mes según modalidad, para prorratear la tasa mensual indicada.
  const periodsPerMonth = frequency === 'weekly' ? 4 : frequency === 'biweekly' ? 2 : 1;
  const ratePerPeriod = rate / 100 / periodsPerMonth;

  const capitalPerInstallment = principal / n;
  let balance = principal;
  const schedule = [];
  let totalInterest = 0;

  for (let i = 1; i <= n; i++) {
    const interestForPeriod = balance * ratePerPeriod;
    const installmentAmount = capitalPerInstallment + interestForPeriod;
    balance -= capitalPerInstallment;
    totalInterest += interestForPeriod;

    schedule.push({
      installment_number: i,
      due_date: addPeriod(startDate, i, frequency),
      capital: round2(capitalPerInstallment),
      interest: round2(interestForPeriod),
      amount_due: round2(installmentAmount),
      remaining_balance: round2(Math.max(balance, 0)),
      status: 'pending'
    });
  }

  const totalToPay = schedule.reduce((sum, row) => sum + row.amount_due, 0);

  return {
    schedule,
    totalToPay: round2(totalToPay),
    totalInterest: round2(totalInterest),
    installmentAmount: round2(schedule[0]?.amount_due ?? 0)
  };
}

function addPeriod(startDate, periodIndex, frequency) {
  const date = new Date(startDate);
  if (frequency === 'weekly') {
    date.setDate(date.getDate() + periodIndex * 7);
  } else if (frequency === 'biweekly') {
    date.setDate(date.getDate() + periodIndex * 15);
  } else {
    date.setMonth(date.getMonth() + periodIndex);
  }
  return date.toISOString().slice(0, 10);
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(value || 0);
}
