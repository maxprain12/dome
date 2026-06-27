#!/usr/bin/env python3
import os, sqlite3, sys
DB = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get("APPDATA", ""), "dome", "dome.db")
conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
cur = conn.cursor()
cur.execute("SELECT id, title, length(reminders), substr(reminders,1,200) FROM calendar_events ORDER BY length(reminders) DESC LIMIT 3")
for rid, title, ln, prefix in cur.fetchall():
    print("id:", rid)
    print("title:", title)
    print("len:", ln)
    print("prefix:", repr(prefix[:200]))
    print("---")
conn.close()
