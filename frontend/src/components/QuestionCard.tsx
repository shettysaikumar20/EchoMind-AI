import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
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

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onGenerateAnswer(question)}
            disabled={isGenerating}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              !hasAnswer
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30'
            }`}
            title={hasAnswer ? 'Regenerate answer for this question' : 'Generate AI answer'}
          >
            <Sparkles className="w-3 h-3" />
            <span>{isGenerating ? 'Generating...' : hasAnswer ? 'Answer' : 'Answer Now'}</span>
          </button>

          {hasAnswer && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
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
              <div className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans selection:bg-emerald-500/30">
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed text-slate-200">{children}</p>,
                    h1: ({ children }) => <h3 className="text-base font-bold text-white font-['Outfit'] mt-3 mb-1.5">{children}</h3>,
                    h2: ({ children }) => <h4 className="text-sm font-bold text-emerald-400 font-['Outfit'] mt-2.5 mb-1">{children}</h4>,
                    h3: ({ children }) => <h5 className="text-xs font-semibold text-teal-300 uppercase tracking-wider mt-2 mb-1">{children}</h5>,
                    ul: ({ children }) => <ul className="space-y-1.5 my-2 pl-4 list-disc marker:text-emerald-400 text-slate-300">{children}</ul>,
                    ol: ({ children }) => <ol className="space-y-1.5 my-2 pl-4 list-decimal marker:text-emerald-400 text-slate-300">{children}</ol>,
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                    code: ({ children }) => (
                      <code className="bg-slate-900 text-emerald-300 border border-slate-800 rounded px-1.5 py-0.5 font-mono text-[11px]">
                        {children}
                      </code>
                    ),
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-3 rounded-xl border border-slate-800 bg-slate-900/40">
                        <table className="w-full text-xs text-left border-collapse">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-slate-900 text-emerald-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[11px]">
                        {children}
                      </thead>
                    ),
                    tbody: ({ children }) => <tbody className="divide-y divide-slate-800/60">{children}</tbody>,
                    tr: ({ children }) => <tr className="hover:bg-slate-900/60 transition-colors">{children}</tr>,
                    th: ({ children }) => <th className="px-3 py-2 text-emerald-400 font-semibold">{children}</th>,
                    td: ({ children }) => <td className="px-3 py-2 text-slate-300">{children}</td>,
                  }}
                >
                  {displayText}
                </ReactMarkdown>
                {isGenerating && (
                  <span className="inline-block w-2 h-4 bg-emerald-400 ml-1 animate-pulse align-middle" />
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
