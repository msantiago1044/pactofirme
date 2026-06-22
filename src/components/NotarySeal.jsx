import { ShieldCheck } from 'lucide-react';

/**
 * NotarySeal — el elemento "signature" del sistema de diseño.
 * Un sello circular tipo timbre que cae y rota sobre el documento al confirmarse la firma,
 * dejando el hash como "tinta" debajo. Respeta prefers-reduced-motion vía CSS global.
 */
export default function NotarySeal({ animate = true, size = 'md' }) {
  const dims = size === 'lg' ? 'w-36 h-36' : size === 'sm' ? 'w-20 h-20' : 'w-32 h-32';

  return (
    <div
      className={`notary-seal ${dims} ${animate ? 'animate-stamp' : ''} bg-notary-paperWarm/40`}
      role="img"
      aria-label="Sello de pacto sellado e inmutable"
    >
      <div className="flex flex-col items-center gap-1">
        <ShieldCheck size={size === 'lg' ? 34 : 26} strokeWidth={1.5} />
        <span className="text-[9px] font-serif uppercase tracking-[0.18em] leading-tight text-center px-2">
          Pacto<br />Sellado
        </span>
      </div>
    </div>
  );
}
