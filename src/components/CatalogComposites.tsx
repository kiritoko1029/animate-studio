import { useId, useState } from 'react';
import { Check, Copy, PanelLeft, PanelLeftClose, Circle } from 'lucide-react';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { CopyButton, CopyButtonIcon } from '@animate-ui/react/primitives/buttons/copy';
import { CodeBlock } from './animate-ui/registry/code-block';
import { PinnedList, PinnedListPinned, PinnedListUnpinned, PinnedListItems, PinnedListItem, PinnedListTrigger } from '@animate-ui/react/primitives/pinned-list';
import * as Sidebar from '@animate-ui/react/primitives/sidebar';
import { Combobox } from '@animate-ui/react/primitives/base-ui/combobox';
import { Toast } from '@animate-ui/react/primitives/base-ui/toast';
import { Questionnaire } from '@animate-ui/react/primitives/questionnaire';
import { ScrollProgress, ScrollProgressContainer, ScrollProgressProvider } from '@animate-ui/react/primitives/scroll-progress';
import { PageScrollProgress } from './PageScrollProgress';
import { safeUrl, type Block, type ExtendedComponentType } from '../model';
import { useBlockValue } from './NativeInteractions';
import { motionProps } from '../lib/official-motion';
import OfficialMotionGrid from './OfficialMotionGrid';

function ToastExample({ block }: { block: Block }) {
  const manager = Toast.useToastManager();
  return <><Button className="as-page-catalog-button" onClick={() => manager.add({title:block.props.title,description:block.props.text})}>{block.props.label || '显示通知'}</Button><Toast.Portal><Toast.Viewport className="native-toast-viewport">{manager.toasts.map(item => <Toast.Root key={item.id} toast={item} className="native-toast"><Toast.Content className="native-toast-content"><div><Toast.Title/><Toast.Description/></div><Toast.Close aria-label="关闭通知" className="as-page-catalog-button">×</Toast.Close></Toast.Content></Toast.Root>)}</Toast.Viewport></Toast.Portal></>;
}

function ScrollExample({ block }: { block: Block }) {
  const props = motionProps<typeof ScrollProgressProvider>(block,'ScrollProgressProvider');
  const horizontal = props.direction === 'horizontal';
  if (props.global) return <PageScrollProgress label={block.props.title || '阅读进度'} direction={props.direction}/>;
  return <div className="native-scroll-example"><ScrollProgressProvider {...props}><div className="native-scroll-example-bar"><ScrollProgress className="native-scroll-example-fill"/></div><ScrollProgressContainer className="native-scroll-example-container" style={{overflowX:horizontal?'auto':'hidden',overflowY:horizontal?'hidden':'auto'}}><div style={{display:'flex',flexDirection:horizontal?'row':'column'}}>{Array.from({length:5},(_,i)=><div key={i} className="native-scroll-example-panel">{i===0 ? <p>{block.props.text || '滚动此区域，查看进度'} <span aria-hidden="true">{horizontal?'→':'↓'}</span></p> : i%2 ? <div/> : null}</div>)}</div></ScrollProgressContainer></ScrollProgressProvider></div>;
}

