import { Suspense } from 'react'
import PriceChangeForm from './PriceChangeForm'

export default function PriceChangePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-96 text-slate-400">
        불러오는 중...
      </div>
    }>
      <PriceChangeForm />
    </Suspense>
  )
}
