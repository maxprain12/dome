#!/usr/bin/env python3
"""Deep per-table byte accounting for dome.db."""
import os, sqlite3, sys

DB = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get("APPDATA", ""), "dome", "dome.db")

def mb(n):
    return f"{n/1e6:.2f} MB"

conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
cur = conn.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]

print("=== PER-TABLE APPROX DATA BYTES (sum of text/blob lengths) ===")
grand = 0
for t in tables:
    cur.execute(f'PRAGMA table_info("{t}")')
    cols = cur.fetchall()
    text_cols = [c[1] for c in cols if c[2].upper() in ("TEXT", "BLOB", "JSON") or "TEXT" in c[2].upper() or "BLOB" in c[2].upper()]
    if not text_cols:
        continue
    parts = [f'COALESCE(length("{c}"),0)' for c in text_cols]
    expr = " + ".join(parts)
    try:
        cur.execute(f'SELECT COUNT(*), SUM({expr}), MAX({expr}) FROM "{t}"')
        cnt, total, mx = cur.fetchone()
        total = total or 0
        mx = mx or 0
        if total > 0 or cnt > 0:
            grand += total
            if total > 1_000_000:
                print(f"{t}: rows={cnt} sum={mb(total)} max_col={mb(mx)} cols={text_cols}")
    except sqlite3.Error as e:
        print(f"{t}: ERROR {e}")

print(f"\nGRAND SUM (text/blob only): {mb(grand)}")

print("\n=== WAL / SHM ===")
for ext in ("-wal", "-shm"):
    p = DB + ext
    if os.path.isfile(p):
        print(f"{os.path.basename(p)}: {mb(os.path.getsize(p))}")

print("\n=== TOP 10 automation_runs BY metadata ===")
cur.execute(
    "SELECT id, status, length(metadata), started_at FROM automation_runs ORDER BY length(metadata) DESC LIMIT 10"
)
for row in cur.fetchall():
    print(f"  {row[0][:8]} status={row[1]} meta={mb(row[2] or 0)} started={row[3]}")

print("\n=== TOP 10 automation_run_steps BY content ===")
cur.execute(
    "SELECT id, run_id, step_type, length(content), created_at FROM automation_run_steps ORDER BY length(content) DESC LIMIT 10"
)
for row in cur.fetchall():
    print(f"  step={row[0]} run={str(row[1])[:8]} type={row[2]} len={mb(row[3] or 0)}")

print("\n=== settings value sizes ===")
cur.execute("SELECT key, length(value) FROM settings ORDER BY length(value) DESC LIMIT 15")
for k, ln in cur.fetchall():
    if (ln or 0) > 1000:
        print(f"  {k}: {mb(ln)}")

print("\n=== github table column sums ===")
for t in ["github_issues", "github_repos", "github_branches", "github_releases", "github_milestones", "github_sync_state", "github_calendar_links"]:
    try:
        cur.execute(f'PRAGMA table_info("{t}")')
        cols = [c[1] for c in cur.fetchall()]
        text_cols = [c for c in cols if c not in ("id", "repo_id", "number", "state", "created_at", "updated_at")]
        if not text_cols:
            continue
        parts = [f'COALESCE(length("{c}"),0)' for c in text_cols]
        cur.execute(f'SELECT COUNT(*), SUM({" + ".join(parts)}) FROM "{t}"')
        cnt, total = cur.fetchone()
        if total and total > 100_000:
            print(f"  {t}: rows={cnt} sum={mb(total)}")
    except sqlite3.Error:
        pass

conn.close()
