import { OrderStatus, PaymentMethod } from './models';

/** Server salje lokalno vreme bez zone ("2026-09-28T12:30:00"), sto browser cita kao lokalno. */
export function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function time(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date) return '-';
  return date.toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit' });
}

export function dateTime(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date) return '-';
  return date.toLocaleString('sr-Latn-RS', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "pre 12 min" / "za 5 min" u odnosu na sada. */
export function relative(value: string | null | undefined, now = Date.now()): string {
  const date = toDate(value);
  if (!date) return '';
  const minutes = Math.round((date.getTime() - now) / 60000);
  if (minutes === 0) return 'sada';
  return minutes > 0 ? `za ${minutes} min` : `pre ${-minutes} min`;
}

export function minutesSince(value: string | null | undefined, now = Date.now()): number {
  const date = toDate(value);
  return date ? Math.floor((now - date.getTime()) / 60000) : 0;
}

export function money(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  return `${amount.toLocaleString('sr-Latn-RS', { maximumFractionDigits: 2 })} din`;
}

export function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Ceka vozaca',
  ASSIGNED: 'Dodeljena',
  PICKED_UP: 'Kod vozaca',
  DELIVERED: 'Predata',
  FAILED: 'Problem',
  CANCELLED: 'Otkazana',
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Gotovina',
  CARD: 'Kartica',
  PREPAID: 'Placeno',
};

/** Link za navigaciju: koordinate kad postoje, inace adresa. */
export function mapsUrl(latitude: number | null, longitude: number | null, address: string): string {
  const destination = latitude != null && longitude != null ? `${latitude},${longitude}` : address;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
