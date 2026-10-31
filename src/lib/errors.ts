interface QueryErrorLike {
  code?: string
  message?: string
}

const CODE_MESSAGES: Record<string, string> = {
  '23502': 'هناك حقل مطلوب لم يتم إدخاله',
  '23503': 'لا يمكن إتمام العملية لوجود بيانات مرتبطة بهذا السجل',
  '23505': 'هذه البيانات مسجلة بالفعل، تحقق من القيم المدخلة',
  '23514': 'القيم المدخلة غير صالحة، تحقق من الحقول الرقمية',
  '42501': 'لا تملك صلاحية لتنفيذ هذه العملية',
  PGRST116: 'لم يتم العثور على السجل المطلوب',
  PGRST301: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول من جديد',
}

const NETWORK_MESSAGE = 'تعذر الاتصال بالخادم، تحقق من اتصال الإنترنت وحاول مرة أخرى'
const PERMISSION_MESSAGE = 'لا تملك صلاحية لتنفيذ هذه العملية'
const SESSION_MESSAGE = 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول من جديد'

function readError(error: unknown): QueryErrorLike | null {
  if (typeof error !== 'object' || error === null) return null
  const { code, message } = error as QueryErrorLike
  return { code, message }
}

export function friendlyError(error: unknown, fallback: string): string {
  const info = readError(error)
  if (!info) return fallback

  if (info.code && CODE_MESSAGES[info.code]) return CODE_MESSAGES[info.code]

  const message = info.message ?? ''
  if (/forbidden|permission|insufficient privilege|row-level security/i.test(message)) return PERMISSION_MESSAGE
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) return NETWORK_MESSAGE
  if (/jwt|session.*expired|token.*expired/i.test(message)) return SESSION_MESSAGE

  return fallback
}
