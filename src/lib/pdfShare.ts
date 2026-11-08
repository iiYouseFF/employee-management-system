import { jsPDF } from 'jspdf'

let cachedFontBase64: string | null = null

async function loadAmiriFont(): Promise<string | null> {
  if (cachedFontBase64) return cachedFontBase64
  try {
    const res = await fetch('/fonts/Amiri-Regular.ttf')
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    let binary = ''
    const bytes = new Uint8Array(buffer)
    const len = bytes.byteLength
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    cachedFontBase64 = btoa(binary)
    return cachedFontBase64
  } catch (err) {
    console.warn('Could not load Amiri font, falling back to default font:', err)
    return null
  }
}

/**
 * Configure jsPDF document with Arabic font and RTL settings if available.
 */
export async function createArabicPdf(orientation: 'p' | 'l' = 'p'): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  })

  const fontBase64 = await loadAmiriFont()
  if (fontBase64) {
    doc.addFileToVFS('Amiri.ttf', fontBase64)
    doc.addFont('Amiri.ttf', 'Amiri', 'normal')
    doc.addFont('Amiri.ttf', 'Amiri', 'bold')
    doc.setFont('Amiri', 'normal')
  }

  return doc
}

/**
 * Shape Arabic text for PDF output using jsPDF's built-in processArabic.
 */
export function shapeArabic(doc: jsPDF, text: string | number | null | undefined): string {
  if (text === null || text === undefined) return ''
  const str = String(text)
  if (!str) return ''
  // If the text contains Arabic characters, shape it
  if (/[\u0600-\u06FF]/.test(str)) {
    try {
      return doc.processArabic(str)
    } catch {
      return str
    }
  }
  return str
}

/**
 * Format a phone number to WhatsApp international standard.
 * Handles Egyptian local numbers (+20, 01xxxxxxxxx).
 */
export function cleanWhatsAppPhone(phone?: string | null): string {
  if (!phone) return ''
  let cleaned = phone.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1)
  } else if (cleaned.startsWith('01')) {
    // Default Egyptian mobile without country code -> add 20
    cleaned = '20' + cleaned.substring(1)
  }
  return cleaned
}

/**
 * Open WhatsApp chat with optional message and pre-filled recipient.
 */
export function openWhatsAppChat(phone: string | null | undefined, message: string): void {
  const cleanPhone = cleanWhatsAppPhone(phone)
  const encodedMsg = encodeURIComponent(message)
  const url = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodedMsg}`
    : `https://wa.me/?text=${encodedMsg}`
  window.open(url, '_blank')
}

/**
 * Share or trigger WhatsApp sharing for a generated PDF file.
 * If Web Share API supports file sharing (standard on mobile browsers),
 * it opens the native share sheet directly targeting WhatsApp.
 * Otherwise, downloads the PDF and opens WhatsApp with a pre-filled message.
 */
export async function sharePdfViaWhatsApp({
  doc,
  filename,
  recipientPhone,
  message,
}: {
  doc: jsPDF
  filename: string
  recipientPhone?: string | null
  message: string
}): Promise<{ sharedViaNative: boolean }> {
  const blob = doc.output('blob')
  const file = new File([blob], filename, { type: 'application/pdf' })

  // 1. Try native Web Share API (supported on mobile Chrome / Safari / Edge)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: filename,
        text: message,
      })
      return { sharedViaNative: true }
    } catch (err: any) {
      // User canceled share sheet or permission denied - return without fallback if dismissed
      if (err?.name === 'AbortError') {
        return { sharedViaNative: false }
      }
      console.warn('Native share failed, falling back to download + WhatsApp link:', err)
    }
  }

  // 2. Desktop / Unsupported fallback:
  // Trigger file download so user has the PDF ready, then launch WhatsApp Web/App
  const fileUrl = URL.createObjectURL(blob)
  const downloadLink = document.createElement('a')
  downloadLink.href = fileUrl
  downloadLink.download = filename
  document.body.appendChild(downloadLink)
  downloadLink.click()
  document.body.removeChild(downloadLink)
  setTimeout(() => URL.revokeObjectURL(fileUrl), 5000)

  // Open WhatsApp chat
  openWhatsAppChat(recipientPhone, message)

  return { sharedViaNative: false }
}
