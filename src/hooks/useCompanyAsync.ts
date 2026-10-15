import { useOperatorAccess } from '../data/operatorAccess';
import { useAsync } from './useAsync';

/**
 * useAsync for a query scoped to the operator's company. It waits for the workspace
 * to load, so a page never flashes its empty state ("No boats yet") before it knows
 * which company to ask about, and it reports a workspace error as its own.
 * data stays null when the account has no company at all.
 */
export function useCompanyAsync<T>(fn: (companyId: string) => Promise<T>, deps: unknown[] = []) {
  const access = useOperatorAccess();
  const companyId = access.company?.id ?? null;
  const q = useAsync<T | null>(
    () => (companyId ? fn(companyId) : Promise.resolve(null)),
    [companyId, ...deps],
  );
  return {
    data: q.data,
    loading: access.loading || q.loading,
    error: access.error ?? q.error,
    reload: access.error ? access.reload : q.reload,
    companyId,
  };
}
