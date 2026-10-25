import { Check, Send, Sparkles } from 'lucide-react';
import { getLocale, t } from '../../i18n';
import type { AiQuestion } from '../../lib/ai/types';
import { StudioButton } from '../StudioUI';

export type AiAnswers = Record<string, string[]>;

/** One chat message answering the model's questions; recommended uses the first option of each single choice. */
export function composeAiAnswer(questions: AiQuestion[], answers: AiAnswers, note: string, recommended = false): string {
  const english = getLocale() === 'en';
  const chosen = (question: AiQuestion) => recommended && !question.multiple ? [question.options[0]] : answers[question.id] ?? [];
  const lines = questions.filter(question => chosen(question).length).map(question => `${question.title}${english ? ': ' : '：'}${chosen(question).join(english ? ', ' : '、')}`);
  if (note.trim()) lines.push(note.trim());
  if (!lines.length && !recommended) return '';
  if (questions.some(question => !chosen(question).length)) lines.push(t('其余问题请按你的推荐决定。'));
  return lines.join('\n');
}

export function toggleAiAnswer(answers: AiAnswers, question: AiQuestion, option: string): AiAnswers {
  const selected = answers[question.id] ?? [];
  const next = question.multiple ? selected.includes(option) ? selected.filter(value => value !== option) : [...selected, option] : selected[0] === option ? [] : [option];
  return { ...answers, [question.id]: next };
}

export function AiQuestionCard({ questions, answers, ready, disabled, onToggle, onSubmit, onRecommended }: {
  questions: AiQuestion[]; answers: AiAnswers; ready: boolean; disabled: boolean;
  onToggle: (question: AiQuestion, option: string) => void; onSubmit: () => void; onRecommended: () => void;
}) {
  return <div className="ai-question" role="group" aria-label={t('AI 的问题')}>
    {questions.map(question => <fieldset key={question.id} className="ai-question-item" disabled={disabled}>
      <legend>{question.title}{question.multiple && <small>{t('可多选')}</small>}</legend>
      <div className="ai-question-options">{question.options.map((option, index) => {
        const selected = answers[question.id]?.includes(option) ?? false;
        return <StudioButton key={option} className={`ai-question-option${selected ? ' is-selected' : ''}`} aria-pressed={selected} onClick={() => onToggle(question, option)}>
          {selected && <Check size={12}/>}<span>{option}</span>{index === 0 && !question.multiple && <em>{t('推荐')}</em>}
        </StudioButton>;
      })}</div>
    </fieldset>)}
    <div className="ai-question-actions">
      <StudioButton className="secondary-button" disabled={disabled} onClick={onRecommended}><Sparkles size={13}/>{t('按推荐生成')}</StudioButton>
      <StudioButton className="primary-button" disabled={disabled || !ready} onClick={onSubmit}><Send size={13}/>{t('确认并继续')}</StudioButton>
    </div>
    <p className="ai-question-hint">{t('也可以在下方输入框补充其他要求，发送时会一起提交。')}</p>
  </div>;
}
