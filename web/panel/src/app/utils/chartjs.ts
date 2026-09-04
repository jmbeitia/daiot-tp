import { Chart, registerables } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
Chart.register(...registerables, zoomPlugin);
export { Chart };

export type Periodo = 7 | 30 | 90 | 365;
export type Modo = 'promedio' | 'acumulativo';

export const PALETTE = [
  '#e65100', // naranja marca
  '#1b5e20', // verde muy oscuro
  '#ffb74d', // ámbar claro
  '#2e7d32', // verde marca
  '#bf360c', // teja oscuro
  '#a5d6a7', // verde muy claro
  '#f57c00', // naranja puro
  '#388e3c', // verde medio
  '#ff7043', // naranja rojizo
  '#66bb6a', // verde claro
];

export function periodoLabel(dias: Periodo): string {
  switch (dias) {
    case 7:   return 'Última semana';
    case 30:  return 'Último mes';
    case 90:  return 'Últimos 3 meses';
    case 365: return 'Último año';
  }
}

// ── Formatters de labels ───────────────────────────────

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const DIAS_SEMANA = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

/** "YYYY-MM-DD" o "YYYY-MM" → "Jun 25" */
export function formatMes(mes: string): string {
  const [year, month] = mes.split('-');
  return `${MESES[parseInt(month) - 1]} ${year.slice(2)}`;
}

/** "YYYY-MM-DD" → "Lun 9/6" */
export function formatDia(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${DIAS_SEMANA[dow]} ${d}/${m}`;
}

/** "YYYY-MM-DD" (inicio de semana) → "9/6" */
export function formatSemana(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}/${m}`;
}

// ── Funciones de relleno ───────────────────────────────

type Punto = { mes: string; total: number };

/** Rellena los N meses correspondientes al período (3 o 12). */
export function fillMeses(datos: Punto[], periodo: Periodo): Punto[] {
  const nMeses = periodo <= 30 ? 1 : periodo <= 90 ? 3 : 12;
  const result: Punto[] = [];
  const now = new Date();
  for (let i = nMeses - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    // backend devuelve YYYY-MM-DD; comparar con startsWith("YYYY-MM")
    result.push({ mes: key, total: datos.find(x => x.mes.startsWith(key))?.total ?? 0 });
  }
  return result;
}

/** Rellena los últimos N días (default 7). */
export function fillDias(datos: Punto[], nDias = 7): Punto[] {
  const result: Punto[] = [];
  const now = new Date();
  for (let i = nDias - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    result.push({ mes: key, total: datos.find(x => x.mes === key)?.total ?? 0 });
  }
  return result;
}

/** Rellena las últimas N semanas (lunes como inicio). */
export function fillSemanas(datos: Punto[], nSemanas: number): Punto[] {
  const result: Punto[] = [];
  const now = new Date();
  const dow = now.getDay(); // 0=Dom
  const toMonday = dow === 0 ? 6 : dow - 1;
  const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - toMonday);
  for (let i = nSemanas - 1; i >= 0; i--) {
    const ws = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - i * 7);
    const key = `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, '0')}-${String(ws.getDate()).padStart(2, '0')}`;
    result.push({ mes: key, total: datos.find(x => x.mes === key)?.total ?? 0 });
  }
  return result;
}
