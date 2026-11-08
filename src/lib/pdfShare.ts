import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/**
 * Clean & normalize a phone number for WhatsApp wa.me links.
 */
export function cleanWhatsAppPhone(phone?: string | null): string {
  if (!phone) return ''
  let cleaned = phone.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1)
  } else if (cleaned.startsWith('01')) {
    cleaned = '20' + cleaned.substring(1)
  }
  return cleaned
}

/**
 * Open WhatsApp chat with optional message and recipient.
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
 * Converts an HTML string or element into a pixel-perfect A4 PDF using HTML5 canvas.
 * This completely eliminates Arabic reversed text or detached letter issues, because
 * the browser's own native typography & shaping engine (Tajawal font) renders the layout!
 */
export async function generatePdfFromHtml(htmlContent: string): Promise<Blob> {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-9999px'
  container.style.top = '0'
  container.style.width = '794px' // Standard A4 width at 96 DPI (210mm)
  container.style.backgroundColor = '#ffffff'
  container.style.zIndex = '-9999'
  container.setAttribute('dir', 'rtl')
  container.innerHTML = htmlContent

  document.body.appendChild(container)

  // Allow any webfonts to apply
  if (document.fonts) {
    try {
      await document.fonts.ready
    } catch {
      // ignore
    }
  }

  try {
    const canvas = await html2canvas(container, {
      scale: 2, // High-DPI retina sharpness
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 794,
    })

    const imgData = canvas.toDataURL('image/jpeg', 0.95)
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = pdf.internal.pageSize.getHeight()

    const canvasWidth = canvas.width
    const canvasHeight = canvas.height
    const imgHeight = (canvasHeight * pdfWidth) / canvasWidth

    let heightLeft = imgHeight
    let position = 0

    // Add first page
    pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight, undefined, 'FAST')
    heightLeft -= pdfHeight

    // Add subsequent pages if multi-page document
    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight, undefined, 'FAST')
      heightLeft -= pdfHeight
    }

    return pdf.output('blob')
  } finally {
    document.body.removeChild(container)
  }
}

/**
 * Share or trigger WhatsApp sharing for a generated PDF file.
 */
export async function sharePdfBlobViaWhatsApp({
  blob,
  filename,
  recipientPhone,
  message,
}: {
  blob: Blob
  filename: string
  recipientPhone?: string | null
  message: string
}): Promise<{ sharedViaNative: boolean }> {
  const file = new File([blob], filename, { type: 'application/pdf' })

  // 1. Native mobile share sheet
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: filename,
        text: message,
      })
      return { sharedViaNative: true }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { sharedViaNative: false }
      }
      console.warn('Native share failed, using fallback:', err)
    }
  }

  // 2. Desktop fallback: download PDF file and launch WhatsApp chat
  const fileUrl = URL.createObjectURL(blob)
  const downloadLink = document.createElement('a')
  downloadLink.href = fileUrl
  downloadLink.download = filename
  document.body.appendChild(downloadLink)
  downloadLink.click()
  document.body.removeChild(downloadLink)
  setTimeout(() => URL.revokeObjectURL(fileUrl), 5000)

  openWhatsAppChat(recipientPhone, message)

  return { sharedViaNative: false }
}
