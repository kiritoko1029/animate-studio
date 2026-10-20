import type { ReactNode } from 'react';
import type { HTMLMotionProps } from 'motion/react';
import { cn } from '@/lib/cn';
import { Button } from './primitives/buttons/button';
import { Fade, type FadeProps } from './primitives/effects/fade';
import {
  HighlightText as AnimateHighlightText,
  type HighlightTextProps as PrimitiveHighlightTextProps,
} from './primitives/texts/highlight';
import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionContent,
} from './primitives/radix/accordion';

/** Application wrappers around the official Animate UI registry primitives. */
export type AnimatedButtonProps = HTMLMotionProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  hoverScale?: number;
  tapScale?: number;
};

export function AnimatedButton({
  variant = 'primary',
  className,
  hoverScale = 1.025,
  tapScale = 0.97,
  type = 'button',
  ...props
}: AnimatedButtonProps) {
  return (
    <Button
      type={type}
      hoverScale={hoverScale}
      tapScale={tapScale}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-500 disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary' && 'bg-violet-600 text-white shadow-[0_4px_16px_#7c3aed25] hover:bg-violet-700',
        variant === 'secondary' && 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
        variant === 'ghost' && 'bg-transparent text-slate-700 hover:bg-slate-100',
        className,
      )}
      {...props}
    />
  );
}

export type HighlightTextProps = Omit<PrimitiveHighlightTextProps, 'text'> & {
  children?: string;
  text?: string;
  color?: string;
};

export function HighlightText({
  children,
  text,
  color = '#ddd6fe',
  style,
  ...props
}: HighlightTextProps) {
  return (
    <AnimateHighlightText
      text={text ?? children ?? ''}
      transition={{ duration: 1.1, ease: 'easeInOut' }}
      style={{
        backgroundImage: `linear-gradient(transparent 54%, ${color} 54%, ${color} 94%, transparent 94%)`,
        ...style,
      }}
      {...props}
    />
  );
}

/** delay is expressed in milliseconds, matching the upstream Fade API. */
export function FadeIn(props: FadeProps) {
  return <Fade {...props} />;
}

export type AnimatedAccordionItem = {
  id?: string;
  title: string;
  content: ReactNode;
};

export type AnimatedAccordionProps = {
  items: AnimatedAccordionItem[];
  defaultOpen?: boolean | string;
  className?: string;
};

export function AnimatedAccordion({ items, defaultOpen = true, className }: AnimatedAccordionProps) {
  const initialValue = typeof defaultOpen === 'string'
    ? defaultOpen
    : defaultOpen && items.length ? items[0].id ?? 'item-0' : undefined;

  return (
    <Accordion type="single" collapsible defaultValue={initialValue} className={cn('w-full', className)}>
      {items.map((item, index) => (
        <AccordionItem
          key={item.id ?? index}
          value={item.id ?? `item-${index}`}
          className="border-b border-slate-200 last:border-b-0"
        >
          <AccordionHeader className="m-0">
            <AccordionTrigger className="group flex w-full cursor-pointer items-center justify-between gap-4 bg-transparent py-4 text-left text-sm font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500">
              {item.title}
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-slate-400 transition-transform duration-300 group-data-[state=open]:rotate-180">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>
            <div className="pb-4 pr-5 text-sm leading-7 text-slate-500">{item.content}</div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export { Fade, Fades } from './primitives/effects/fade';
export { Button } from './primitives/buttons/button';