/** Each catalog entry uses its own upstream primitive and motion lifecycle. */
export function CatalogComposites({ block }: { block: Block & { type: ExtendedComponentType } }) {
  const { type, props: p } = block;
  const id = useId();
  const [value, setValue] = useBlockValue<string>('');
  const [checked, setChecked] = useBlockValue(p.checked ?? true, 'checked');
  const [step, setStep] = useBlockValue(p.value ?? 0);
  const [submitted, setSubmitted] = useState(false);
  const [pins, setPins] = useState<string[]>([]);
  const options = (p.items || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => line.split('|').map(cell => cell.trim()));
  const buttonClass = 'as-page-catalog-button';
  const shell = (children: React.ReactNode) => <div className={`as-page-catalog native-catalog native-catalog--${type}`} data-animate-ui="v2-composition">{children}</div>;
  switch (type) {
    case 'sidebar': return shell(<Sidebar.Provider open={checked} onOpenChange={setChecked} {...motionProps<typeof Sidebar.Provider>(block,'SidebarProvider')}><Button className={buttonClass} onClick={() => setChecked(!checked)} aria-expanded={checked}><Sidebar.TriggerIcon open={<PanelLeftClose size={16}/>} closed={<PanelLeft size={16}/>}/>{p.label || '展开导航'}</Button><Sidebar.Container className="native-sidebar-container" style={{width:checked?'100%':48}} data-state={checked?'expanded':'collapsed'}><nav aria-label={p.title || '侧栏导航'}><h3 data-sidebar="group-label" style={{opacity:checked?1:0}}>{p.title}</h3><Sidebar.Highlight className="native-sidebar-highlight">{options.map(([name,url],index)=><a key={index} data-sidebar="menu-button" href={safeUrl(url)} title={name}><Circle size={16}/><span style={{display:checked?'inline':undefined}}>{name}</span></a>)}</Sidebar.Highlight></nav></Sidebar.Container></Sidebar.Provider>);
    case 'combobox': return shell(<Combobox.Root items={options.map(([name])=>name)} value={value || null} onValueChange={next=>setValue(next ?? '')}><label className="as-page-input-label">{p.label}<Combobox.Input className="as-page-input" placeholder={p.text} aria-label={p.label}/></label><Combobox.Portal><Combobox.Positioner {...motionProps<typeof Combobox.Positioner>(block,'ComboboxContent')} className="native-menubar-positioner"><Combobox.Popup className="as-page-catalog-popup native-catalog-popup"><Combobox.Empty>没有匹配选项</Combobox.Empty><Combobox.List>{(name:string)=><Combobox.Item key={name} value={name} className="native-combobox-option"><Combobox.ItemIndicator/><span>{name}</span></Combobox.Item>}</Combobox.List></Combobox.Popup></Combobox.Positioner></Combobox.Portal></Combobox.Root>);
    case 'toast': return shell(<Toast.Provider {...motionProps<typeof Toast.Provider>(block,'Toaster')}><ToastExample block={block}/></Toast.Provider>);
    case 'questionnaire': {
      const questions = options.map(([title,choices],i)=>({name:`question-${i}`,title,required:true,choices:choices ? choices.split(',').filter(Boolean).map(value=>({value})) : undefined}));
      return shell(<><h3>{p.title}</h3>{submitted ? <p role="status">{p.text || '感谢你的回答！'}</p> : <Questionnaire.Root className="native-questionnaire" items={questions} item={questions[step]?.name ?? questions[0]?.name} onItemChange={name=>setStep(questions.findIndex(q=>q.name===name))} shortcuts="letters" onSubmit={event=>{event.preventDefault();setSubmitted(true);setStep(questions.length);}}><Questionnaire.Progress/>{questions.map(question=><Questionnaire.Item className="native-catalog-question" key={question.name} name={question.name} required><Questionnaire.Title>{question.title}</Questionnaire.Title><Questionnaire.Choices>{question.choices?.map(({value})=><Questionnaire.Choice className="native-question-choice" key={value} value={value}><Questionnaire.ChoiceInput/><span data-slot="questionnaire-choice-indicator"><span data-slot="questionnaire-choice-indicator-dot"/></span><Questionnaire.ChoiceLabel>{value}</Questionnaire.ChoiceLabel><Questionnaire.ChoiceShortcut/></Questionnaire.Choice>) ?? <Questionnaire.Input className="as-page-input" aria-label={question.title}/>}</Questionnaire.Choices><Questionnaire.Error>请先填写此题</Questionnaire.Error></Questionnaire.Item>)}<div className="as-page-catalog-actions"><Questionnaire.Previous className={buttonClass}>上一题</Questionnaire.Previous><Questionnaire.Next className={buttonClass}>下一题</Questionnaire.Next><Questionnaire.Submit className={buttonClass}>{p.label || '提交'}</Questionnaire.Submit></div></Questionnaire.Root>}</>);
    }
    case 'codeBlock': return shell(<><header className="native-code-heading"><span>{p.title || '代码'}</span><CopyButton content={p.text || ''} className={buttonClass}><CopyButtonIcon icon={<Copy size={14}/>} copiedIcon={<Check size={14}/>} />{p.label || '复制代码'}</CopyButton></header><CodeBlock {...motionProps<typeof CodeBlock>(block,'CodeBlock')} copyButton={false} code={p.text || ''} lang="javascript" className="native-code-block" /></>);
    case 'motionGrid': return shell(<OfficialMotionGrid block={block}/>);
    case 'pinnedList': return shell(<><h3>{p.title}</h3><PinnedList onPinnedChange={item => setPins(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item])}>{[true, false].map(pinned => {
      const Group = pinned ? PinnedListPinned : PinnedListUnpinned;
      return <Group key={String(pinned)}><h4>{pinned ? '置顶' : '全部'}</h4><PinnedListItems>{options.map(([name], index) => pins.includes(`${id}-${index}`) === pinned && <PinnedListItem id={`${id}-${index}`} key={index} customTrigger className="as-page-catalog-pinned-row">{name}<PinnedListTrigger aria-label={`${pinned ? '取消置顶' : '置顶'} ${name}`}>{pinned ? '●' : '⌖'}</PinnedListTrigger></PinnedListItem>)}</PinnedListItems></Group>;
    })}</PinnedList></>);
    case 'scrollProgress': return shell(<ScrollExample block={block}/>);
    default: throw new Error(`缺少组件适配：${type}`);
  }
}
