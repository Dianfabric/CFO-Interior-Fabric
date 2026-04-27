import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })

const TYPE_GUIDES: Record<string, string> = {
  PRICE_CHANGE: `유형: 거래처 단가 인상/인하 안내 공문.
- 인사 → 감사 → 배경 설명 → 자체 흡수 노력(있다면) → 부득이한 결정 → 적용 시점 → 협조 요청 → 마무리 인사 흐름.
- 거래처가 결정을 받아들이도록 정중하면서도 단호한 톤.`,
  HOLIDAY: `유형: 휴무 안내 공문.
- 인사 → 휴무 사유와 기간 명시 → 업무 재개일 → 긴급 연락처(있다면) → 양해 요청 → 마무리.
- 간결하고 명료한 톤.`,
  PAYMENT_REQUEST: `유형: 결제(입금) 요청 공문.
- 인사 → 미수 사실 환기 → 금액과 기일 → 입금 협조 요청 → 향후 거래의 신뢰 강조 → 마무리.
- 거래관계를 해치지 않으면서도 단호한 톤.`,
  PRICE_INFO: `유형: 단가 안내 공문.
- 인사 → 거래 감사 → 단가표 참조 안내 → 적용 기간 → 문의 안내 → 마무리.
- 객관적이고 깔끔한 톤.`,
}

export async function POST(request: NextRequest) {
  try {
    const { type, recipientName, keywords, currentBody } = await request.json()

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        text: '⚠️ ANTHROPIC_API_KEY가 설정되지 않았습니다.',
      }, { status: 200 })
    }

    const guide = TYPE_GUIDES[type] || TYPE_GUIDES.PRICE_CHANGE

    const systemPrompt = `당신은 한국 B2B 거래에서 사용하는 공문(공식 서한)의 본문을 작성하는 전문가입니다.

작성 규칙:
1. 한국어, 정중하고 격식 있는 비즈니스 문어체
2. 각 문장은 짧고 강렬한 경구 같은 느낌으로. 두루뭉술한 인사치레 금지
3. 번호 매김 (1. 2. 3. ...) 으로 단락 구분
4. 사실 → 배경 → 결정 → 협조 요청 순으로 논리적 흐름
5. 감정에 호소하되 과장하지 말 것 (파트너십, 신뢰, 양해, 협조 같은 단어는 진정성 있게)
6. 영업 톤이나 사과 톤이 아니라 동등한 파트너의 톤
7. 첫 문장은 보통 "귀사의 무궁한 발전을 기원합니다." 같은 인사
8. 마지막 문장은 보통 감사와 문의 안내
9. 문장 수는 자유롭게. 필요한 만큼만. 보통 5~9개.
10. 출력은 본문 텍스트만. 제목/서명/표는 절대 포함하지 말 것.

${guide}`

    const userPrompt = `수신: ${recipientName || '○○○ 귀하'}
키워드 / 상황 설명:
${keywords || '(없음)'}

${currentBody ? `현재 작성된 본문(수정해야 함):\n${currentBody}\n\n위 본문을 키워드와 상황에 맞게 다듬어 주세요. 기존 톤을 유지하되 더 명료하고 강렬하게.` : '위 정보를 바탕으로 공문 본문을 작성해 주세요.'}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    return NextResponse.json({ text: textBlock?.text || '' })
  } catch (error) {
    console.error('ai-draft Error:', error)
    return NextResponse.json({ error: 'Failed', text: '' }, { status: 500 })
  }
}
