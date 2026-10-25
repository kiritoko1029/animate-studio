/** A new request may continue from the last validated page, never from partial JSON. */
export class AiContinuationError extends Error {
  constructor(message: string) { super(message); this.name = 'AiContinuationError'; }
}

/** The provider ended normally at its output limit; a complete terminal record may already have arrived. */
export class AiOutputLimitError extends AiContinuationError {
  constructor(message: string) { super(message); this.name = 'AiOutputLimitError'; }
}
