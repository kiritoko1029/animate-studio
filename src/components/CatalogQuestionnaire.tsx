import { useState } from 'react';
import { Check } from 'lucide-react';
import { Questionnaire as Q } from '@animate-ui/react/primitives/questionnaire';
import type { Block } from '../model';
import { motionProps, officialClass } from '../lib/official-motion';
import { officialAnimationProps } from '../../shared/animation-settings.mjs';
import { useBlockValue } from './NativeInteractions';

type Question={name:string;title:string;description?:string;required?:boolean;disabled?:boolean;multiple?:boolean;choices?:{value:string;label?:string;description?:string;disabled?:boolean}[];input?:{label?:string;placeholder?:string}};
export function CatalogQuestionnaire({block}:{block:Block}) {
 const p=block.props,[step,setStep]=useBlockValue(p.value ?? 0),[submitted,setSubmitted]=useState(false);
 const root=motionProps<typeof Q.Root>(block,'Questionnaire'),item=motionProps<typeof Q.Item>(block,'QuestionnaireItem'),choice=motionProps<typeof Q.Choice>(block,'QuestionnaireChoice'),input=motionProps<typeof Q.Input>(block,'QuestionnaireInput');
 const structured=officialAnimationProps('questionnaire','QuestionnaireStructure',p.motion).items as unknown as Question[];
 const rows=(p.items || '').split('\n').filter(Boolean);
 const source:Question[]=p.motion?.['QuestionnaireStructure.items'] || !rows.length ? structured : rows.map((row,i)=>{const [title,values,description,name]=row.split('|');return {name:name || `${item.name || 'question'}-${i}`,title,description,required:true,...values?{choices:values.split(',').filter(Boolean).map(value=>({value}))}:{input:{label:title}}};});
 const questions=source.map(q=>({...q,required:p.motion?.['QuestionnaireItem.required'] as boolean|undefined ?? q.required ?? true,disabled:item.disabled ?? q.disabled,multiple:item.multiple ?? q.multiple}));
 if(submitted)return <p role="status">{p.text || '感谢你的回答！'}</p>;
 const button='as-page-catalog-button';
 return <>{p.title&&<h3>{p.title}</h3>}<Q.Root {...root} className={officialClass('native-questionnaire',root.className)} items={questions} item={questions[step]?.name ?? questions[0]?.name} onItemChange={name=>setStep(questions.findIndex(q=>q.name===name))} shortcuts={root.shortcuts ?? 'letters'} onSubmit={event=>{event.preventDefault();setSubmitted(true);setStep(questions.length);}}>
  <Q.Progress {...motionProps<typeof Q.Progress>(block,'QuestionnaireProgress')}/>
  {questions.map(question=><Q.Item {...item} key={question.name} name={question.name} required={question.required} disabled={question.disabled} multiple={question.multiple} className={officialClass('native-catalog-question',item.className)}>
   <Q.Title {...motionProps<typeof Q.Title>(block,'QuestionnaireTitle')}>{question.title}</Q.Title>
   {question.description&&<Q.Description {...motionProps<typeof Q.Description>(block,'QuestionnaireDescription')}>{question.description}</Q.Description>}
   <Q.Choices {...motionProps<typeof Q.Choices>(block,'QuestionnaireChoices')}>
    {question.choices?.map(option=><Q.Choice {...choice} value={option.value} key={option.value} disabled={option.disabled ?? choice.disabled} className={officialClass('native-question-choice',choice.className)}>
     <Q.ChoiceInput {...motionProps<typeof Q.ChoiceInput>(block,'QuestionnaireChoiceInput')}/>
     <span data-slot="questionnaire-choice-indicator">{question.multiple?<Check size={12} data-slot="questionnaire-choice-indicator-check"/>:<span data-slot="questionnaire-choice-indicator-dot"/>}</span>
     <span className="native-question-choice-copy"><Q.ChoiceLabel {...motionProps<typeof Q.ChoiceLabel>(block,'QuestionnaireChoiceLabel')}>{option.label || option.value}</Q.ChoiceLabel>{option.description&&<small>{option.description}</small>}</span><Q.ChoiceShortcut {...motionProps<typeof Q.ChoiceShortcut>(block,'QuestionnaireChoiceShortcut')}/>
    </Q.Choice>)}
    {question.input&&<Q.Input {...input} className={officialClass('as-page-input',input.className)} aria-label={input['aria-label'] ?? question.input.label ?? question.title} placeholder={input.placeholder ?? question.input.placeholder}/>}
   </Q.Choices>
   <Q.Error {...motionProps<typeof Q.Error>(block,'QuestionnaireError')}>请先填写此题</Q.Error>
  </Q.Item>)}
  <div className="as-page-catalog-actions"><Q.Previous {...motionProps<typeof Q.Previous>(block,'QuestionnairePrevious')} className={officialClass(button,motionProps<typeof Q.Previous>(block,'QuestionnairePrevious').className)}>上一题</Q.Previous><Q.Skip {...motionProps<typeof Q.Skip>(block,'QuestionnaireSkip')} className={officialClass(button,motionProps<typeof Q.Skip>(block,'QuestionnaireSkip').className)}>跳过</Q.Skip><Q.Next {...motionProps<typeof Q.Next>(block,'QuestionnaireNext')} className={officialClass(button,motionProps<typeof Q.Next>(block,'QuestionnaireNext').className)}>下一题</Q.Next><Q.Submit {...motionProps<typeof Q.Submit>(block,'QuestionnaireSubmit')} className={officialClass(button,motionProps<typeof Q.Submit>(block,'QuestionnaireSubmit').className)}>{p.label || '提交'}</Q.Submit></div>
 </Q.Root></>;
}
