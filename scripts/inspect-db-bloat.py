#!/usr/bin/env python3
"""Read-only dome.db bloat inspector."""
import os
import sqlite3
import sys
from datetime import datetime, timezone

DB = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get("APPDATA", ""), "dome", "dome.db")

def mb(n):
    return f"{n / 1e6:.2f} MB"

if not os.path.isfile(DB):
    print("DB not found:", DB)
    sys.exit(1)

st = os.stat(DB)
conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
cur = conn.cursor()

def pragma(name):
    cur.execute(f"PRAGMA {name}")
    row = cur.fetchone()
    return row[0] if row else None

page_size = int(pragma("page_size") or 0)
page_count = int(pragma("page_count") or 0)
freelist = int(pragma("freelist_count") or 0)
auto_vacuum = int(pragma("auto_vacuum") or 0)
labels = {0: "NONE", 1: "FULL", 2: "INCREMENTAL"}

print("=== FILE ===")
print("path:", DB)
print("size:", mb(st.st_size), f"({st.st_size} bytes)")
print("modified:", datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat())
print()
print("=== PAGE STATS ===")
print("page_size:", page_size)
print("page_count:", page_count)
print("freelist_count:", freelist)
print("free_pct:", f"{(freelist / page_count * 100):.2f}%" if page_count else "n/a")
print("free_bytes:", mb(page_size * freelist))
print("live_bytes (approx):", mb(page_size * (page_count - freelist)))
print("auto_vacuum:", labels.get(auto_vacuum, str(auto_vacuum)))
print()

cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]

print("=== TABLE ROW COUNTS (non-empty) ===")
for t in tables:
    try:
        cur.execute(f'SELECT COUNT(*) FROM "{t}"')
        n = cur.fetchone()[0]
        if n:
            print(f"{t}: {n}")
    except sqlite3.Error:
        pass
print()

print("=== DBSTAT TOP TABLES ===")
try:
    cur.execute("SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name ORDER BY bytes DESC LIMIT 25")
    for name, b in cur.fetchall():
        print(f"{name}: {mb(b)}")
except sqlite3.Error as e:
    print("dbstat unavailable:", e)
print()

probes = [
    ("automation_runs", "metadata"),
    ("automation_run_steps", "content"),
    ("automation_run_steps", "metadata"),
    ("chat_messages", "content"),
    ("chat_messages", "metadata"),
    ("resources", "content"),
    ("resources", "metadata"),
    ("interactions", "content"),
    ("github_issues", "body"),
    ("feeder_runs", "output"),
    ("studio_outputs", "content"),
    ("artifacts", "state"),
    ("settings", "value"),
]

print("=== LARGEST TEXT COLUMNS (>100KB top 5) ===")
for table, col in probes:
    try:
        cur.execute(
            f'SELECT rowid, length("{col}") FROM "{table}" WHERE "{col}" IS NOT NULL ORDER BY 2 DESC LIMIT 5'
        )
        rows = [(r[0], r[1]) for r in cur.fetchall() if r[1] and r[1] > 100_000]
        if not rows:
            continue
        print(f"\n{table}.{col}:")
        for rid, ln in rows:
            print(f"  rowid={rid} len={ln} ({mb(ln)})")
    except sqlite3.Error:
        pass

print("\n=== RECENT AUTOMATION RUNS (metadata size) ===")
try:
    cur.execute(
        """SELECT id, status, length(metadata), started_at
           FROM automation_runs WHERE metadata IS NOT NULL
           ORDER BY started_at DESC LIMIT 15"""
    )
    for rid, status, ml, started in cur.fetchall():
        print(f"  {rid[:8]}… status={status} meta={mb(ml or 0)} started={started}")
except sqlite3.Error as e:
    print("failed:", e)

print("\n=== TRUNCATION MARKERS ===")
for table, col, needle in [
    ("automation_run_steps", "content", "result truncated for storage"),
    ("automation_runs", "metadata", "result truncated for storage"),
    ("automation_run_steps", "content", "_domeOmitted"),
]:
    try:
        cur.execute(f'SELECT COUNT(*) FROM "{table}" WHERE "{col}" LIKE ?', (f"%{needle}%",))
        n = cur.fetchone()[0]
        if n:
            print(f"  {table}.{col} '{needle}': {n}")
    except sqlite3.Error:
        pass

print("\n=== STEPS WITH content > 64KB (recent 20) ===")
try:
    cur.execute(
        """SELECT run_id, step_type, length(content), created_at
           FROM automation_run_steps
           WHERE content IS NOT NULL AND length(content) > 65536
           ORDER BY created_at DESC LIMIT 20"""
    )
    rows = cur.fetchall()
    cur.execute(
        "SELECT COUNT(*) FROM automation_run_steps WHERE content IS NOT NULL AND length(content) > 65536"
    )
    total = cur.fetchone()[0]
    print(f"total >64KB: {total}")
    for run_id, stype, ln, created in rows:
        print(f"  run={str(run_id)[:8]} type={stype} len={mb(ln)} created={created}")
except sqlite3.Error as e:
    print("failed:", e)

print("\n=== GITHUB ISSUES body sizes ===")
try:
    cur.execute(
        "SELECT COUNT(*), MAX(length(body)), AVG(length(body)) FROM github_issues WHERE body IS NOT NULL"
    )
    cnt, mx, avg = cur.fetchone()
    print(f"rows={cnt} max_body={mb(mx or 0)} avg_body={mb(avg or 0)}")
except sqlite3.Error as e:
    print("no github_issues or failed:", e)

conn.close()
