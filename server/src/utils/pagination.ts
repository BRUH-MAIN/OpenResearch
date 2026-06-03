/**
 * Cursor-based pagination utility.
 *
 * Uses a base-64 encoded cursor pointing at the last returned item's ID.
 * This is more reliable than offset-based pagination for real-time data.
 */

export interface PaginatedResponse<T> {
    items: T[];
    cursor: string | null;
    hasMore: boolean;
}

/** Default page size */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Parse limit from query string, clamped to [1, MAX_LIMIT] */
export function parseLimit(raw?: string | number): number {
    const num = typeof raw === 'string' ? parseInt(raw, 10) : raw ?? DEFAULT_LIMIT;
    if (isNaN(num) || num < 1) return DEFAULT_LIMIT;
    return Math.min(num, MAX_LIMIT);
}

/** Decode a cursor string → original ID string (or null) */
export function decodeCursor(cursor?: string | null): string | null {
    if (!cursor) return null;
    try {
        return Buffer.from(cursor, 'base64url').toString('utf-8');
    } catch {
        return null;
    }
}

/** Encode an ID into a cursor string */
export function encodeCursor(id: string): string {
    return Buffer.from(id, 'utf-8').toString('base64url');
}

/**
 * Build a standardised paginated response.
 *
 * @param items - The full query result (should include limit+1 rows)
 * @param limit - The requested page size
 */
export function buildPaginatedResponse<T extends { id: string }>(
    items: T[],
    limit: number,
): PaginatedResponse<T> {
    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;
    const lastItem = pageItems[pageItems.length - 1];

    return {
        items: pageItems,
        cursor: lastItem ? encodeCursor(lastItem.id) : null,
        hasMore,
    };
}
