/**
 * /api/send-pagare-email.js
 * Envía el PDF del Pagaré (ya generado en el cliente con jsPDF y adjuntado como base64)
 * a ambas partes del pacto usando Resend. Se invoca justo después de sellarse el pacto.
 */

import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ sent: false, error: 'Método no permitido' });
  }

  const { lenderEmail, borrowerEmail, pdfBase64, pactId, amount, lenderName } = req.body || {};

  if (!borrowerEmail || !pdfBase64) {
    return res.status(400).json({ sent: false, error: 'Faltan datos para enviar el correo' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const recipients = [lenderEmail, borrowerEmail].filter(Boolean);

  try {
    const { error } = await resend.emails.send({
      from: 'PactoFirme <notario@pactofirme.app>',
      to: recipients,
      subject: `Pagaré sellado — Pacto #${(pactId || '').slice(0, 8)}`,
      html: `
        <div style="font-family: Georgia, serif; color: #042f2c; max-width: 480px;">
          <h2>Trato cerrado entre ${lenderName || 'el prestador'} y el deudor</h2>
          <p>Adjunto encontrarás el Pagaré sellado con su hash criptográfico de integridad.
          Guárdalo en un lugar seguro.</p>
          <p style="font-size: 12px; color: #666;">
            PactoFirme — Cuentas claras. Amistades largas.
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `pagare-${pactId || 'pactofirme'}.pdf`,
          content: pdfBase64
        }
      ]
    });

    if (error) {
      console.error('[send-pagare-email] Resend error:', error);
      return res.status(500).json({ sent: false, error: error.message });
    }

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('[send-pagare-email] Error inesperado:', err);
    return res.status(500).json({ sent: false, error: 'No se pudo enviar el correo' });
  }
}
