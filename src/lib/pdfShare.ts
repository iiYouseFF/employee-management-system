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
 * Configure jsPDF document with Arabic font and automatic BiDi text handling.
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

  // Intercept doc.text to ensure isInputVisual is always false.
  // jsPDF's built-in BiDi engine shapes Arabic glyphs and correctly reorders
  // both words, mixed numbers, and letters in true RTL when isInputVisual is false.
  const originalText = doc.text.bind(doc)
  doc.text = function (...args: any[]) {
    const text = args[0]
    const x = args[1]
    const y = args[2]
    const options = typeof args[3] === 'object' && args[3] !== null ? args[3] : {}
    const transform = args[4]

    const mergedOptions = {
      ...options,
      isInputVisual: false,
    }

    return (originalText as any)(text, x, y, mergedOptions, transform)
  }

  return doc
}

/**
 * Helper to ensure text strings passed to PDF tables/headers are valid strings.
 * Note: Since doc.text is configured with isInputVisual: false, jsPDF automatically
 * handles Arabic letter shaping and BiDi reordering natively without double-inverting.
 */
export function shapeArabic(_doc: jsPDF, text: string | number | null | undefined): string {
  if (text === null || text === undefined) return ''
  return String(text)
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
