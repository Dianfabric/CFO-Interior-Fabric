'use client'

import { ReactNode } from 'react'

export interface DocumentHeaderInfo {
  documentNumber: string
  recipient: string
  ccLine?: string
  sender: string
  title: string
  issueDate?: string // YYYY. MM. DD.
}

export interface CompanyFooterInfo {
  name: string
  representative?: string | null
  businessNumber?: string | null
  address?: string | null
  phone?: string | null
  fax?: string | null
  email?: string | null
  website?: string | null
  logoPath?: string | null
  sealPath?: string | null
}

interface Props {
  header: DocumentHeaderInfo
  body: string // 본문 텍스트 (제목과 표 사이)
  bodyLineHeight?: number // 줄간격 (품목 수에 따라 자동 조정)
  table?: ReactNode // 표 (선택)
  footer: CompanyFooterInfo
}

/**
 * 미니멀 정장형 A4 공문 레이아웃.
 * 794px 너비 (A4 96dpi)로 고정. html2canvas 변환 시 그대로 PDF/JPG.
 */
export default function DocumentLayout({ header, body, bodyLineHeight = 1.9, table, footer }: Props) {
  const issueDate = header.issueDate || formatKoreanDate(new Date())

  return (
    <div
      id="document-print-area"
      className="document-paper"
      style={{
        width: 794,
        minHeight: 1123,
        background: '#ffffff',
        color: '#1a1a1a',
        fontFamily: '"Malgun Gothic", "맑은 고딕", -apple-system, BlinkMacSystemFont, sans-serif',
        padding: '84px 64px 0 64px',
        boxSizing: 'border-box',
        position: 'relative',
        fontSize: 13,
        lineHeight: 1.7,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ===== 상단 헤더 ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          {footer.logoPath ? (
            <img src={footer.logoPath} alt="logo" style={{ maxHeight: 56, maxWidth: 220, objectFit: 'contain' }} />
          ) : (
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 4, color: '#1a1a2e' }}>
              {footer.name || 'COMPANY'}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, color: '#666' }}>
          <div>문서번호 : <span style={{ color: '#1a1a2e', fontWeight: 600, letterSpacing: 1 }}>{header.documentNumber}</span></div>
          <div style={{ marginTop: 2 }}>발행일자 : {issueDate}</div>
        </div>
      </div>

      <div style={{ borderBottom: '2px solid #111', marginBottom: 16 }} />

      {/* ===== 수신/참조/발신 ===== */}
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 6 }}>
        <tbody>
          <tr>
            <td style={addressCellLabel}>수　　신</td>
            <td style={addressCellValue}>{header.recipient || '○○○ 귀하'}</td>
          </tr>
          {header.ccLine ? (
            <tr>
              <td style={addressCellLabel}>참　　조</td>
              <td style={addressCellValue}>{header.ccLine}</td>
            </tr>
          ) : null}
          <tr>
            <td style={addressCellLabel}>발　　신</td>
            <td style={addressCellValue}>{header.sender}</td>
          </tr>
        </tbody>
      </table>

      {/* ===== 제목 ===== */}
      <div style={{
        textAlign: 'center',
        fontSize: 20,
        fontWeight: 700,
        letterSpacing: 6,
        padding: '18px 0 14px 0',
        borderTop: '1px solid #111',
        borderBottom: '1px solid #111',
        margin: '4px 0 22px 0',
        color: '#111',
      }}>
        {header.title || '제　목'}
      </div>

      {/* ===== 본문 (제목과 표 사이) ===== */}
      {body ? (
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: bodyLineHeight, color: '#222', marginBottom: table ? 24 : 40 }}>
          {body}
        </div>
      ) : null}

      {/* ===== 표 ===== */}
      {table ? (
        <div style={{ marginBottom: 32 }}>{table}</div>
      ) : null}

      {/* ===== 스페이서: 남은 공간을 채워 footer를 항상 하단으로 ===== */}
      <div style={{ flex: 1 }} />

      {/* ===== 하단 회사정보 + 직인 ===== */}
      <div style={{ paddingBottom: 80 }}>
        <div style={{ borderTop: '1px solid #111', paddingTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 11, color: '#444', lineHeight: 1.7 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', letterSpacing: 2, marginBottom: 4 }}>
              {footer.name}
            </div>
            {footer.representative && (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                대표자 : {footer.representative}&nbsp;
                <span style={{ position: 'relative', display: 'inline-block', lineHeight: 1.4, overflow: 'visible' }}>
                  (인)
                  {footer.sealPath && (
                    <img
                      src={footer.sealPath}
                      alt="seal"
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 40,
                        height: 40,
                        maxWidth: 'none',   /* Tailwind preflight 덮어쓰기 */
                        objectFit: 'contain',
                        opacity: 0.95,
                        mixBlendMode: 'multiply',
                        pointerEvents: 'none',
                        zIndex: 10,
                      }}
                    />
                  )}
                </span>
              </div>
            )}
            {footer.businessNumber && <div>사업자등록번호 : {footer.businessNumber}</div>}
            {footer.address && <div>주소 : {footer.address}</div>}
            <div>
              {footer.phone && <span>TEL {footer.phone}</span>}
              {footer.phone && footer.fax && <span>　/　</span>}
              {footer.fax && <span>FAX {footer.fax}</span>}
            </div>
            <div>
              {footer.email && <span>{footer.email}</span>}
              {footer.email && footer.website && <span>　/　</span>}
              {footer.website && <span>{footer.website}</span>}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

const addressCellLabel: React.CSSProperties = {
  width: 72,
  padding: '4px 0',
  fontSize: 12,
  color: '#666',
  fontWeight: 600,
  letterSpacing: 2,
  verticalAlign: 'top',
}

const addressCellValue: React.CSSProperties = {
  padding: '4px 0',
  fontSize: 13,
  color: '#222',
  fontWeight: 500,
}

function formatKoreanDate(d: Date) {
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}.`
}
