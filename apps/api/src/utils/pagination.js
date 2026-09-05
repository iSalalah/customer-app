import { PAGINATION } from '@dhofar/shared';

/** Translates validated page/pageSize into Prisma skip/take. */
export function toSkipTake({ page = PAGINATION.DEFAULT_PAGE, pageSize = PAGINATION.DEFAULT_PAGE_SIZE }) {
  const safePage = Math.max(1, Number(page) || PAGINATION.DEFAULT_PAGE);
  const safeSize = Math.min(
    PAGINATION.MAX_PAGE_SIZE,
    Math.max(1, Number(pageSize) || PAGINATION.DEFAULT_PAGE_SIZE),
  );
  return { skip: (safePage - 1) * safeSize, take: safeSize, page: safePage, pageSize: safeSize };
}

export function buildPageMeta({ page, pageSize, total }) {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return {
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

/**
 * Whitelisted sort fields. A client-supplied column name never reaches Prisma
 * directly - an unknown field falls back to the default rather than erroring,
 * so a stale bookmark does not break the staff queue.
 */
export function buildOrderBy(sort, allowed, fallback) {
  if (typeof sort !== 'string' || sort.length === 0) return fallback;
  const descending = sort.startsWith('-');
  const field = descending ? sort.slice(1) : sort;
  if (!allowed.includes(field)) return fallback;
  return { [field]: descending ? 'desc' : 'asc' };
}
