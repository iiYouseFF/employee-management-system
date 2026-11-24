import { paymentMethodBadgeClass, paymentMethodLabel } from '@/shared/lib/paymentMethods'
export default function PaymentMethodBadge({ method }: { method?: string | null }) {
  return <span className={paymentMethodBadgeClass(method)}>{paymentMethodLabel(method)}</span>
}
