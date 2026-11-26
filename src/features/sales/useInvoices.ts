import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { getTenantId } from '@/shared/lib/tenant'


export function useCustomers(repFilter?: string) {
  return useQuery({
    queryKey: ['customers', repFilter],
    queryFn: async () => {
      let query = supabase
        .from('customers')
        .select('*')
        .order('name')

      if (repFilter && repFilter !== 'all') {
        query = query.eq('representative_id', repFilter)
      }

      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

export function useUpsertCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, phone, representative_id, representative_name }: { name: string, phone?: string, representative_id?: string | null, representative_name?: string | null }) => {
      const tenantId = await getTenantId()
      const { data, error } = await supabase
        .from('customers')
        .insert({
          name,
          phone: phone || null,
          representative_id: representative_id || null,
          representative_name: representative_name || null,
          owner_id: tenantId,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['unpaid-credit-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice-details'] })
    },
  })
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name, phone, representative_id, representative_name }: { id: string, name: string, phone: string, representative_id?: string | null, representative_name?: string | null }) => {
      const trimmedPhone = String(phone || '').trim()
      if (!trimmedPhone) throw new Error('رقم هاتف العميل مطلوب')
      const { data, error } = await supabase
        .from('customers')
        .update({
          name,
          phone: trimmedPhone,
          representative_id: representative_id || null,
          representative_name: representative_name || null,
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['unpaid-credit-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice-details'] })
    },
  })
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['unpaid-credit-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice-details'] })
    },
  })
}

export function useCashInvoices(repFilter?: string) {
  return useQuery({
    queryKey: ['cash_invoices', repFilter],
    queryFn: async () => {
      let query = supabase
        .from('cash_invoices')
        .select('*, customers(name), reps(name)')
        .order('created_at', { ascending: false })
      
      if (repFilter && repFilter !== 'all') {
        query = query.eq('rep_id', repFilter)
      }
      
      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

export function useCreditInvoices(repFilter?: string) {
  return useQuery({
    queryKey: ['credit_invoices', repFilter],
    queryFn: async () => {
      let query = supabase
        .from('v_credit_invoices')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (repFilter && repFilter !== 'all') {
        query = query.eq('rep_id', repFilter)
      }
      
      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

export type UnpaidCreditInvoice = {
  invoice_id: string
  invoice_no: string
  invoice_date: string
  due_date: string
  days_diff: number
  is_overdue: boolean
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  rep_id: string | null
  rep_name: string | null
  total_amount: number
  paid_amount: number
  remaining_amount: number
  status: string
}

/** Unpaid / overdue credit invoices, RLS-scoped by the SECURITY INVOKER RPC. */
export function useUnpaidCreditInvoices() {
  return useQuery({
    queryKey: ['unpaid-credit-invoices'],
    queryFn: async (): Promise<UnpaidCreditInvoice[]> => {
      const { data, error } = await supabase.rpc('unpaid_credit_invoices_list')
      if (error) throw error
      return (data || []) as UnpaidCreditInvoice[]
    },
  })
}

export function usePayments(repFilter?: string) {
  return useQuery({
    queryKey: ['payments', repFilter],
    queryFn: async () => {
      let query = supabase
        .from('payments')
        .select('*, customers(name), reps(name), credit_invoices(invoice_no)')
        .order('created_at', { ascending: false })
      
      if (repFilter && repFilter !== 'all') {
        query = query.eq('rep_id', repFilter)
      }
      
      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

export function useAddPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payment: any) => {
      const tenantId = await getTenantId()
      const { data, error } = await supabase
        .from('payments')
        .insert({ ...payment, owner_id: tenantId })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['credit_invoices'] })
      queryClient.invalidateQueries({ queryKey: ['unpaid-credit-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice-details'] })
    },
  })
}

export function useUpdatePayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { data, error } = await supabase
        .from('payments')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['credit_invoices'] })
      queryClient.invalidateQueries({ queryKey: ['unpaid-credit-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice-details'] })
    },
  })
}

export function useDeletePayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['credit_invoices'] })
      queryClient.invalidateQueries({ queryKey: ['unpaid-credit-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice-details'] })
    },
  })
}

