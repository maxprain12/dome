#!/usr/bin/env python3
import os, sqlite3, sys

DB = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get("APPDATA", ""), "dome", "dome.db")

def mb(n):
    return f"{n/1e6:.2f} MB"

conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
cur = conn.cursor()

print("=== calendar_events column sizes (per row) ===")
cur.execute("""
SELECT id, title, source,
       length(description) AS desc_len,
       length(metadata) AS meta_len,
       length(reminders) AS rem_len,
       length(location) AS loc_len,
       updated_at
FROM calendar_events
ORDER BY (COALESCE(length(description),0)+COALESCE(length(metadata),0)) DESC
""")

for row in cur.fetchall():
    rid, title, source, dl, ml, rl, ll, upd = row
    total = (dl or 0) + (ml or 0) + (rl or 0) + (ll or 0)
    print(f"id={rid[:12]}… source={source} title={str(title)[:50]!r}")
    print(f"  desc={mb(dl or 0)} meta={mb(ml or 0)} rem={mb(rl or 0)} loc={mb(ll or 0)} total={mb(total)} updated={upd}")

print("\n=== metadata prefix sample (largest row) ===")
cur.execute("""
SELECT id, source, substr(metadata,1,500), length(metadata)
FROM calendar_events ORDER BY length(metadata) DESC LIMIT 1
""")
row = cur.fetchone()
if row:
    print(f"id={row[0]} source={row[1]} len={mb(row[3])}")
    print(row[2])

print("\n=== description prefix sample (largest row) ===")
cur.execute("""
SELECT id, source, substr(description,1,500), length(description)
FROM calendar_events ORDER BY length(description) DESC LIMIT 1
""")
row = cur.fetchone()
if row:
    print(f"id={row[0]} source={row[1]} len={mb(row[3])}")
    print(row[2])

conn.close()
