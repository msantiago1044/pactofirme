/**
 * viewerRole.js
 * MVP sin autenticación real: como cualquiera con el link puede abrir un pacto,
 * no hay forma automática de saber si quien lo abre es el prestador o el deudor.
 * Mientras no se conecte Supabase Auth, se le pregunta una vez al usuario y se
 * recuerda su elección por pacto en este navegador (localStorage).
 *
 * Nota: esto es solo para que la demo sea usable por una sola persona probando
 * ambos roles. En producción real, el rol debe derivarse de la sesión autenticada
 * comparando auth.email() contra lender_email/borrower_email del pacto — nunca
 * confiar en una elección de UI para decidir permisos reales.
 */

const STORAGE_PREFIX = 'pactofirme:viewer_role:';

export function getStoredViewerRole(pactId) {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${pactId}`);
  } catch {
    return null; // localStorage puede no estar disponible (ej. modo privado estricto)
  }
}

export function storeViewerRole(pactId, role) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${pactId}`, role);
  } catch {
    // no-op: si falla, simplemente se volverá a preguntar la próxima vez
  }
}
