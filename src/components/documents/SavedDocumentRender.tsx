'use client'

import DocumentLayout from './DocumentLayout'
import PriceChangeTable, { PriceRow } from './PriceChangeTable'
import PriceChangeRangeTable from './PriceChangeRangeTable'
import PriceInfoTable, { PriceInfoRow, DisplayUnit, OptionMode } from './PriceInfoTable'

export interface SavedDoc {
  id: string
  documentNumber: string
  type: string
  title: string
  recipientName: string
  ccLine: string | null
  senderLine: string
  bodyText: string
  tableJson: string | null
  metaJson: string | null
  createdAt: string
}

export interface CompanyProfileLite {
  name?: string
  representative?: string
  businessNumber?: string
  address?: string
  phone?: string
  fax?: string
  email?: string
  website?: string
  logoPath?: string
  sealPath?: string
}

interface Props {
  doc: SavedDoc
  profile: CompanyProfileLite | null
}

function safeJSON<T>(s: string | null): T | null {
  if (!s) return null
  try { return JSON.parse(s) as T } catch { return null }
}

/** 저장된 공문(Saved doc)을 DocumentLayout으로 그대로 재현. */
export default function SavedDocumentRender({ doc, profile }: Props) {
  const tableData = safeJSON<unknown[]>(doc.tableJson)
  const metaData = safeJSON<Record<string, unknown>>(doc.metaJson) ?? {}

  let tableNode: React.ReactNode = null
  if (doc.type === 'PRICE_CHANGE' && Array.isArray(tableData)) {
    const direction = (metaData.direction as 'UP' | 'DOWN') || 'UP'
    const effectiveDate = (metaData.effectiveDate as string) || undefined
    const rangeUnit = (metaData.rangeUnit as 'PERCENT' | 'AMOUNT') || 'PERCENT'
    const rangeMin = Number(metaData.rangeMin ?? 0)
    const rangeMax = Number(metaData.rangeMax ?? 0)
    const showItemTable = metaData.showItemTable !== undefined
      ? !!metaData.showItemTable
      : tableData.length > 0
    const showRangeTable = metaData.showRangeTable !== undefined
      ? !!metaData.showRangeTable
      : tableData.length === 0
    tableNode = (
      <>
        {showRangeTable && (
          <PriceChangeRangeTable
            min={rangeMin} max={rangeMax}
            unit={rangeUnit} direction={direction}
            effectiveDate={showItemTable ? undefined : effectiveDate}
            note={(metaData.rangeNote as string) || undefined}
          />
        )}
        {showRangeTable && showItemTable && <div style={{ height: 18 }} />}
        {showItemTable && tableData.length > 0 && (
          <PriceChangeTable
            rows={tableData as PriceRow[]}
            direction={direction}
            effectiveDate={effectiveDate}
            vipName={(metaData.vipName as string) || undefined}
            recipientName={doc.recipientName}
          />
        )}
      </>
    )
  } else if (doc.type === 'PRICE_INFO' && Array.isArray(tableData)) {
    tableNode = (
      <PriceInfoTable
        rows={tableData as PriceInfoRow[]}
        unit={(metaData.displayUnit as DisplayUnit) || 'YARD'}
        optionMode={(metaData.optionMode as OptionMode) || 'PERCENT'}
        showDiscount={!!metaData.showDiscount}
        showDealer={!!metaData.showDealer}
        showRoll={!!metaData.showRoll}
        showBulk1={!!metaData.showBulk1}
        showBulk2={!!metaData.showBulk2}
        effectiveDate={(metaData.effectiveDate as string) || undefined}
        issueDate={(metaData.issueDate as string) || undefined}
        note={(metaData.tableNote as string) || undefined}
        recipientName={doc.recipientName}
      />
    )
  }

  const issueDateRaw = (metaData.issueDate as string) || ''
  const issueDateDisplay = issueDateRaw
    ? issueDateRaw.replace(/-/g, '. ') + '.'
    : new Date(doc.createdAt).toLocaleDateString('ko-KR').replace(/\./g, '. ').trim() + '.'

  return (
    <DocumentLayout
      header={{
        documentNumber: doc.documentNumber,
        recipient: doc.recipientName,
        ccLine: doc.ccLine || undefined,
        sender: doc.senderLine,
        title: doc.title,
        issueDate: issueDateDisplay,
      }}
      body={doc.bodyText}
      table={tableNode}
      footer={{
        name: profile?.name || '회사명을 설정에서 입력하세요',
        representative: profile?.representative,
        businessNumber: profile?.businessNumber,
        address: profile?.address,
        phone: profile?.phone,
        fax: profile?.fax,
        email: profile?.email,
        website: profile?.website,
        logoPath: profile?.logoPath,
        sealPath: profile?.sealPath,
      }}
    />
  )
}
