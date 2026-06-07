import { isUkWideArea, resolveAuthoritiesForFind } from "../finder/find-area.js";
import { getSetting, setSetting } from "../store/outreach-migrations.js";

export const FSA_FIND_AUTHORITY_CURSOR_KEY = "fsa_find_authority_cursor";

export interface FsaAuthorityRef {
  id: number;
  name: string;
}

export interface FsaFindAuthorityBatch {
  authorities: FsaAuthorityRef[];
  totalAuthorities: number;
  cursorStart: number;
  cursorEnd: number;
  /** True when this batch completes a full UK rotation. */
  cycleComplete: boolean;
  ukWide: boolean;
}

function authorityBatchSize(): number {
  const fromEnv = Number(process.env.FIND_CRON_AUTHORITY_BATCH?.trim());
  if (Number.isInteger(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  return 20;
}

export async function planFsaFindAuthorityBatch(
  areaName: string,
  options?: { batchAll?: boolean },
): Promise<FsaFindAuthorityBatch> {
  const all = await resolveAuthoritiesForFind(areaName);
  const ukWide = isUkWideArea(areaName);

  if (!ukWide || options?.batchAll) {
    return {
      authorities: all,
      totalAuthorities: all.length,
      cursorStart: 0,
      cursorEnd: all.length,
      cycleComplete: true,
      ukWide,
    };
  }

  const cursor = Number((await getSetting(FSA_FIND_AUTHORITY_CURSOR_KEY)) ?? 0);
  const safeCursor =
    Number.isInteger(cursor) && cursor >= 0 && cursor < all.length ? cursor : 0;
  const batchSize = authorityBatchSize();
  const batch = all.slice(safeCursor, safeCursor + batchSize);
  const cursorEnd = safeCursor + batch.length;
  const cycleComplete = cursorEnd >= all.length;

  return {
    authorities: batch,
    totalAuthorities: all.length,
    cursorStart: safeCursor,
    cursorEnd,
    cycleComplete,
    ukWide,
  };
}

export async function advanceFsaFindAuthorityCursor(
  plan: FsaFindAuthorityBatch,
): Promise<void> {
  if (!plan.ukWide) {
    await setSetting(FSA_FIND_AUTHORITY_CURSOR_KEY, "0");
    return;
  }

  if (plan.cycleComplete) {
    await setSetting(FSA_FIND_AUTHORITY_CURSOR_KEY, "0");
    return;
  }

  await setSetting(FSA_FIND_AUTHORITY_CURSOR_KEY, String(plan.cursorEnd));
}
