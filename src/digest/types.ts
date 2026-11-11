// Plan morning-digest § 1. The shape every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One job across one night of runs/<night>.jsonl.
export type DigestRow = {
  job: string;
  owner: string | null; // null in the log stays null here; views render it as —
  runs: number; // lines for this job
  retries: number; // lines with status retry
  lastStatus: RunStatus;
  lastError: string | null; // error of the last line that had one
  firstAt: string; // as written in the log, offset kept
  lastAt: string;
};

export type DigestNight = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that did not parse; counted, never thrown
};

// null when runs/<night>.jsonl does not exist.
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
