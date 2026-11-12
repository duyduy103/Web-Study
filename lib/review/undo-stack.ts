import type {
  QuestionSnapshot,
  ReviewQuestionItem,
  UndoStep,
} from "@/lib/review/types";

export const MAX_UNDO_STEPS = 30;

export interface UndoRedoState {
  undoStack: UndoStep[];
  redoStack: UndoStep[];
}

export function createEmptyUndoRedoState(): UndoRedoState {
  return {
    undoStack: [],
    redoStack: [],
  };
}

export function createSnapshotFromQuestion(
  q: ReviewQuestionItem
): QuestionSnapshot {
  return {
    id: q.id,
    type: q.type,
    stem: q.stem,
    explanation: q.explanation,
    topic: q.topic,
    difficulty: q.difficulty,
    confidence: q.confidence,
    status: q.status,
    warnings: [...q.warnings],
    ai_generated: q.ai_generated,
    reviewed_by_human: q.reviewed_by_human,
    reviewed_at: q.reviewed_at,
    choices: q.choices.map((c, idx) => ({
      id: c.id,
      text: c.text,
      is_correct: c.is_correct,
      position: idx,
      ai_generated: c.ai_generated,
    })),
    answer_text: q.answer_text,
  };
}

export function applySnapshotsToQuestions(
  questions: ReviewQuestionItem[],
  snapshots: QuestionSnapshot[],
  serverUpdatedAtById?: Record<string, string>
): ReviewQuestionItem[] {
  const snapshotMap = new Map(snapshots.map((s) => [s.id, s]));

  return questions.map((q) => {
    const snap = snapshotMap.get(q.id);
    if (!snap) {
      return q;
    }

    return {
      ...q,
      type: snap.type,
      stem: snap.stem,
      explanation: snap.explanation,
      topic: snap.topic,
      difficulty: snap.difficulty,
      confidence: snap.confidence,
      status: snap.status,
      warnings: [...snap.warnings],
      ai_generated: snap.ai_generated,
      reviewed_by_human: snap.reviewed_by_human,
      reviewed_at: snap.reviewed_at,
      choices: snap.choices.map((c, idx) => ({
        ...c,
        position: idx,
      })),
      answer_text: snap.answer_text,
      updated_at: serverUpdatedAtById?.[q.id] ?? q.updated_at,
    };
  });
}

export function pushUndoStep(
  state: UndoRedoState,
  step: UndoStep,
  maxSteps: number = MAX_UNDO_STEPS
): UndoRedoState {
  const nextUndo = [...state.undoStack, step];
  const trimmedUndo =
    nextUndo.length > maxSteps
      ? nextUndo.slice(nextUndo.length - maxSteps)
      : nextUndo;

  return {
    undoStack: trimmedUndo,
    redoStack: [],
  };
}

export function popUndoStep(state: UndoRedoState): {
  nextState: UndoRedoState;
  step: UndoStep | null;
} {
  if (state.undoStack.length === 0) {
    return { nextState: state, step: null };
  }

  const step = state.undoStack[state.undoStack.length - 1];
  const nextUndo = state.undoStack.slice(0, -1);
  const nextRedo = [...state.redoStack, step];

  return {
    nextState: {
      undoStack: nextUndo,
      redoStack: nextRedo,
    },
    step,
  };
}

export function popRedoStep(state: UndoRedoState): {
  nextState: UndoRedoState;
  step: UndoStep | null;
} {
  if (state.redoStack.length === 0) {
    return { nextState: state, step: null };
  }

  const step = state.redoStack[state.redoStack.length - 1];
  const nextRedo = state.redoStack.slice(0, -1);
  const nextUndo = [...state.undoStack, step];

  return {
    nextState: {
      undoStack: nextUndo,
      redoStack: nextRedo,
    },
    step,
  };
}

