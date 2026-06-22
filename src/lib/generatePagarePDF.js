import { jsPDF } from 'jspdf';
import { formatCOP } from './amortization.js';

/**
 * generatePagareePDF.js
 * Compila el "Pagaré a la Orden" en PDF del lado del cliente.
 *
 * Nota de transparencia (no es asesoría legal): el texto se basa en la figura del pagaré
 * a la orden del Código de Comercio colombiano (arts. 709 y ss.) y en el reconocimiento de
 * firma como prueba de aceptación. PactoFirme no certifica validez legal; recomienda revisión
 * por un abogado para montos significativos. El documento declara explícitamente el alcance
 * real del hash SHA-256: prueba de integridad del archivo, no sustituto de peritaje legal.
 */
export function generatePagarePDF(pact, sealData) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 56;
  let y = 64;

  const inkDark = '#042f2c';
  const gold = '#a8762f';
  const gray = '#444444';

  // ---------- ENCABEZADO ----------
  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(inkDark);
  doc.text('PAGARÉ A LA ORDEN', pageWidth / 2, y, { align: 'center' });

  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(gray);
  doc.text(`Pagaré No. ${pact.id || pact.uuid || 'PF-000000'}`, pageWidth / 2, y, { align: 'center' });
  doc.text(
    `Documento generado mediante PactoFirme — Notario Digital de Préstamos`,
    pageWidth / 2,
    y + 12,
    { align: 'center' }
  );

  y += 36;
  doc.setDrawColor(inkDark);
  doc.setLineWidth(0.75);
  doc.line(margin, y, pageWidth - margin, y);
  y += 26;

  // ---------- CUERPO LEGAL ----------
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  doc.setTextColor('#111111');

  const lugarFecha = `Barranquilla, Colombia, a los ${formatLongDate(sealData.timestampUTC)}.`;
  doc.text(lugarFecha, margin, y, { maxWidth: pageWidth - margin * 2 });
  y += 26;

  const cuerpoParrafo1 =
    `Yo, EL DEUDOR, identificado como aparece al pie de este documento, debo y pagaré ` +
    `incondicionalmente a la orden de EL ACREEDOR (${pact.lender_name || '___________________'}), ` +
    `la suma de ${formatCOP(pact.amount)} (${pact.amount ? numberToWords(pact.amount) : ''}), ` +
    `más los intereses pactados del ${pact.interest_rate || 0}% mensual, mediante ${pact.installments_count || 0} ` +
    `cuota(s) de pago en modalidad ${translateFrequency(pact.frequency)}, conforme a la tabla de amortización ` +
    `adjunta a este pagaré, la cual hace parte integral del presente título valor.`;

  y = writeWrappedParagraph(doc, cuerpoParrafo1, margin, y, pageWidth - margin * 2, 16);
  y += 10;

  const cuerpoParrafo2 =
    `En caso de mora en el pago de cualquiera de las cuotas pactadas, EL ACREEDOR podrá declarar ` +
    `vencido el plazo y exigir el pago total del saldo insoluto, sin necesidad de requerimientos ` +
    `judiciales o extrajudiciales, los cuales expresamente renuncio. Este pagaré se rige por las ` +
    `disposiciones aplicables a los títulos valores del Código de Comercio de la República de Colombia.`;

  y = writeWrappedParagraph(doc, cuerpoParrafo2, margin, y, pageWidth - margin * 2, 16);
  y += 18;

  // ---------- DATOS DEL DEUDOR (KYC) ----------
  doc.setDrawColor('#d8d2c4');
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(inkDark);
  doc.text('DATOS DEL DEUDOR (verificados mediante eKYC)', margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor('#222222');
  doc.text(`Nombre completo: ${sealData.nombreCompleto || 'No verificado'}`, margin, y);
  y += 14;
  doc.text(`Número de cédula: ${sealData.cedula || 'No verificado'}`, margin, y);
  y += 14;
  doc.text(`Correo: ${pact.borrower_email || '—'}`, margin, y);
  y += 24;

  // ---------- FIRMA ----------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(inkDark);
  doc.text('FIRMA DEL DEUDOR', margin, y);
  y += 8;

  if (sealData.signatureDataUrl) {
    try {
      doc.addImage(sealData.signatureDataUrl, 'PNG', margin, y, 180, 70);
    } catch (e) {
      doc.text('[Firma no disponible para renderizar]', margin, y + 30);
    }
  }
  y += 86;
  doc.setDrawColor('#999999');
  doc.line(margin, y, margin + 220, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor('#666666');
  doc.text('Firma digital capturada en pantalla', margin, y + 12);

  y += 36;

  // ---------- SELLO CRIPTOGRÁFICO ----------
  doc.setDrawColor(gold);
  doc.setLineWidth(1);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 110, 2, 2);

  let sy = y + 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(gold);
  doc.text('SELLO CRIPTOGRÁFICO DE INTEGRIDAD', margin + 12, sy);
  sy += 16;

  doc.setFont('courier', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor('#222222');
  doc.text(`Hash SHA-256: ${sealData.hash || ''}`, margin + 12, sy, { maxWidth: pageWidth - margin * 2 - 24 });
  sy += 14;
  doc.text(`Timestamp (UTC): ${sealData.timestampUTC || ''}`, margin + 12, sy);
  sy += 14;
  doc.text(`Dirección IP del firmante: ${sealData.ip || 'IP_NO_DISPONIBLE'}`, margin + 12, sy);
  sy += 18;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor('#555555');
  const disclaimer =
    'Este hash certifica que el contenido de este documento (monto, identidad declarada, IP y momento ' +
    'de la firma) no ha sido alterado desde la fecha y hora aquí registradas. No constituye, por sí solo, ' +
    'una certificación notarial de identidad ni reemplaza el peritaje legal en caso de disputa judicial.';
  writeWrappedParagraph(doc, disclaimer, margin + 12, sy, pageWidth - margin * 2 - 24, 10);

  // ---------- PIE DE PÁGINA ----------
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor('#999999');
  doc.text(
    'PactoFirme no es una entidad financiera ni un despacho legal. Este documento es una plantilla técnica ' +
    'generada por la voluntad de las partes; se recomienda asesoría jurídica para montos significativos.',
    pageWidth / 2,
    780,
    { align: 'center', maxWidth: pageWidth - margin * 2 }
  );

  return doc;
}

export function downloadPagarePDF(pact, sealData, filename = 'pagare.pdf') {
  const doc = generatePagarePDF(pact, sealData);
  doc.save(filename);
}

export function pagarePDFBlob(pact, sealData) {
  const doc = generatePagarePDF(pact, sealData);
  return doc.output('blob');
}

export function pagarePDFBase64(pact, sealData) {
  const doc = generatePagarePDF(pact, sealData);
  return doc.output('datauristring').split(',')[1];
}

// ---------- HELPERS DE TEXTO ----------

function writeWrappedParagraph(doc, text, x, y, maxWidth, lineHeight) {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function translateFrequency(freq) {
  const map = { monthly: 'mensual', biweekly: 'quincenal', weekly: 'semanal' };
  return map[freq] || 'mensual';
}

function formatLongDate(isoUTC) {
  if (!isoUTC) return new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  const d = new Date(isoUTC);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Conversión simple de número a texto en español para montos en COP.
 * Cobertura suficiente para préstamos personales (hasta cientos de millones).
 */
function numberToWords(num) {
  const n = Math.round(Number(num) || 0);
  if (n === 0) return 'cero pesos';
  return `${n.toLocaleString('es-CO')} pesos colombianos`;
}
