import {
  cn,
  formatCashFlow,
  formatMoney,
  type FormatCashFlowOptions,
  type FormatMoneyOptions,
  type NumericInput,
} from '@/shared/lib/format';

interface MoneyTextProps extends FormatMoneyOptions {
  amount: NumericInput;
  className?: string;
}

/**
 * Renders a monetary amount with the dedicated numeral font, tabular alignment, and RTL isolation.
 */
export function MoneyText({
  amount,
  withCurrency = true,
  currencyLabel = 'ج.م',
  decimals = 2,
  className,
}: MoneyTextProps) {
  return (
    <span className={cn('money-value', className)} dir="ltr">
      {formatMoney(amount, { withCurrency, currencyLabel, decimals })}
    </span>
  );
}

interface CashFlowTextProps extends FormatCashFlowOptions {
  amount: NumericInput;
  className?: string;
  /** Apply semantic inflow/outflow colors automatically (default: true). */
  colored?: boolean;
}

/**
 * Renders a cash-flow amount (+/-) with semantic coloring, dedicated numeral font, and RTL isolation.
 */
export function CashFlowText({
  amount,
  direction,
  showPlusSign = true,
  withCurrency = true,
  currencyLabel = 'ج.م',
  decimals = 2,
  colored = true,
  className,
}: CashFlowTextProps) {
  const { formatted, direction: resolvedDirection } = formatCashFlow(amount, {
    direction,
    showPlusSign,
    withCurrency,
    currencyLabel,
    decimals,
  });

  const colorClass = colored
    ? resolvedDirection === 'inflow'
      ? 'text-emerald-700'
      : resolvedDirection === 'outflow'
        ? 'text-rose-700'
        : 'text-slate-700'
    : undefined;

  return (
    <span className={cn('money-value', colorClass, className)} dir="ltr">
      {formatted}
    </span>
  );
}
