const WESTERN_LOCALE = 'ar-EG-u-nu-latn';

const moneyFormatter2dp = new Intl.NumberFormat(WESTERN_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const moneyFormatter0dp = new Intl.NumberFormat(WESTERN_LOCALE, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const quantityFormatter = new Intl.NumberFormat(WESTERN_LOCALE, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export type NumericInput = number | string | null | undefined;

/**
 * Converts a numeric input into integer piastres (cents) to avoid floating-point drift.
 */
export function toPiastres(value: NumericInput): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = typeof value === 'string' ? Number(value.replace(/,/g, '').trim()) : value;
  if (!Number.isFinite(parsed)) return 0;
  const rounded = Math.round(parsed * 100);
  return rounded === 0 ? 0 : rounded;
}

/**
 * Converts integer piastres back into a decimal amount with at most 2 decimal places.
 */
export function fromPiastres(piastres: number): number {
  return Math.round(piastres) / 100;
}

/**
 * Parses a raw money input string or number into a rounded 2-decimal value.
 */
export function parseMoneyInput(value: NumericInput): number {
  return fromPiastres(toPiastres(value));
}

export interface FormatMoneyOptions {
  /** Whether to append the currency label (default: true). */
  withCurrency?: boolean;
  /** Currency label to append (default: 'ج.م'). */
  currencyLabel?: string;
  /** Number of fraction digits: 2 (default) or 0 for compact integer summaries. */
  decimals?: 0 | 2;
}

/**
 * Formats a monetary value using Intl.NumberFormat with Western digits and integer-piastre precision.
 */
export function formatMoney(amount: NumericInput, options: FormatMoneyOptions = {}): string {
  const {
    withCurrency = true,
    currencyLabel = 'ج.م',
    decimals = 2,
  } = options;

  const piastres = toPiastres(amount);
  const exactAmount = fromPiastres(piastres);
  const formatter = decimals === 0 ? moneyFormatter0dp : moneyFormatter2dp;
  const formattedNumber = formatter.format(exactAmount);

  return withCurrency ? `${formattedNumber} ${currencyLabel}` : formattedNumber;
}

export type CashFlowDirection = 'inflow' | 'outflow' | 'neutral';

export interface CashFlowFormatted {
  piastres: number;
  direction: CashFlowDirection;
  sign: '+' | '−' | '';
  absFormatted: string;
  formatted: string;
}

export interface FormatCashFlowOptions extends FormatMoneyOptions {
  /** Explicit direction override when the stored amount is unsigned (e.g. an outcome/expense column). */
  direction?: 'inflow' | 'outflow';
  /** Show '+' for positive inflows (default: true). */
  showPlusSign?: boolean;
}

/**
 * Formats a cash-flow amount with explicit direction, sign, and integer-piastre precision.
 */
export function formatCashFlow(
  amount: NumericInput,
  options: FormatCashFlowOptions = {}
): CashFlowFormatted {
  const {
    withCurrency = true,
    currencyLabel = 'ج.م',
    decimals = 2,
    direction: forcedDirection,
    showPlusSign = true,
  } = options;

  const rawPiastres = toPiastres(amount);
  const effectivePiastres =
    forcedDirection === 'outflow'
      ? -Math.abs(rawPiastres)
      : forcedDirection === 'inflow'
        ? Math.abs(rawPiastres)
        : rawPiastres;

  const direction: CashFlowDirection =
    effectivePiastres > 0 ? 'inflow' : effectivePiastres < 0 ? 'outflow' : 'neutral';

  const sign: '+' | '−' | '' =
    direction === 'inflow' ? (showPlusSign ? '+' : '') : direction === 'outflow' ? '−' : '';

  const absFormatted = formatMoney(fromPiastres(Math.abs(effectivePiastres)), {
    withCurrency,
    currencyLabel,
    decimals,
  });

  const formatted = sign ? `${sign}${absFormatted}` : absFormatted;

  return {
    piastres: effectivePiastres,
    direction,
    sign,
    absFormatted,
    formatted,
  };
}

/**
 * Formats general quantities, counts, or metrics using Western digits without floating-point noise.
 */
export function formatNumber(num: NumericInput): string {
  if (num === null || num === undefined || num === '') return '0';
  const n = typeof num === 'string' ? Number(num.replace(/,/g, '').trim()) : num;
  if (!Number.isFinite(n)) return '0';
  return quantityFormatter.format(Math.round(n * 100) / 100);
}

export const monthNames = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export function getTodayISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
