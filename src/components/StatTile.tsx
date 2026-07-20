import type { LucideIcon } from 'lucide-react';

export default function StatTile({
  label, value, icon: Icon, active, onClick,
}: {
  label: string; value: number; icon?: LucideIcon; active?: boolean; onClick?: () => void;
}) {
  const base = 'min-w-0 overflow-hidden rounded-2xl border p-4 text-left shadow-sm transition-colors';
  const cls = onClick
    ? `${base} w-full ${active ? 'border-lake-500 bg-lake-50' : 'border-lake-100 bg-white hover:border-lake-300'}`
    : `${base} border-lake-100 bg-white`;
  const inner = (
    <>
      {Icon && <Icon size={18} className="text-lake-600" />}
      <p className="mt-2 text-2xl font-bold tabular-nums text-lake-950">{value}</p>
      <p className="truncate text-xs text-lake-500">{label}</p>
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className={cls}>{inner}</button>
    : <div className={cls}>{inner}</div>;
}
