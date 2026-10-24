"use client";

import { QuestionImage } from "./question-image";
import type { ReactNode } from "react";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useQuestionFit } from "./use-question-fit";
import { questionEmphasis } from "@/lib/practice/question-emphasis";

/** One reading layout shared by simulation and practice. */
export function QuizQuestion({ question, position, total, onZoom, children, emphasize = false }: {
  question: {
    statement: string;
    topic: string | null;
    officialQuestionCode: string | null;
    groupCode: string | null;
    image: { url: string; width: number | null; height: number | null } | null;
  };
  position: number;
  total: number;
  onZoom: (url: string) => void;
  children: ReactNode;
  emphasize?: boolean;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const { layoutRef, titleRef } = useQuestionFit(question.statement, !!question.image);
  return (
    <div ref={layoutRef} className="quiz-layout" data-has-image={!!question.image}>
    <article className="quiz-question border-2 border-foreground bg-surface shadow-pop">
      <div className="quiz-position font-mono text-sm font-medium text-muted">
        <p>Domanda {position}{total ? ` di ${total}` : " · senza limite"}</p>
        <button type="button" onClick={() => setInfoOpen(true)} aria-label="Informazioni sul quesito" className="quiz-info-button">ⓘ</button>
      </div>
      <h1 ref={titleRef} className="quiz-statement mt-3" id="quiz-statement">{emphasize
        ? questionEmphasis(question.statement).map((part, index) => part.emphasized ? <strong key={index}>{part.text}</strong> : part.text)
        : question.statement}</h1>
      {question.image && (
        <figure className="quiz-figure mt-5 border-t-2 border-foreground pt-4">
          <button type="button" onClick={() => onZoom(question.image!.url)} aria-label="Ingrandisci immagine"
            className="block w-full border border-foreground/30 bg-surface p-1 hover:border-foreground">
            <QuestionImage src={question.image.url} width={question.image.width} height={question.image.height}
              loading="eager" className="quiz-image" />
          </button>
          <figcaption className="mt-2 text-center text-sm text-muted"><span className="lg:hidden">Tocca l’immagine per ingrandirla</span><span className="hidden lg:inline">Clicca sull’immagine per ingrandirla</span></figcaption>
        </figure>
      )}
      <details className="quiz-references hidden border-t border-foreground/20 pt-3 text-sm text-muted lg:block lg:mt-4">
        <summary className="cursor-pointer py-1 font-medium">Argomento e riferimenti</summary>
        {question.topic && <p className="mt-2 leading-relaxed">{question.topic}</p>}
        <p className="mt-1 font-mono">Codice {question.officialQuestionCode ?? "—"} · Gruppo {question.groupCode ?? "—"}</p>
      </details>
    </article>
    <div className="quiz-response" role="group" aria-labelledby="quiz-statement">{children}</div>
    <Dialog open={infoOpen} onClose={() => setInfoOpen(false)} title="Argomento e riferimenti">
      {question.topic && <p className="text-base leading-relaxed">{question.topic}</p>}
      <p className="mt-3 font-mono text-sm text-muted">Codice {question.officialQuestionCode ?? "—"} · Gruppo {question.groupCode ?? "—"}</p>
    </Dialog>
    </div>
  );
}
