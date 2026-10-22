import { officialClass } from '../lib/official-motion';
import { ChevronDown } from 'lucide-react';
import * as Accordion from '@animate-ui/react/primitives/radix-ui/accordion';
import type { Block } from '../model';
import { motionProps } from '../lib/official-motion';
import { useBlockValue } from './NativeInteractions';

export function CatalogAccordion({block,interactive}:{block:Block;interactive:boolean}) {
 const [index,setIndex]=useBlockValue(block.props.value ?? 0);
 const [values,setValues]=useBlockValue<string[]>([]);
 const settings=motionProps<typeof Accordion.Root>(block,'Accordion');
 const {type:mode,...rootProps}=settings;
 const items=(block.props.items || '').split('\n').filter(Boolean).map(row=>row.split('|'));
 const children=items.map(([title,...text],i)=><Accordion.Item {...motionProps<typeof Accordion.Item>(block,'AccordionItem')} key={i} value={`item-${i}`} className={officialClass("native-accordion-item", (motionProps<typeof Accordion.Item>(block,'AccordionItem')).className)}><Accordion.Header><Accordion.Trigger {...motionProps<typeof Accordion.Trigger>(block,'AccordionTrigger')} className={officialClass("native-accordion-trigger", (motionProps<typeof Accordion.Trigger>(block,'AccordionTrigger')).className)} disabled={!interactive || motionProps<typeof Accordion.Trigger>(block,'AccordionTrigger').disabled}>{title}<ChevronDown size={16}/></Accordion.Trigger></Accordion.Header><Accordion.Content {...motionProps<typeof Accordion.Content>(block,'AccordionContent')} className={officialClass("native-accordion-content", (motionProps<typeof Accordion.Content>(block,'AccordionContent')).className)}><p>{text.join('|')}</p></Accordion.Content></Accordion.Item>);
 return mode==='multiple' ? <Accordion.Root {...rootProps} type="multiple" value={values} onValueChange={setValues}>{children}</Accordion.Root> : <Accordion.Root {...rootProps} type="single" collapsible={(rootProps as {collapsible?:boolean}).collapsible ?? true} value={index < 0 ? '' : `item-${index}`} onValueChange={v=>setIndex(v ? Number(v.slice(5)) : -1)}>{children}</Accordion.Root>;
}
