#!/usr/bin/env python3
"""Emergency repair: reset bloated calendar_events.reminders + VACUUM."""
import os
import sqlite3
import sys
import time

DB = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get("APPDATA", ""), "dome", "dome.db")
DEFAULT = '[{"minutes":15}]'
THRESHOLD = 8192

def mb(n):
    return f"{n/1e6:.2f} MB"

if not os.path.isfile(DB):
    print("DB not found:", DB)
    sys.exit(1)

before = os.path.getsize(DB)
conn = sqlite3.connect(DB)
cur = conn.cursor()

cur.execute(
    "SELECT COUNT(*) FROM calendar_events WHERE reminders IS NOT NULL AND length(reminders) > ?",
    (THRESHOLD,),
)
bloated = cur.fetchone()[0]
print(f"Bloated reminder rows: {bloated}")

if bloated:
    now = int(time.time() * 1000)
    cur.execute(
        "UPDATE calendar_events SET reminders = ?, updated_at = ? WHERE reminders IS NOT NULL AND length(reminders) > ?",
        (DEFAULT, now, THRESHOLD),
    )
    conn.commit()
    print(f"Repaired rows: {cur.rowcount}")

print("Running VACUUM (may take a minute)…")
started = time.time()
cur.execute("VACUUM")
conn.commit()
conn.close()
after = os.path.getsize(DB)
print(f"Done in {time.time()-started:.1f}s")
print(f"Before: {mb(before)}")
print(f"After:  {mb(after)}")
print(f"Saved:  {mb(before - after)}")
