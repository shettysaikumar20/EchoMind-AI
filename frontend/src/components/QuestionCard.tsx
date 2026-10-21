import React, { useState } from 'react';
import { DetectedQuestion, AIAnswer } from '../types';
import { HelpCircle, Sparkles, Copy, Check, ChevronDown, ChevronUp, Bot, Clock } from 'lucide-react';

interface QuestionCardProps {
  question: DetectedQuestion;
  onGenerateAnswer: (question: DetectedQuestion) => void;
  isGenerating?: boolean;
  streamingAnswerText?: string;
  streamingLatency?: number;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  onGenerateAnswer,
  isGenerating = false,
  streamingAnswerText = '',
  streamingLatency,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const existingAnswer: AIAnswer | undefined = question.answers?.[0];
  const hasAnswer = Boolean(existingAnswer || streamingAnswerText);
  const displayText = streamingAnswerText || existingAnswer?.answer_text;

  const handleCopy = () => {
    if (displayText) {
      navigator.clipboard.writeText(displayText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-md overflow-hidden transition-all duration-200 hover:border-slate-700">
      {/* Header / Question Title */}
      <div className="p-4 flex items-start justify-between gap-3 bg-slate-900/90 border-b border-slate-800/80">
        <div className="flex items-start gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold font-mono text-xs border border-emerald-500/20 shrink-0 mt-0.5">
            Q{question.question_index}
          </span>
          <div>
            <h4 className="text-base font-semibold text-white leading-snug font-['Outfit']">
              {question.question_text}
            </h4>
            {question.context_snippet && (
              <p className="text-xs text-slate-400 mt-1 line-clamp-2 italic">
                "{question.context_snippet}"
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!hasAnswer && !isGenerating && (
            <button
              onClick={() => onGenerateAnswer(question)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors shadow-md shadow-emerald-500/20 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Answer Now
            </button>
          )}

          {hasAnswer && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title={isExpanded ? 'Collapse answer' : 'Expand answer'}
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Answer Body */}
      {isExpanded && (
        <div className="p-4 bg-slate-950/40 space-y-3">
          {isGenerating && !streamingAnswerText && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 animate-pulse py-2">
              <Bot className="w-4 h-4 animate-spin" />
              <span>Formulating context-aware answer via open-weight model...</span>
            </div>
          )}

          {displayText ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-200 leading-relaxed font-sans whitespace-pre-wrap selection:bg-emerald-500/30">
                {displayText}
                {isGenerating && (
                  <span className="inline-block w-2 h-4 bg-emerald-400 ml-1 animate-pulse" />
                )}
              </div>

              {/* Footer details & Copy button */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs text-slate-400">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    <Bot className="w-3 h-3" />
                    {existingAnswer ? `${existingAnswer.provider} / ${existingAnswer.model.split('/').pop()}` : 'Generating...'}
                  </span>
                  {(existingAnswer?.latency_ms || streamingLatency) && (
                    <span className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                      <Clock className="w-3 h-3" />
                      {existingAnswer?.latency_ms || streamingLatency}ms
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400 font-medium">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => onGenerateAnswer(question)}
                    disabled={isGenerating}
                    className="px-2 py-1 rounded-md text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
            </div>
          ) : !isGenerating ? (
            <p className="text-xs text-slate-400 py-1">
              Click <strong>"Answer Now"</strong> or press <strong>Pause</strong> during conversation to generate context-grounded AI responses.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
};
