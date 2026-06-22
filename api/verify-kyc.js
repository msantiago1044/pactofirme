/**
 * /api/verify-kyc.js
 * Serverless function (Vercel) que recibe una foto de cédula en Base64, la sube a
 * almacenamiento TEMPORAL en Supabase Storage, y la envía a GLM-4.6V-Flash (ZhipuAI)
 * para extraer número de documento y nombre completo.
 *
 * NOTA SOBRE EL MODELO: se usa `glm-4.6v-flash` (variante gratuita de 9B) en vez de
 * `glm-4.6v` (106B, de pago). La documentación oficial de Zhipu lista justo el OCR de
 * documentos de identidad como caso de uso recomendado para esta variante, y soporta
 * fotos con mala iluminación/ángulo torcido — el escenario típico de un usuario
 * fotografiando su cédula con el celular. Si en producción se necesita mayor precisión
 * (ej. cédulas muy deterioradas o letra manuscrita compleja), considerar cambiar a
 * `glm-4.6v` y recargar saldo en el panel de Zhipu — el cambio es solo este string.
 *
 * RETENCIÓN DE DATOS: la imagen se guarda únicamente para permitir su revisión humana
 * en caso de disputa antes de la firma. Se borra automáticamente:
 *   (a) inmediatamente después de que el deudor confirma su firma (ver /api/cleanup-kyc-image),
 *       o
 *   (b) por el job de limpieza programado (ver sql/cleanup_job.sql) si el deudor abandona
 *       el flujo sin firmar, transcurrido el TTL configurado.
 *
 * No se persiste la imagen en ninguna tabla relacional; solo existe en el bucket temporal
 * `kyc-temp` y su path se referencia de forma efímera en el cliente (kycImagePath).
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const ZHIPU_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4/';
const KYC_BUCKET = 'kyc-temp';

// Modelos de visión 100% gratuitos confirmados en la documentación oficial de Zhipu
// (https://docs.bigmodel.cn/cn/guide/models/free/...). Se intenta primero el modelo
// más reciente; si responde con error de cuota/saldo (status 429, code 1113), se
// reintenta automáticamente con el modelo de respaldo, evitando que un agotamiento
// puntual de cupo tumbe todo el flujo de KYC.
const FREE_VISION_MODEL = 'glm-4.6v-flash';
const FREE_VISION_MODEL_FALLBACK = 'glm-4v-flash'; // el primer modelo gratuito de Zhipu

const KYC_SYSTEM_PROMPT = `Eres un oficial de cumplimiento (KYC) digital. Analiza la imagen adjunta. Verifica que corresponda a un documento de identidad oficial (Cédula de ciudadanía, DNI o Pasaporte). Extrae estrictamente estos dos datos y devuélvelos en un JSON limpio:
{
  "es_documento_valido": true,
  "documento_numero": "...",
  "nombre_completo": "..."
}
Si la foto está borrosa, es un paisaje, una selfie sin documento o un documento falso/ilegible, devuelve: { "es_documento_valido": false, "error": "Razón del rechazo" }`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ es_documento_valido: false, error: 'Método no permitido' });
  }

  const { imageBase64, pactId } = req.body || {};

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ es_documento_valido: false, error: 'Falta la imagen del documento' });
  }

  // Límite alineado con el límite real de payload de Vercel (4.5MB en plan Hobby).
  // El frontend ya comprime la imagen antes de enviarla (ver imageCompression.js),
  // así que llegar aquí con un payload de este tamaño es señal de una foto muy
  // pesada incluso comprimida (poco común, pero se valida igual).
  if (imageBase64.length > 4_000_000) {
    return res.status(413).json({
      es_documento_valido: false,
      error: 'La imagen es demasiado grande incluso comprimida. Intenta con otra foto.'
    });
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let tempImagePath = null;

  try {
    // 1) Subir la imagen a almacenamiento TEMPORAL antes de procesar, para poder
    //    auditarla en caso de disputa previa a la firma. Se borra al sellar o por TTL.
    tempImagePath = `${pactId || 'sin-pacto'}/${crypto.randomUUID()}.jpg`;
    const buffer = Buffer.from(imageBase64, 'base64');

    const { error: uploadError } = await supabaseAdmin.storage
      .from(KYC_BUCKET)
      .upload(tempImagePath, buffer, { contentType: 'image/jpeg', upsert: false });

    if (uploadError) {
      // No bloqueamos el KYC si falla el storage temporal, pero lo registramos.
      console.error('[verify-kyc] Error subiendo a storage temporal:', uploadError.message);
      tempImagePath = null;
    }

    // 2) Llamar a GLM (ZhipuAI) vía SDK compatible con OpenAI. Si el modelo principal
    //    responde con error de cuota/saldo, se reintenta una vez con el modelo de respaldo
    //    antes de rendirse — ambos son gratuitos según la documentación oficial de Zhipu.
    const zhipu = new OpenAI({
      apiKey: process.env.ZHIPUAI_API_KEY,
      baseURL: ZHIPU_BASE_URL
    });

    const completion = await callVisionModelWithFallback(zhipu, imageBase64);

    const rawText = completion.choices?.[0]?.message?.content?.trim() || '';
    const parsed = parseKycJson(rawText);

    if (!parsed) {
      return res.status(200).json({
        es_documento_valido: false,
        error: 'No pudimos interpretar el documento. Intenta con una foto más clara y bien iluminada.'
      });
    }

    if (!parsed.es_documento_valido) {
      // Documento rechazado: borrar inmediatamente la imagen temporal, no hay razón para retenerla.
      if (tempImagePath) await safeDeleteTempImage(supabaseAdmin, tempImagePath);
      return res.status(200).json({
        es_documento_valido: false,
        error: parsed.error || 'El documento no pudo ser validado.'
      });
    }

    return res.status(200).json({
      es_documento_valido: true,
      documento_numero: parsed.documento_numero,
      nombre_completo: parsed.nombre_completo,
      tempImagePath // se devuelve solo para permitir su borrado posterior desde el cliente
    });
  } catch (err) {
    // Log estructurado: si es un error de la API de Zhipu (BadRequestError, AuthError, etc.)
    // expone status + código + mensaje, que es lo más útil para diagnosticar rápido
    // problemas como modelo inválido, key inválida, o sin saldo — sin tener que leer
    // el stack trace completo cada vez.
    if (err?.status) {
      console.error(
        `[verify-kyc] Error de la API de Zhipu — status=${err.status} code=${err.code || err.error?.code} message=${err.error?.message || err.message}`
      );
    } else {
      console.error('[verify-kyc] Error inesperado:', err);
    }
    if (tempImagePath) await safeDeleteTempImage(supabaseAdmin, tempImagePath);
    return res.status(500).json({
      es_documento_valido: false,
      error: 'Ocurrió un error verificando tu documento. Intenta de nuevo.'
    });
  }
}

async function callVisionModelWithFallback(zhipu, imageBase64) {
  const buildPayload = (model) => ({
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: KYC_SYSTEM_PROMPT },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
          }
        ]
      }
    ],
    temperature: 0.1,
    // Desactivado: esta es una extracción de OCR simple, no requiere razonamiento
    // profundo. Activar thinking solo añade latencia y costo sin mejorar el resultado.
    thinking: { type: 'disabled' }
  });

  try {
    return await zhipu.chat.completions.create(buildPayload(FREE_VISION_MODEL));
  } catch (err) {
    const isQuotaError = err?.status === 429 || err?.error?.code === '1113' || err?.code === '1113';
    if (!isQuotaError) throw err; // otros errores (auth, modelo inválido) no tienen sentido reintentar

    console.error(
      `[verify-kyc] ${FREE_VISION_MODEL} sin cuota disponible, reintentando con ${FREE_VISION_MODEL_FALLBACK}`
    );
    return await zhipu.chat.completions.create(buildPayload(FREE_VISION_MODEL_FALLBACK));
  }
}

function parseKycJson(rawText) {
  try {
    // El modelo puede envolver el JSON en ```json ... ``` a pesar de las instrucciones.
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

async function safeDeleteTempImage(supabaseAdmin, path) {
  try {
    await supabaseAdmin.storage.from(KYC_BUCKET).remove([path]);
  } catch (e) {
    console.error('[verify-kyc] No se pudo borrar imagen temporal:', e.message);
  }
}
