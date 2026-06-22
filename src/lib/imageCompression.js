/**
 * imageCompression.js
 * Redimensiona y comprime una foto (ej. de cédula) en el navegador antes de
 * convertirla a Base64 y enviarla a la serverless function.
 *
 * Por qué existe: Vercel impone un límite duro al tamaño del body de una
 * function (4.5MB en el plan Hobby). Una foto de cámara moderna sin comprimir
 * pesa 3-8MB, y Base64 le agrega ~33% más — fácilmente supera el límite y
 * Vercel la rechaza con 413 antes de que el código de la función se ejecute.
 *
 * 1600px de lado máximo y calidad 0.82 son suficientes para que el OCR de
 * GLM-4V siga leyendo con claridad el número de cédula y el nombre.
 */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

/**
 * @param {File} file - Archivo de imagen seleccionado por el usuario.
 * @returns {Promise<string>} Base64 (sin el prefijo data:image/...) ya comprimido.
 */
export function fileToCompressedBase64(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      try {
        const { width, height } = scaledDimensions(img.width, img.height, MAX_DIMENSION);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl.split(',')[1]);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer la imagen seleccionada'));
    };

    img.src = objectUrl;
  });
}

function scaledDimensions(width, height, maxDimension) {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }
  const ratio = width > height ? maxDimension / width : maxDimension / height;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio)
  };
}
