'use client'

import { useCallback, useRef, useState } from 'react'

// GIS 전역 타입 선언
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (resp: { access_token?: string; error?: string }) => void
          }): { requestAccessToken(): void }
        }
      }
    }
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const TOKEN_TTL_MS = 55 * 60 * 1000 // 55분 (구글 토큰 만료 1시간보다 여유 있게)

/**
 * Google Identity Services 기반 Drive 토큰 관리 훅
 *
 * getToken() → Promise<string>
 *  - 유효한 토큰이 있으면 즉시 반환
 *  - 없으면 OAuth 팝업을 띄워 토큰을 획득
 *  - 버튼 클릭 핸들러 내부(user gesture)에서 호출해야 팝업 차단 방지
 */
export function useGoogleDrive() {
  const [token, setToken] = useState<string | null>(null)
  const tokenRef = useRef<string | null>(null)
  const tokenClientRef = useRef<{ requestAccessToken(): void } | null>(null)
  const resolveRef = useRef<((t: string) => void) | null>(null)
  const rejectRef = useRef<((e: Error) => void) | null>(null)
  const expiryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearToken = useCallback(() => {
    tokenRef.current = null
    tokenClientRef.current = null
    setToken(null)
  }, [])

  const getToken = useCallback((): Promise<string> => {
    // 유효한 토큰이 이미 있으면 재사용
    if (tokenRef.current) return Promise.resolve(tokenRef.current)

    return new Promise<string>((resolve, reject) => {
      if (!window.google?.accounts?.oauth2) {
        reject(new Error('Google Identity Services 스크립트가 로드되지 않았습니다.'))
        return
      }

      // 이전 pending 콜백 교체 (중복 호출 방어)
      resolveRef.current = resolve
      rejectRef.current = reject

      if (!tokenClientRef.current) {
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          callback: (resp) => {
            if (resp.error || !resp.access_token) {
              rejectRef.current?.(new Error(resp.error ?? '토큰 획득 실패'))
              resolveRef.current = null
              rejectRef.current = null
              return
            }

            tokenRef.current = resp.access_token
            setToken(resp.access_token)
            resolveRef.current?.(resp.access_token)
            resolveRef.current = null
            rejectRef.current = null

            // 만료 타이머
            if (expiryRef.current) clearTimeout(expiryRef.current)
            expiryRef.current = setTimeout(clearToken, TOKEN_TTL_MS)
          },
        })
      }

      tokenClientRef.current.requestAccessToken()
    })
  }, [clearToken])

  return { token, getToken }
}
