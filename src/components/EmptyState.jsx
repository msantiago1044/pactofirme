export default function EmptyState({ icon: Icon, title, action }) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6 folio-border border-dashed">
      {Icon && <Icon size={32} className="text-notary-ink/30 mb-4" strokeWidth={1.5} />}
      <p className="text-notary-ink/60 font-serif text-base max-w-xs leading-relaxed">{title}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
