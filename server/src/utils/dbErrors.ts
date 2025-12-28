type UnknownError = {
  code?: unknown;
  message?: unknown;
  errors?: unknown;
};

const asString = (value: unknown): string => (typeof value === 'string' ? value : String(value ?? ''));

const hasCode = (error: unknown, code: string): boolean => {
  const maybe = error as UnknownError;
  return asString(maybe?.code) === code;
};

const messageIncludes = (error: unknown, ...needles: string[]): boolean => {
  const maybe = error as UnknownError;
  const message = asString(maybe?.message).toLowerCase();
  return needles.every((n) => message.includes(n.toLowerCase()));
};

const anyNested = (error: unknown, predicate: (e: unknown) => boolean): boolean => {
  if (error instanceof AggregateError) {
    return error.errors.some(predicate);
  }
  const maybe = error as UnknownError;
  if (Array.isArray(maybe?.errors)) {
    return maybe.errors.some(predicate);
  }
  return false;
};

export const isMissingTableError = (error: unknown): boolean => {
  // Postgres undefined_table
  if (hasCode(error, '42P01')) return true;
  if (messageIncludes(error, 'relation', 'does not exist')) return true;
  if (messageIncludes(error, 'undefined_table')) return true;
  return anyNested(error, isMissingTableError);
};

export const isDbUnavailableError = (error: unknown): boolean => {
  const transientCodes = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'ENETUNREACH',
    'ENOTFOUND',
  ]);

  const maybe = error as UnknownError;
  if (transientCodes.has(asString(maybe?.code))) return true;

  if (messageIncludes(error, 'connect', 'econnrefused')) return true;
  if (messageIncludes(error, 'connection', 'terminated')) return true;
  if (messageIncludes(error, 'the database system is starting up')) return true;

  return anyNested(error, isDbUnavailableError);
};

export const isSoftDbErrorForUi = (error: unknown): boolean => {
  return isMissingTableError(error) || isDbUnavailableError(error);
};