export function useCustomerStatement(repFilter?: string) {
  return useQuery({
    queryKey: ['customer_statement', repFilter],
    queryFn: async () => {
      let query = supabase
        .from('v_customer_statement')
        .select('*')
      
      if (repFilter && repFilter !== 'all') {
        const { data: rep } = await supabase
          .from('reps')
          .select('name')
          .eq('id', repFilter)
          .maybeSingle()
        if (rep?.name) {
          query = query.like('reps_list', `%${rep.name}%`)
        }
      }
      
      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

export type InvoiceType = 'cash' | 'credit'

export interface InvoiceDetailLine {
  id: string
  qty: number
  unit_price: number
  line_total: number
  product: {
    name_ar: string | null
    name_en: string | null
    sku: string | null
    unit: string | null
  } | null
}

export interface InvoiceDetailPayment {
  id: string
  date: string
  amount: number
  method: string
  /** Customer payments have no reference column; the linked invoice number is used. */
  reference: string
}

export interface InvoiceDetails {
  id: string
  invoiceType: InvoiceType
  invoice_no: string
  date: string
  due_date: string | null
  customer_name: string
  customer_phone: string | null
  rep_name: string
  amount: number
  down_payment: number
  /** Canonical linked payments, including FIFO-allocated unlinked customer payments. */
  recorded_payments: number
  pooled_payments: number
  total_paid: number
  remaining: number
  status: string | null
  notes: string | null
  item: string | null
  lines: InvoiceDetailLine[]
  payments: InvoiceDetailPayment[]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Full invoice header, itemized lines and (for credit) linked payment history.
 * All queries inherit RLS, so managers and assigned-customer reps see the same
 * invoice scope they already see in the sales tabs.
 */
export function useInvoiceDetails(invoiceId: string | null, invoiceType: InvoiceType) {
  return useQuery({
    queryKey: ['invoice-details', invoiceType, invoiceId],
    enabled: Boolean(invoiceId),
    queryFn: async (): Promise<InvoiceDetails | null> => {
      if (!invoiceId) return null

      const headerSelect = invoiceType === 'cash'
        ? 'id,date,invoice_no,amount,status,notes,item,customer_id,rep_id,customers(name,phone),reps(name)'
        : 'id,date,invoice_no,amount,status,item,due_date,paid,customer_id,rep_id,customers(name,phone),reps(name)'

      const { data: headerRow, error: headerError } = await supabase
        .from(invoiceType === 'cash' ? 'cash_invoices' : 'credit_invoices')
        .select(headerSelect)
        .eq('id', invoiceId)
        .maybeSingle()
      if (headerError) throw headerError
      if (!headerRow) return null

      const header = asRecord(headerRow)
      const customer = asRecord(header.customers)
      const rep = asRecord(header.reps)

      const { data: lineRows, error: linesError } = await supabase
        .from('invoice_lines')
        .select('id,qty,unit_price,line_total,products(name_ar,name_en,sku,unit)')
        .eq('invoice_type', invoiceType)
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: true })
      if (linesError) throw linesError

      const lines: InvoiceDetailLine[] = (lineRows || []).map((raw) => {
        const row = asRecord(raw)
        const product = asRecord(row.products)
        return {
          id: String(row.id || ''),
          qty: asNumber(row.qty),
          unit_price: asNumber(row.unit_price),
          line_total: asNumber(row.line_total),
          product: Object.keys(product).length
            ? {
                name_ar: product.name_ar ? String(product.name_ar) : null,
                name_en: product.name_en ? String(product.name_en) : null,
                sku: product.sku ? String(product.sku) : null,
                unit: product.unit ? String(product.unit) : null,
              }
            : null,
        }
      })

      const payments: InvoiceDetailPayment[] = []
      let downPayment = 0
      let recordedPayments = 0
      let pooledPayments = 0
      let invoiceAmount = asNumber(header.amount)
      let totalPaid = invoiceAmount
      let remaining = 0

      if (invoiceType === 'credit') {
        // v_credit_invoices is the canonical source used by CreditTab: it adds
        // FIFO allocation of unlinked customer payments to direct links.
        const { data: summaryRow, error: summaryError } = await supabase
          .from('v_credit_invoices')
          .select('amount,paid,linked_payments,remaining')
          .eq('id', invoiceId)
          .maybeSingle()
        if (summaryError) throw summaryError

        const summary = summaryRow ? asRecord(summaryRow) : null
        downPayment = asNumber(summary?.paid ?? header.paid)
        recordedPayments = asNumber(summary?.linked_payments)
        invoiceAmount = asNumber(summary?.amount ?? header.amount)

        const { data: paymentRows, error: paymentsError } = await supabase
          .from('payments')
          .select('id,date,amount,method,credit_invoices(invoice_no)')
          .eq('credit_invoice_id', invoiceId)
          .order('date', { ascending: true })
        if (paymentsError) throw paymentsError

        let directPaymentTotal = 0
        for (const raw of paymentRows || []) {
          const row = asRecord(raw)
          const linkedInvoice = asRecord(row.credit_invoices)
          const paymentAmount = asNumber(row.amount)
          directPaymentTotal += paymentAmount
          payments.push({
            id: String(row.id || ''),
            date: row.date ? String(row.date) : '',
            amount: paymentAmount,
            method: row.method ? String(row.method) : '-',
            reference: linkedInvoice.invoice_no ? String(linkedInvoice.invoice_no) : '-',
          })
        }

        pooledPayments = Math.max(0, recordedPayments - directPaymentTotal)
        totalPaid = downPayment + recordedPayments
        remaining = summary ? asNumber(summary.remaining) : Math.max(0, invoiceAmount - totalPaid)
      } else {
        totalPaid = invoiceAmount
        remaining = 0
      }

      const amount = invoiceAmount

      return {
        id: String(header.id || invoiceId),
        invoiceType,
        invoice_no: header.invoice_no ? String(header.invoice_no) : '',
        date: header.date ? String(header.date) : '',
        due_date: header.due_date ? String(header.due_date) : null,
        customer_name: customer.name ? String(customer.name) : '-',
        customer_phone: customer.phone ? String(customer.phone) : null,
        rep_name: rep.name ? String(rep.name) : '-',
        amount,
        down_payment: downPayment,
        recorded_payments: recordedPayments,
        pooled_payments: pooledPayments,
        total_paid: totalPaid,
        remaining,
        status: header.status ? String(header.status) : null,
        notes: header.notes ? String(header.notes) : null,
        item: header.item ? String(header.item) : null,
        lines,
        payments,
      }
    },
  })
}
