import { useEffect } from 'react';

/**
 * Tabla de estados <title> / favicon por fase, tal como se especifica en el brief de marca.
 * Cada fase tiene un emoji que funciona como favicon improvisado (vía data URI en el <link>)
 * y como prefijo visual del título de la pestaña.
 */
export const PHASE_META = {
  idle: {
    emoji: '⚖️',
    title: '⚖️ PactoFirme | Formaliza tus préstamos con validez legal'
  },
  draft: (pactNumber = '') => ({
    emoji: '📝',
    title: `📝 Redactando Pagaré #${pactNumber} | PactoFirme`
  }),
  signing: {
    emoji: '🔐',
    title: '🔐 Autenticando Deudor... | PactoFirme'
  },
  sealed: {
    emoji: '🤝',
    title: '🤝 ¡Trato Cerrado! Contrato Inmutable | PactoFirme'
  }
};

function emojiToFaviconHref(emoji) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * @param {string} title
 * @param {string} emoji
 */
export function useDocumentMeta(title, emoji) {
  useEffect(() => {
    if (title) document.title = title;
    if (emoji) {
      const link = document.getElementById('favicon');
      if (link) link.setAttribute('href', emojiToFaviconHref(emoji));
    }
  }, [title, emoji]);
}
