import { usePageImage } from './PageAssets';
import { motionProps } from '../lib/official-motion';
import { useId, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Quote, Star, TrendingUp } from 'lucide-react';
import { safeUrl, type Block, type BlockProps } from '../model';
import { navigate } from '../lib/navigation';
import { AnimatedButton } from './animate-ui';
import '../library-blocks.css';
import { Root as Pagination } from '@animate-ui/react/primitives/pagination';
import * as Checkbox from '@animate-ui/react/primitives/radix-ui/checkbox';
import * as RadioGroup from '@animate-ui/react/primitives/radix-ui/radio-group';
import * as Slider from '@animate-ui/react/primitives/radix-ui/slider';
import * as Progress from '@animate-ui/react/primitives/radix-ui/progress';
import * as Select from '@animate-ui/react/primitives/radix-ui/select';
import { useBlockValue } from './NativeInteractions';

function rows(items = '') {
  return items.split('\n').map(line => line.trim()).filter(Boolean).map(line => line.split('|').map(cell => cell.trim()));
}

function Avatar({ name = '', imageUrl = '', radius = 28 }: { name?: string; imageUrl?: string; radius?: number }) {
  const [failed, setFailed] = useState(false);
  const url = usePageImage(imageUrl);
  return <span className="page-avatar" style={{ borderRadius: radius }}>
    {url !== '#' && !failed
      ? <img src={url} alt={name ? `${name}的头像` : '头像'} onError={() => setFailed(true)} />
      : <span aria-hidden="true">{Array.from(name.trim() || '我').slice(0, 2).join('')}</span>}
  </span>;
}

function SliderBlock({ props: p, interactive }: { props: BlockProps; interactive: boolean }) {
  const id = useId();
  const max = p.max ?? 100;
  const [value, setValue] = useBlockValue(Math.min(max, p.value ?? 60));
  return <div className="page-slider-field">
    <div className="page-field-heading"><label htmlFor={id}>{p.label || '数值'}</label><output htmlFor={id}>{value}<small> / {max}</small></output></div>
    <Slider.Root className="native-page-slider" min={0} max={max} step={1} value={[value]} disabled={!interactive} onValueChange={values => setValue(values[0])}><Slider.Track className="native-page-slider-track"><Slider.Range className="native-page-slider-range" /></Slider.Track><Slider.Thumb className="native-page-slider-thumb" id={id} aria-label={p.label || '数值'} aria-describedby={p.text ? `${id}-hint` : undefined} /></Slider.Root>
    {p.text && <p className="page-detail" id={`${id}-hint`}>{p.text}</p>}
  </div>;
}

function PaginationBlock({ props: p, interactive }: { props: BlockProps; interactive: boolean }) {
  const total = Math.max(1, Math.min(100, Math.round(p.max ?? 5)));
  const [current, setCurrent] = useBlockValue(Math.max(1, Math.min(total, Math.round(p.value ?? 1))));
  const visible = Array.from(new Set([1, total, current - 1, current, current + 1].filter(n => n >= 1 && n <= total))).sort((a, b) => a - b);
  const pages = total <= 7 ? Array.from({ length: total }, (_, i) => i + 1) : visible;
  return <Pagination className="page-pagination" aria-label={p.label || '分页'}>
    <div className="page-pagination-buttons">
      <button type="button" aria-label="上一页" disabled={!interactive || current === 1} onClick={() => setCurrent(n => n - 1)}><ChevronLeft size={16} /></button>
      {pages.map((page, index) => <span className="page-pagination-item" key={page}>
        {index > 0 && page - pages[index - 1] > 1 && <span className="page-pagination-gap" aria-hidden="true">…</span>}
        <button type="button" aria-label={`第 ${page} 页`} aria-current={page === current ? 'page' : undefined} disabled={!interactive} onClick={() => setCurrent(page)}>{page}</button>
      </span>)}
      <button type="button" aria-label="下一页" disabled={!interactive || current === total} onClick={() => setCurrent(n => n + 1)}><ChevronRight size={16} /></button>
    </div>
    <p className="page-detail" aria-live="polite">{p.label ? `${p.label} · ` : ''}第 {current} / {total} 页</p>
  </Pagination>;
}

