import { Check, Languages } from 'lucide-react';
import { setLocale, type Locale } from '../i18n';
import { useLocale } from '../i18n/react';
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuItemIndicator } from './animate-ui/components/radix/dropdown-menu';

const languages: { value: Locale; label: string }[] = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: 'English' },
];

export function LanguageMenuItems() {
  const locale = useLocale();
  return <>
    <DropdownMenuLabel><Languages size={13} aria-hidden="true"/>语言 / Language</DropdownMenuLabel>
    <DropdownMenuRadioGroup aria-label="语言 / Language" value={locale} onValueChange={value => setLocale(value as Locale)}>
      {languages.map(language => <DropdownMenuRadioItem key={language.value} value={language.value} lang={language.value}>
        {language.label}
        <span className="language-check"><DropdownMenuItemIndicator><Check size={14} aria-hidden="true"/></DropdownMenuItemIndicator></span>
      </DropdownMenuRadioItem>)}
    </DropdownMenuRadioGroup>
  </>;
}
