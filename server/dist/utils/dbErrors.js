const asString = (value) => (typeof value === 'string' ? value : String(value ?? ''));
const hasCode = (error, code) => {
    const maybe = error;
    return asString(maybe?.code) === code;
};
const messageIncludes = (error, ...needles) => {
    const maybe = error;
    const message = asString(maybe?.message).toLowerCase();
    return needles.every((n) => message.includes(n.toLowerCase()));
};
const anyNested = (error, predicate) => {
    if (error instanceof AggregateError) {
        return error.errors.some(predicate);
    }
    const maybe = error;
    if (Array.isArray(maybe?.errors)) {
        return maybe.errors.some(predicate);
    }
    return false;
};
export const isMissingTableError = (error) => {
    // Postgres undefined_table
    if (hasCode(error, '42P01'))
        return true;
    if (messageIncludes(error, 'relation', 'does not exist'))
        return true;
    if (messageIncludes(error, 'undefined_table'))
        return true;
    return anyNested(error, isMissingTableError);
};
export const isDbUnavailableError = (error) => {
    const transientCodes = new Set([
        'ECONNREFUSED',
        'ECONNRESET',
        'ETIMEDOUT',
        'EAI_AGAIN',
        'ENETUNREACH',
        'ENOTFOUND',
    ]);
    const maybe = error;
    if (transientCodes.has(asString(maybe?.code)))
        return true;
    if (messageIncludes(error, 'connect', 'econnrefused'))
        return true;
    if (messageIncludes(error, 'connection', 'terminated'))
        return true;
    if (messageIncludes(error, 'the database system is starting up'))
        return true;
    return anyNested(error, isDbUnavailableError);
};
export const isSoftDbErrorForUi = (error) => {
    return isMissingTableError(error) || isDbUnavailableError(error);
};
//# sourceMappingURL=dbErrors.js.map