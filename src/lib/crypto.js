/**
 * crypto.js
 * Generación del Sello Criptográfico del Pagaré usando SubtleCrypto (nativo del navegador,
 * sin dependencias externas). El hash combina los datos que materializan el consentimiento:
 * Monto + Cédula + IP + Timestamp.
 *
 * IMPORTANTE (transparencia legal): este hash demuestra que un archivo/registro específico
 * no ha sido alterado desde el momento de su creación (integridad). NO constituye, por sí solo,
 * una certificación de identidad — eso lo aporta el proceso completo (KYC + firma manuscrita +
 * IP + timestamp del servidor). El Pagaré generado declara esta distinción explícitamente.
 */

export async function sha256Hex(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Construye el hash de sello del pacto.
 * @param {object} params
 * @param {number} params.amount
 * @param {string} params.cedula
 * @param {string} params.ip
 * @param {string} params.timestampUTC - ISO 8601 UTC
 * @returns {Promise<string>} hash hexadecimal de 64 caracteres
 */
export async function buildContractHash({ amount, cedula, ip, timestampUTC }) {
  const payload = `${amount}|${cedula}|${ip}|${timestampUTC}`;
  return sha256Hex(payload);
}

/**
 * Obtiene la IP pública del cliente vía un servicio externo simple.
 * Si falla (ej. red bloqueada), devuelve 'IP_NO_DISPONIBLE' en vez de romper el flujo de firma;
 * esto se refleja también en el PDF para no fabricar un dato que no se pudo verificar.
 */
export async function fetchClientIP() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip || 'IP_NO_DISPONIBLE';
  } catch {
    return 'IP_NO_DISPONIBLE';
  }
}
