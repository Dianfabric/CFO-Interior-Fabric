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

/**
 * #document-print-area 를 캔버스로 렌더
 *
 * Tailwind v4 는 oklch() 색상 함수를 사용하는데 html2canvas v1.4 가 이를
 * 파싱하지 못해 에러가 발생한다. <style>/<link> 패치는 Next.js 환경에서
 * 신뢰할 수 없으므로, Tailwind CSS 가 전혀 없는 순수 iframe 에 문서 HTML
 * 만 넣고 캡처하는 방식을 사용한다.
 * (DocumentLayout / 표 컴포넌트는 100 % 인라인 스타일이라 외부 CSS 없어도 동일하게 렌더링됨)
 */
export async function renderCanvas(elementId = 'document-print-area'): Promise<HTMLCanvasElement> {
  const html2canvas = await loadHtml2canvas()
  const el = document.getElementById(elementId)
  if (!el) throw new Error('요소를 찾을 수 없습니다: ' + elementId)

  const elWidth  = el.offsetWidth
  const elHeight = Math.max(el.scrollHeight + 60, 1200)

  /* ── Tailwind CSS 없는 순수 iframe 생성 ── */
  const iframe = document.createElement('iframe')
  Object.assign(iframe.style, {
    position:   'fixed',
    top:        '0px',
    left:       `-${elWidth + 200}px`,   // 화면 밖
    width:      `${elWidth}px`,
    height:     `${elHeight}px`,
    border:     'none',
    visibility: 'hidden',
  })
  document.body.appendChild(iframe)

  try {
    const idoc = iframe.contentDocument!
    idoc.open()
    idoc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <base href="${location.origin}">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background: #fff; }
    img  { max-width: none !important; }
    table { border-collapse: collapse; }
  </style>
</head>
<body>${el.outerHTML}</body>
</html>`)
    idoc.close()

    /* ── 이미지 로드 완료 대기 ── */
    await Promise.all(
      Array.from(idoc.querySelectorAll<HTMLImageElement>('img')).map(img =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r() })
      )
    )
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

    const target =
      idoc.getElementById(elementId) ??
      (idoc.body.firstElementChild as HTMLElement)

    return await html2canvas(target, {
      scale:           2,
      useCORS:         true,
      allowTaint:      true,
      backgroundColor: '#ffffff',
      logging:         false,
      imageTimeout:    15000,
    })
  } finally {
    document.body.removeChild(iframe)
  }
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

export type CopyImageResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'permission' | 'timeout' | 'render' | 'blob' | 'unknown'; error?: string }

/**
 * 캔버스를 미리 렌더링해서 PNG Blob 의 Promise 를 반환.
 * 호버 시 호출하여 클릭 전까지 미리 작업을 진행.
 */
export function prerenderImage(elementId = 'document-print-area'): Promise<Blob> {
  return prerenderImageBoth(elementId).then((r) => r.blob)
}

export interface PrerenderResult {
  blob: Blob
  /** PNG data URL — execCommand 폴백 시 self-contained 클립보드 데이터로 사용 */
  dataUrl: string
}

/**
 * 캔버스 → PNG Blob + dataUrl (둘 다 동시에 만듦).
 * dataUrl 은 외부 앱이 읽을 수 있는 self-contained 형식이라 execCommand 폴백에 적합.
 */
export async function prerenderImageBoth(elementId = 'document-print-area'): Promise<PrerenderResult> {
  const canvas = await renderCanvas(elementId)
  const dataUrl = canvas.toDataURL('image/png')
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/png',
    )
  })
  return { blob, dataUrl }
}

/**
 * 이미 디코딩 완료된 HTMLImageElement 를 execCommand('copy') 로 클립보드에 복사.
 * 핵심: img 가 반드시 fully loaded 상태여야 Chromium 이 image/png 바이트를
 * 클립보드에 등록한다. (로드 안 된 img 면 text/html 만 들어가서 카톡 등이
 * 인식 못 함)
 *
 * 동작:
 *  - 화면 밖 contentEditable div 에 img clone 삽입
 *  - img clone 을 select 후 execCommand('copy')
 *  - 사용자 클릭 핸들러 내 동기 호출 필수
 */
export function copyLoadedImgViaExecCommand(img: HTMLImageElement): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  if (!img.complete || !img.naturalWidth) {
    console.warn('[copyLoadedImg] img is not fully loaded, copy may fail')
  }

  const container = document.createElement('div')
  container.contentEditable = 'true'
  container.style.position = 'fixed'
  container.style.left = '-9999px'
  container.style.top = '0'
  container.style.opacity = '0'
  // clone 으로 원본 img 안 건드리기 (원본은 캐시에 보존)
  const imgClone = img.cloneNode(true) as HTMLImageElement
  container.appendChild(imgClone)
  document.body.appendChild(container)

  let success = false
  try {
    const range = document.createRange()
    range.selectNode(imgClone)
    const sel = window.getSelection()
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(range)
      try {
        success = document.execCommand('copy')
      } catch {
        success = false
      }
      sel.removeAllRanges()
    }
  } finally {
    try { document.body.removeChild(container) } catch {}
  }
  return success
}

/**
 * dataURL 을 fully-loaded HTMLImageElement 로 변환.
 * prerender 단계에서 호출하여 클릭 시 즉시 복사 가능하게 미리 디코딩.
 */
export function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = dataUrl
  })
}

/**
 * Blob 을 execCommand('copy') 로 클립보드에 복사 (구식 API, 일부 환경 보완).
 * Clipboard API 가 거부될 때 폴백으로 사용.
 */
export function copyBlobViaExecCommand(blob: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false)

    const url = URL.createObjectURL(blob)
    const img = document.createElement('img')
    img.src = url

    const cleanup = (container?: HTMLElement) => {
      try {
        if (container) document.body.removeChild(container)
      } catch {}
      URL.revokeObjectURL(url)
    }

    img.onload = () => {
      const container = document.createElement('div')
      container.contentEditable = 'true'
      container.style.position = 'fixed'
      container.style.left = '-9999px'
      container.style.top = '0'
      container.style.opacity = '0'
      container.appendChild(img)
      document.body.appendChild(container)

      const range = document.createRange()
      range.selectNode(img)
      const sel = window.getSelection()
      if (!sel) {
        cleanup(container)
        return resolve(false)
      }
      sel.removeAllRanges()
      sel.addRange(range)

      let success = false
      try {
        success = document.execCommand('copy')
      } catch {
        success = false
      }

      sel.removeAllRanges()
      cleanup(container)
      resolve(success)
    }

    img.onerror = () => {
      cleanup()
      resolve(false)
    }
  })
}

/**
 * 공문 미리보기를 이미지(PNG)로 클립보드에 복사.
 * 메신저/메일 등에 붙여넣기 가능.
 *
 * 두 단계 시도:
 *  1) "Promise<Blob>" 패턴 — Chrome 권장. 클릭 직후 clipboard.write 호출하고
 *     캔버스 렌더는 Promise 안에서 진행. user gesture 유지.
 *  2) 실패 시 — 캔버스를 먼저 만든 다음, 사용자에게 한 번 더 클릭 받지 않고
 *     동기적으로 ClipboardItem(Blob) 으로 재시도. (Chrome 일부 버전이
 *     Promise<Blob> 을 거부하는 케이스 보완)
 *
 * - HTTPS 또는 localhost(Chromium 기준)에서만 동작
 */
export function copyImageToClipboard(
  elementId = 'document-print-area',
  prerendered?: Promise<Blob> | null,
): Promise<CopyImageResult> {
  if (typeof window === 'undefined' || !navigator?.clipboard?.write || typeof ClipboardItem === 'undefined') {
    return Promise.resolve({ ok: false, reason: 'unsupported' })
  }

  // ── 1차 시도: Promise<Blob> 패턴 ─────────────────────────────
  let renderError: unknown = null
  let cachedBlob: Blob | null = null

  const sourcePromise: Promise<Blob> = prerendered ?? prerenderImage(elementId)
  const blobPromise = sourcePromise.then(
    (b) => { cachedBlob = b; return b },
    (e) => { renderError = e; throw e },
  )

  return navigator.clipboard
    .write([new ClipboardItem({ 'image/png': blobPromise })])
    .then<CopyImageResult>(() => ({ ok: true }))
    .catch(async (e: unknown): Promise<CopyImageResult> => {
      console.error('[Image clipboard write — 1차 실패]', e)

      // 캔버스 렌더 자체가 실패면 더 시도해도 의미 없음
      if (renderError) {
        return {
          ok: false,
          reason: 'render',
          error: renderError instanceof Error ? renderError.message : String(renderError),
        }
      }

      // ── 2차 시도: blob 이 이미 만들어졌다면 동기 ClipboardItem(Blob) 으로 재시도 ──
      // (일부 Chromium 버전이 Promise<Blob> 을 거부하는 회귀 버그 회피)
      if (cachedBlob && document.hasFocus()) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': cachedBlob })])
          return { ok: true }
        } catch (e2) {
          console.error('[Image clipboard write — 2차 실패]', e2)
          const err = e2 as Error
          if (err?.name === 'NotAllowedError') {
            return { ok: false, reason: 'permission', error: err.message }
          }
          return { ok: false, reason: 'unknown', error: err?.message || String(e2) }
        }
      }

      // 1차 실패 원인 분류
      const err = e as Error
      if (err?.name === 'NotAllowedError') {
        return { ok: false, reason: 'permission', error: err.message }
      }
      if (!document.hasFocus()) {
        return { ok: false, reason: 'permission', error: '문서가 포커스를 잃었습니다.' }
      }
      return { ok: false, reason: 'unknown', error: err?.message || String(e) }
    })
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
