/** Desktop progress: position is separate from answered status, including skipped questions. */
export function QuizProgress({ position, answered }: { position: number; answered: boolean[] }) {
  return (
    <div className="quiz-progress">
      <p className="shrink-0 font-mono text-sm font-semibold uppercase" aria-live="polite">
        Domanda {position} di {answered.length}
      </p>
      <div className="quiz-progress-track" aria-hidden="true">
        {answered.map((done, index) => (
          <span key={index} data-current={index + 1 === position} data-answered={done} />
        ))}
      </div>
    </div>
  );
}
