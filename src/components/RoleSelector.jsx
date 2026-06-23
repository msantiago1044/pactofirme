import { Landmark, HandCoins } from 'lucide-react';

/**
 * RoleSelector — se muestra antes del Libro Mayor cuando todavía no sabemos
 * si quien abrió el link es el prestador o el deudor (MVP sin login real).
 */
export default function RoleSelector({ pact, onSelect }) {
  return (
    <div className="max-w-md mx-auto px-5 py-12 text-center space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-notary-ink">¿Cómo entras a este pacto?</h1>
        <p className="text-sm text-notary-ink/60 mt-2">
          Préstamo de {pact.lender_name} — recordaremos tu elección en este dispositivo.
        </p>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => onSelect('lender')}
          className="w-full folio-border bg-notary-paperWarm px-5 py-4 flex items-center gap-3 hover:border-notary-gold transition-colors text-left"
        >
          <Landmark size={22} className="text-notary-gold shrink-0" />
          <div>
            <p className="font-medium text-notary-ink">Soy el Prestador</p>
            <p className="text-xs text-notary-ink/50">Presté el dinero y confirmo los abonos recibidos</p>
          </div>
        </button>

        <button
          onClick={() => onSelect('borrower')}
          className="w-full folio-border bg-notary-paperWarm px-5 py-4 flex items-center gap-3 hover:border-notary-gold transition-colors text-left"
        >
          <HandCoins size={22} className="text-notary-gold shrink-0" />
          <div>
            <p className="font-medium text-notary-ink">Soy el Deudor</p>
            <p className="text-xs text-notary-ink/50">Recibí el préstamo y subo mis comprobantes de pago</p>
          </div>
        </button>
      </div>

      <p className="text-xs text-notary-ink/40 leading-relaxed">
        Nota: en esta versión de prueba, cualquiera con el link puede elegir un rol.
        En producción, esto se verificará automáticamente con tu cuenta.
      </p>
    </div>
  );
}
