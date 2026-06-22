/**
 * /api/cleanup-kyc-image.js
 * Borra la imagen temporal de cédula del bucket `kyc-temp` inmediatamente después
 * de que el deudor confirma su firma. Esta es la vía "feliz" de borrado; el job
 * programado en sql/cleanup_job.sql cubre el caso en que el deudor abandona el flujo.
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ deleted: false, error: 'Método no permitido' });
  }

  const { path } = req.body || {};
  if (!path || typeof path !== 'string') {
    return res.status(400).json({ deleted: false, error: 'Falta el path de la imagen' });
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error } = await supabaseAdmin.storage.from('kyc-temp').remove([path]);

  if (error) {
    console.error('[cleanup-kyc-image] Error al borrar:', error.message);
    return res.status(500).json({ deleted: false, error: error.message });
  }

  return res.status(200).json({ deleted: true });
}
