#!/usr/bin/env python3
"""
YAMTAM Mail Reader — check Gmail for unread emails via IMAP.

Usage:
  python3 tools/check-mail.py              # show unread count + last 5
  python3 tools/check-mail.py --all        # show all unread
  python3 tools/check-mail.py --count      # unread count only
  python3 tools/check-mail.py --from addr  # filter by sender

Requires env:
  GMAIL_APP_PASSWORD  — 16-char Google App Password
  GMAIL_USER          — Gmail address (default: phamlongh230@gmail.com)
"""

import imaplib
import email
import os
import sys
import argparse
from email.header import decode_header
from datetime import datetime

GMAIL_USER = os.environ.get("GMAIL_USER", "phamlongh230@gmail.com")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")
IMAP_HOST = "imap.gmail.com"


def decode_str(s):
    if not s:
        return ""
    parts = decode_header(s)
    result = []
    for part, enc in parts:
        if isinstance(part, bytes):
            result.append(part.decode(enc or "utf-8", errors="replace"))
        else:
            result.append(str(part))
    return "".join(result)


def connect():
    if not GMAIL_APP_PASSWORD:
        print("ERROR: GMAIL_APP_PASSWORD not set.")
        print("Set it with: export GMAIL_APP_PASSWORD='your-app-password'")
        print("Get one at: https://myaccount.google.com/apppasswords")
        sys.exit(1)
    mail = imaplib.IMAP4_SSL(IMAP_HOST)
    mail.login(GMAIL_USER, GMAIL_APP_PASSWORD)
    return mail


def get_unread(mail, filter_from=None, limit=5):
    mail.select("INBOX")
    search = "UNSEEN"
    _, data = mail.search(None, search)
    ids = data[0].split()

    if not ids:
        return []

    # newest first
    ids = list(reversed(ids))
    if limit:
        ids = ids[:limit]

    results = []
    for uid in ids:
        _, msg_data = mail.fetch(uid, "(RFC822)")
        raw = msg_data[0][1]
        msg = email.message_from_bytes(raw)

        sender = decode_str(msg.get("From", ""))
        subject = decode_str(msg.get("Subject", "(no subject)"))
        date_str = msg.get("Date", "")

        if filter_from and filter_from.lower() not in sender.lower():
            continue

        # Parse date
        try:
            from email.utils import parsedate_to_datetime
            dt = parsedate_to_datetime(date_str)
            date_fmt = dt.strftime("%d/%m %H:%M")
        except Exception:
            date_fmt = date_str[:16]

        # Get snippet
        snippet = ""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    try:
                        snippet = part.get_payload(decode=True).decode("utf-8", errors="replace")[:120]
                    except Exception:
                        pass
                    break
        else:
            try:
                snippet = msg.get_payload(decode=True).decode("utf-8", errors="replace")[:120]
            except Exception:
                pass

        snippet = snippet.replace("\n", " ").replace("\r", "").strip()

        results.append({
            "from": sender,
            "subject": subject,
            "date": date_fmt,
            "snippet": snippet,
        })

    return results


def main():
    parser = argparse.ArgumentParser(description="YAMTAM Mail Reader")
    parser.add_argument("--all", action="store_true", help="Show all unread (no limit)")
    parser.add_argument("--count", action="store_true", help="Unread count only")
    parser.add_argument("--from", dest="filter_from", help="Filter by sender")
    args = parser.parse_args()

    mail = connect()
    mail.select("INBOX")
    _, data = mail.search(None, "UNSEEN")
    ids = data[0].split()
    total = len(ids)

    if args.count:
        print(f"Unread: {total}")
        mail.logout()
        return

    if total == 0:
        print(f"✅ Inbox sạch — không có thư mới.")
        mail.logout()
        return

    limit = None if args.all else 5
    emails = get_unread(mail, filter_from=args.filter_from, limit=limit)
    mail.logout()

    print(f"📬 {total} thư chưa đọc ({len(emails)} hiển thị)\n")
    print("─" * 60)
    for i, e in enumerate(emails, 1):
        print(f"[{i}] {e['date']}  {e['subject']}")
        print(f"     From: {e['from']}")
        if e["snippet"]:
            print(f"     {e['snippet'][:100]}...")
        print()


if __name__ == "__main__":
    main()
