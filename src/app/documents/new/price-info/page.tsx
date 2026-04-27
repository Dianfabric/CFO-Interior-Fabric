import { Suspense } from 'react'
import PriceInfoForm from './PriceInfoForm'

export default function PriceInfoPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-96 text-slate-400">불러오는 중...</div>}>
      <PriceInfoForm />
    </Suspense>
  )
}
