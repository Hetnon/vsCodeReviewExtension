// Pure validation of the parsed review-state JSON. The file is committed to the
// repo, so a cloned workspace makes its contents attacker-controlled input.

import { ReviewedEntry } from './types';
import { unsafeWorkspaceRelativePathReason } from './pathUtils';

const GIT_BLOB_HASH_PATTERN = /^[0-9a-f]{40}$/;

export interface SanitizedEntries {
  entries: ReviewedEntry[];
  dropped: number;
}

export function isValidReviewedEntry(raw: unknown): raw is ReviewedEntry {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const { relativePath, contentHash, markedAt } = raw as Record<string, unknown>;
  return (
    typeof relativePath === 'string' &&
    unsafeWorkspaceRelativePathReason(relativePath) === null &&
    typeof contentHash === 'string' &&
    GIT_BLOB_HASH_PATTERN.test(contentHash) &&
    typeof markedAt === 'number' &&
    Number.isFinite(markedAt)
  );
}

export function sanitizeReviewedEntries(parsed: unknown): SanitizedEntries {
  const rawEntries = (parsed as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(rawEntries)) {
    return { entries: [], dropped: 0 };
  }
  const entries: ReviewedEntry[] = [];
  let dropped = 0;
  for (const raw of rawEntries) {
    if (isValidReviewedEntry(raw)) {
      entries.push({ relativePath: raw.relativePath, contentHash: raw.contentHash, markedAt: raw.markedAt });
    } else {
      dropped += 1;
    }
  }
  return { entries, dropped };
}
