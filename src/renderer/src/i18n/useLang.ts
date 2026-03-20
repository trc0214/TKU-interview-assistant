import { useLanguage } from './LanguageProvider'
import { lang } from './lang'

export function useLang() {
  const { lang: currentLang } = useLanguage()
  return lang[currentLang] as typeof lang.zh
}
