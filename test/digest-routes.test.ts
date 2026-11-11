import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Fixtures live in a temp dir, never in runs/ (read-only real nights).
const NIGHT_OK = '2026-10-28';
const NIGHT_EMPTY = '2026-10-29';
const NIGHT_BAD = '2026-10-30';
const NIGHT_MISSING = '2026-10-31';

const JOBS = ['sync-mail', 'backup-db', 'build-index']; // written out of order on purpose

const line = (job: string, status: string, at: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ at, job, status, owner: 'nav', ...extra });

let runsDir: string;
let config: { adapter: string; installed: string; beatEverySeconds: number; runsDir: string };

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  writeFileSync(
    join(runsDir, `${NIGHT_OK}.jsonl`),
    [
      line('sync-mail', 'ok', '2026-10-28T01:00:00+01:00'),
      line('backup-db', 'retry', '2026-10-28T02:00:00+01:00', { error: 'disk busy' }),
      line('backup-db', 'ok', '2026-10-28T02:05:00+01:00'),
      line('build-index', 'fail', '2026-10-28T03:00:00+01:00', { error: 'out of memory' }),
    ].join('\n') + '\n',
  );
  writeFileSync(join(runsDir, `${NIGHT_EMPTY}.jsonl`), '');
  writeFileSync(
    join(runsDir, `${NIGHT_BAD}.jsonl`),
    [
      line('backup-db', 'ok', '2026-10-30T02:00:00+01:00'),
      'this is not json',
    ].join('\n') + '\n',
  );
  config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('renders 200 with each job name for a night with data', async () => {
    const res = await createApp(config).request(`/digest/${NIGHT_OK}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of JOBS) expect(html).toContain(job);
  });

  it('returns 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/digest/${NIGHT_MISSING}`);
    expect(res.status).toBe(404);
  });

  it('renders "nothing ran" for a night whose file is empty', async () => {
    const res = await createApp(config).request(`/digest/${NIGHT_EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('still renders 200 with the good jobs when a line is bad', async () => {
    const res = await createApp(config).request(`/digest/${NIGHT_BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('backup-db');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns 200 with the night and its rows', async () => {
    const res = await createApp(config).request(`/api/digest/${NIGHT_OK}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string }[]; badLines: number };
    expect(body.night).toBe(NIGHT_OK);
    expect(body.rows.map((r) => r.job)).toEqual(['backup-db', 'build-index', 'sync-mail']);
    expect(body.badLines).toBe(0);
  });

  it('returns 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/api/digest/${NIGHT_MISSING}`);
    expect(res.status).toBe(404);
  });

  it('returns rows: [] for an empty night', async () => {
    const res = await createApp(config).request(`/api/digest/${NIGHT_EMPTY}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[] };
    expect(body.rows).toEqual([]);
  });

  it('counts the bad line in badLines and keeps the good rows', async () => {
    const res = await createApp(config).request(`/api/digest/${NIGHT_BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['backup-db']);
  });

  it('lists jobs in the same order as the HTML page for the same night', async () => {
    const app = createApp(config);
    const html = await (await app.request(`/digest/${NIGHT_OK}`)).text();
    const json = (await (await app.request(`/api/digest/${NIGHT_OK}`)).json()) as {
      rows: { job: string }[];
    };
    const positions = json.rows.map((r) => html.indexOf(r.job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
