/**
 * Base class for all errors the bot expects and handles deliberately.
 * `userMessage` is always safe to send back to Telegram; it never leaks
 * stack traces, API keys, or raw provider error bodies.
 */
export class AppError extends Error {
  public readonly userMessage: string;
  public readonly cause?: unknown;

  constructor(message: string, userMessage: string, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, userMessage = message) {
    super(message, userMessage);
  }
}

export class InsufficientDataError extends AppError {
  constructor(message: string, userMessage = message) {
    super(message, userMessage);
  }
}

export class MissingVoiceProfileError extends AppError {
  constructor() {
    super(
      "No active voice profile for user",
      "You don't have a Voice Profile yet. Send /addposts to add some LinkedIn posts, then run /analyze to build one.",
    );
  }
}

export class AIProviderError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(
      message,
      "The AI service failed to respond. Please try again in a moment.",
      cause,
    );
  }
}

export class AIResponseParsingError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(
      message,
      "The AI returned a response I couldn't parse. Please try again — if this keeps happening, try rephrasing your input.",
      cause,
    );
  }
}

export class ResearchError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(
      message,
      "I couldn't fetch current context for this, so I'll continue without it.",
      cause,
    );
  }
}

/** Thrown when Google News RSS retrieval genuinely fails (network/HTTP/parse) - distinct from a search simply finding nothing. */
export class NewsRetrievalError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(
      message,
      "I couldn't retrieve current industry news for this right now. Please try again in a moment.",
      cause,
    );
  }
}

export class TelegramDeliveryError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, "Failed to deliver a message via Telegram.", cause);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, userMessage = message) {
    super(message, userMessage);
  }
}

/** Narrows unknown thrown values down to a user-safe message for Telegram replies. */
export function toUserMessage(error: unknown): string {
  if (error instanceof AppError) return error.userMessage;
  return "Something went wrong on my end. Please try again.";
}
