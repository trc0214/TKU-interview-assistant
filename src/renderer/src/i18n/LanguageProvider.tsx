import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export type LangType = 'zh' | 'en'

interface LanguageContextProps {
  lang: LangType
  setLang: (lang: LangType) => void
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<LangType>(() => {
    const saved = window.localStorage.getItem('app-language')
    return saved === 'en' ? 'en' : 'zh'
  })

  useEffect(() => {
    window.localStorage.setItem('app-language', lang)
    document.documentElement.lang = lang === 'zh' ? 'zh-TW' : 'en'
  }, [lang])

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
