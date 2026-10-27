import { useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { StudioButton } from './StudioUI';
import { MediaLibraryDialog } from './MediaLibraryDialog';
import { t } from '../i18n';

export function MediaField({ label, ariaLabel, value, onChange, onCommit, hint }: { label: string; ariaLabel?: string; value: string; onChange: (value: string) => void; onCommit?: (value: string) => void; hint?: string }) {
  const [open, setOpen] = useState(false);
  return <div className="field media-field"><span className="field-label">{label}</span><div className="media-field-input"><input aria-label={ariaLabel ?? label} value={value} maxLength={2048} placeholder="https://example.com/image.png" onChange={event => onChange(event.target.value)} onBlur={() => onCommit?.(value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onCommit?.(value); } }}/><StudioButton aria-label={t('从媒体库选择图片')} onClick={() => setOpen(true)}><ImagePlus size={14}/><span>{t('选择图片')}</span></StudioButton></div>{hint && <span className="field-hint">{hint}</span>}{open && <MediaLibraryDialog onClose={() => setOpen(false)} onSelect={value => { onChange(value); onCommit?.(value); setOpen(false); }}/>}</div>;
}
