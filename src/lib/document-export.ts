'use client'

// html2canvas, jspdf는 브라우저 전용 → SSR 충돌 방지를 위해 함수 내부에서 동적 import

async function loadHtml2canvas() {
  const mod = await import('html2canvas')
  return mod.default as typeof import('html2canvas').default
}

async function loadJsPDF() {
  const mod = await import('jspdf')
  // jspdf ESM export 호환
  return (mod.jsPDF ?? mod.default) as typeof import('jspdf').jsPDF
}

/** #document-print-area 를 캔버스로 렌더 */
export async function renderCanvas(elementId = 'document-print-area'): Promise<HTMLCanvasElement> {
  const html2canvas = await loadHtml2canvas()
  const el = document.getElementById(elementId)
  if (!el) throw new Error('print element not found')
  return html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    width: el.offsetWidth,
    windowWidth: 900,
  })
}

export async function downloadPDF(filename: string, elementId = 'document-print-area') {
  const JsPDF = await loadJsPDF()
  const canvas = await renderCanvas(elementId)
  const img = canvas.toDataURL('image/jpeg', 0.98)
  const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const imgW = pageW
  const imgH = (canvas.height * imgW) / canvas.width

  if (imgH <= pageH) {
    pdf.addImage(img, 'JPEG', 0, 0, imgW, imgH)
  } else {
    let position = 0
    let heightLeft = imgH
    pdf.addImage(img, 'JPEG', 0, position, imgW, imgH)
    heightLeft -= pageH
    while (heightLeft > 0) {
      position = heightLeft - imgH
      pdf.addPage()
      pdf.addImage(img, 'JPEG', 0, position, imgW, imgH)
      heightLeft -= pageH
    }
  }
  pdf.save(`${filename}.pdf`)
}

export async function downloadJPG(filename: string, elementId = 'document-print-area') {
  const canvas = await renderCanvas(elementId)
  const url = canvas.toDataURL('image/jpeg', 0.95)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.jpg`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export async function getCanvasBlob(
  elementId = 'document-print-area',
  mime = 'image/jpeg',
  quality = 0.95,
): Promise<Blob> {
  const canvas = await renderCanvas(elementId)
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), mime, quality)
  })
}

/** PDF를 Blob으로 반환 (다운로드 없이 Drive 업로드 등에 사용) */
export async function getPDFBlob(elementId = 'document-print-area'): Promise<Blob> {
  const JsPDF = await loadJsPDF()
  const canvas = await renderCanvas(elementId)
  const img = canvas.toDataURL('image/jpeg', 0.98)
  const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const imgW = pageW
  const imgH = (canvas.height * imgW) / canvas.width

  if (imgH <= pageH) {
    pdf.addImage(img, 'JPEG', 0, 0, imgW, imgH)
  } else {
    let position = 0
    let heightLeft = imgH
    pdf.addImage(img, 'JPEG', 0, position, imgW, imgH)
    heightLeft -= pageH
    while (heightLeft > 0) {
      position = heightLeft - imgH
      pdf.addPage()
      pdf.addImage(img, 'JPEG', 0, position, imgW, imgH)
      heightLeft -= pageH
    }
  }
  // jsPDF output('blob') returns Blob
  return pdf.output('blob') as unknown as Blob
}
