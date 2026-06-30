export const MN = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const TABS = [
  { key: 'atletas', label: 'Atletas', icon: 'people-outline' },
  { key: 'familias', label: 'Familias', icon: 'home-outline' },
  { key: 'revision', label: 'Revisión', icon: 'document-attach-outline' },
  { key: 'planes', label: 'Planes', icon: 'document-text-outline' },
];

const ESTADO_FILTROS_BASE = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'pagado', label: 'Pagos' },
  { value: 'vencido', label: 'Vencidos' },
];

export const ESTADO_FILTROS = [...ESTADO_FILTROS_BASE].sort((a, b) => {
  if (a.value === 'todos') return -1;
  if (b.value === 'todos') return 1;
  return a.label.localeCompare(b.label, 'es', { sensitivity: 'base' });
});

export const METODOS = [
  { value: 'efectivo', label: 'Efectivo', icon: 'cash-outline' },
  { value: 'transferencia', label: 'Transferencia', icon: 'swap-horizontal-outline' },
  { value: 'mercado_pago', label: 'Mercado Pago', icon: 'card-outline' },
  { value: 'otro', label: 'Otro', icon: 'ellipsis-horizontal' },
];

export function metodoPagoLabel(value) {
  const m = METODOS.find((x) => x.value === value);
  if (m) return m.label;
  if (!value) return null;
  return String(value).replace(/_/g, ' ');
}

export function metodoPagoIcon(value) {
  return METODOS.find((x) => x.value === value)?.icon || 'ellipsis-horizontal';
}

export const EST_COLOR = { pendiente: '#f59e0b', pagado: '#10b981', vencido: '#ef4444', en_revision: '#6366f1' };

export const fmtMoney = (n) => `$${(n || 0).toLocaleString('es-AR')}`;