function RatingBlock({ props: p, interactive }: { props: BlockProps; interactive: boolean }) {
  const id = useId();
  const [value, setValue] = useBlockValue(Math.max(0, Math.min(5, Math.round(p.value ?? 4))));
  return <fieldset className="page-rating" disabled={!interactive} aria-describedby={p.text ? `${id}-hint` : undefined}>
    <legend>{p.label || '评分'}</legend>
    <div className="page-rating-stars">
      {[1, 2, 3, 4, 5].map(star => <label key={star} className={`page-rating-star ${star <= value ? 'is-filled' : ''}`}>
        <input type="radio" name={id} value={star} checked={value === star} onChange={() => setValue(star)} aria-label={`${star} 星`} />
        <Star size={28} strokeWidth={1.5} aria-hidden="true" />
      </label>)}
      <output aria-live="polite">{value} / 5</output>
    </div>
    {p.text && <p className="page-detail" id={`${id}-hint`}>{p.text}</p>}
  </fieldset>;
}

/** Additional library components share the page theme and editor's inert preview. */
export function LibraryBlock({ block, interactive }: { block: Block; interactive: boolean }) {
  const id = useId();
  const p = block.props;
  const [inputValue, setInputValue] = useBlockValue<string>('');
  const [checked, setChecked] = useBlockValue(p.checked ?? false, 'checked');
  const [index, setIndex] = useBlockValue(p.value ?? 0);
  switch (block.type) {
    case 'textarea': return <label className="page-input-label">{p.label}<textarea className="page-input page-textarea" placeholder={p.text} value={inputValue} onChange={event => setInputValue(event.target.value)} rows={4} disabled={!interactive} style={{ borderRadius: p.radius }} /></label>;
    case 'select': return <label className="page-input-label">{p.label}<Select.Root disabled={!interactive} value={inputValue} onValueChange={setInputValue}><Select.Trigger className="page-input native-page-select" style={{ borderRadius: p.radius }} aria-label={p.label}><Select.Value placeholder={p.text || '请选择'} /><Select.Icon>⌄</Select.Icon></Select.Trigger><Select.Portal><Select.Content className="native-page-select-content" {...motionProps<typeof Select.Content>(block, 'SelectContent')}><Select.Viewport>{rows(p.items).map(([title], i) => <Select.Item className="native-page-select-item" value={`option-${i}`} key={i}><Select.ItemText>{title}</Select.ItemText><Select.ItemIndicator><Check size={14}/></Select.ItemIndicator></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root></label>;
    case 'checkbox': return <div className="page-choice"><Checkbox.Root className="native-page-checkbox" id={id} checked={checked} onCheckedChange={value => setChecked(value === true)} disabled={!interactive} aria-describedby={p.text ? `${id}-hint` : undefined}><Checkbox.Indicator><Check size={13}/></Checkbox.Indicator></Checkbox.Root><div><label htmlFor={id}>{p.label}</label>{p.text && <p className="page-detail" id={`${id}-hint`}>{p.text}</p>}</div></div>;
    case 'radio': return <RadioGroup.Root className="page-radio-group" disabled={!interactive} value={String(index)} onValueChange={value => setIndex(Number(value))} aria-label={p.label || '选择选项'}><strong>{p.label || '选择选项'}</strong>{rows(p.items).map(([title, text], i) => <div className="page-choice page-radio-option" key={i}><RadioGroup.Item className="native-page-radio" id={`${id}-${i}`} value={String(i)} aria-describedby={text ? `${id}-${i}-hint` : undefined}><RadioGroup.Indicator className="native-page-radio-indicator" /></RadioGroup.Item><div><label htmlFor={`${id}-${i}`}>{title}</label>{text && <p className="page-detail" id={`${id}-${i}-hint`}>{text}</p>}</div></div>)}</RadioGroup.Root>;
    case 'slider': return <SliderBlock props={p} interactive={interactive} />;
    case 'avatar': return <div className="page-avatar-row"><Avatar key={p.imageUrl} name={p.title} imageUrl={p.imageUrl} radius={p.radius} /><div><strong>{p.title}</strong>{p.text && <p className="page-detail">{p.text}</p>}</div></div>;
    case 'progress': {
      const max = p.max ?? 100;
      const value = Math.min(max, p.value ?? 72);
      return <div className="page-progress-field"><div className="page-field-heading"><label htmlFor={id}>{p.label || '进度'}</label><span>{Math.round(value / max * 100)}%</span></div><Progress.Root className="native-page-progress" id={id} max={max} value={value} aria-label={p.label || '进度'}><Progress.Indicator className="native-page-progress-indicator" style={{ transform: `translateX(-${100 - value / max * 100}%)` }} /></Progress.Root>{p.text && <p className="page-detail">{p.text}</p>}</div>;
    }
    case 'statistic': return <article className="page-statistic"><div className="page-statistic-heading"><h3>{p.title}</h3><span className="page-statistic-icon"><TrendingUp size={19} aria-hidden="true" /></span></div><p className="page-statistic-value">{p.text}</p>{p.label && <span className="page-statistic-change">{p.label}</span>}</article>;
    case 'table': {
      const [headers = [], ...body] = rows(p.items);
      return <div className="page-table-scroll" tabIndex={interactive ? 0 : -1} role="region" aria-label={p.title || '数据表格'}><table className="page-data-table" style={{ borderRadius: p.radius }}>{p.title && <caption>{p.title}</caption>}<thead><tr>{headers.map((header, i) => <th key={i} scope="col">{header}</th>)}</tr></thead><tbody>{body.map((row, i) => <tr key={i}>{headers.map((_, j) => <td key={j}>{row[j] || '—'}</td>)}</tr>)}</tbody></table>{headers.length === 0 && <p className="page-detail">暂无数据</p>}</div>;
    }
    case 'timeline': return <section className="page-timeline-section">{p.title && <h3 className="page-library-title">{p.title}</h3>}<ol className="page-timeline">{rows(p.items).map(([title, text, date], i) => <li key={i}><span className="page-timeline-dot" aria-hidden="true" /><div className="page-timeline-heading"><strong>{title}</strong>{date && <span>{date}</span>}</div>{text && <p className="page-detail">{text}</p>}</li>)}</ol></section>;
    case 'testimonial': return <figure className="page-testimonial"><Quote size={25} aria-hidden="true" /><blockquote>{p.text}</blockquote><figcaption><Avatar name={p.title} /><div><strong>{p.title}</strong><p className="page-detail">{p.label}</p></div></figcaption></figure>;
    case 'pricing': return <article className="page-pricing"><span className="page-badge">{p.title}</span><p className="page-pricing-price">{p.variant}</p><p className="page-detail">{p.text}</p><ul>{rows(p.items).map(([item], i) => <li key={i}><Check size={16} aria-hidden="true" />{item}</li>)}</ul><AnimatedButton className="page-button page-button--primary" disabled={!interactive} onClick={event => navigate(event, p.url)}>{p.label || '选择方案'}<ArrowRight size={15} aria-hidden="true" /></AnimatedButton></article>;
    case 'breadcrumb': {
      const items = rows(p.items);
      return <nav className="page-breadcrumb" aria-label="面包屑"><ol>{items.map(([title, url], i) => <li key={i}>{i > 0 && <ChevronRight size={13} aria-hidden="true" />}{i === items.length - 1 ? <span aria-current="page">{title}</span> : <a href={safeUrl(url)} tabIndex={interactive ? 0 : -1} onClick={event => navigate(event, url)}>{title}</a>}</li>)}</ol></nav>;
    }
    case 'pagination': return <PaginationBlock props={p} interactive={interactive} />;
    case 'rating': return <RatingBlock props={p} interactive={interactive} />;
    default: return null;
  }
}
