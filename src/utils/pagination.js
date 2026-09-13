const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePagination(query) {
    const limit = Math.min(parseInt(query.limit, 10) || DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = query.cursor;
    return { limit, cursor };
}

function buildPageResponse(items, limit) {
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return {
        data: page,
        meta: {
            nextCursor: hasMore ? page[page.length - 1].id : null,
            hasMore,
        },
    };
}

module.exports = { parsePagination, buildPageResponse };
