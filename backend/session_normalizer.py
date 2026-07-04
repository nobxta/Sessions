"""
Session file normalizer.

Some .session files are produced by a newer / modified Telethon build whose
`sessions` SQLite table has a different column count than the Telethon version
installed here. When that happens, Telethon fails at load time with errors like
"too many values to unpack (expected 5)" and the session is unusable in EVERY
function (validate, spambot, 2fa, age check, joiner, ...).

This module detects such files and rebuilds a clean, compatible session file
from the essential auth data (dc + auth_key) using the installed Telethon's own
schema, so the session works everywhere. Files that Telethon can already open
are left untouched.
"""

import os
import sqlite3
import logging

logger = logging.getLogger(__name__)

SESSION_EXT = ".session"


def _base_path(path: str) -> str:
    return path[:-len(SESSION_EXT)] if path.endswith(SESSION_EXT) else path


def _read_auth_from_sqlite(path: str):
    """
    Read dc_id, server_address, port, auth_key from a .session sqlite file
    BY COLUMN NAME (robust against extra/reordered columns).
    Returns a dict or None.
    """
    conn = sqlite3.connect(path)
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(sessions)")
        cols = [row[1] for row in cur.fetchall()]
        if not cols:
            return None
        required = ["dc_id", "server_address", "port", "auth_key"]
        if not all(r in cols for r in required):
            return None
        cur.execute(
            "SELECT dc_id, server_address, port, auth_key FROM sessions "
            "WHERE auth_key IS NOT NULL LIMIT 1"
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "dc_id": row[0],
            "server_address": row[1],
            "port": row[2],
            "auth_key": row[3],
        }
    finally:
        conn.close()


def _telethon_can_open(path: str) -> bool:
    """
    Return True if the installed Telethon can open this session as-is.

    We DELIBERATELY avoid constructing a Telethon SQLiteSession here: on a
    broken file its __init__ opens an sqlite connection and then raises during
    the row unpack, leaking the open handle. On Windows that lingering handle
    locks the file and blocks the later os.replace. Instead we mimic Telethon's
    load with our own connection (which we always close): Telethon does
    `select * from sessions` and unpacks the row into exactly 5 values, so a
    `sessions` table without exactly 5 columns is what crashes it.
    """
    conn = None
    try:
        conn = sqlite3.connect(path)
        cur = conn.cursor()
        # Must have a sessions table with exactly 5 columns.
        cur.execute("PRAGMA table_info(sessions)")
        cols = cur.fetchall()
        if len(cols) != 5:
            return False
        # And the row (if any) must be readable.
        cur.execute("select * from sessions")
        cur.fetchone()
        return True
    except Exception:
        return False
    finally:
        try:
            if conn is not None:
                conn.close()
        except Exception:
            pass


def normalize_session_file(path: str) -> bool:
    """
    Ensure `path` is a Telethon-compatible .session file.

    - If Telethon can already open it: no-op, return True.
    - If not: rebuild from auth data using installed Telethon schema,
      replace the original file in place. Return True on success.
    - On any failure: leave the original untouched, return False.
    """
    if not path or not os.path.isfile(path):
        return False

    try:
        if _telethon_can_open(path):
            return True
    except Exception as e:
        logger.warning("[SESSION NORMALIZE] open-check failed for %s: %s", path, e)

    logger.warning("[SESSION NORMALIZE] %s incompatible with installed Telethon; repairing", path)

    try:
        info = _read_auth_from_sqlite(path)
    except Exception as e:
        logger.error("[SESSION NORMALIZE] cannot read auth from %s: %s", path, e)
        return False

    if not info or not info.get("auth_key"):
        logger.error("[SESSION NORMALIZE] no usable auth data in %s", path)
        return False

    # Repair IN PLACE using our own sqlite connection (fully managed + closed).
    # This avoids os.replace(), which on Windows can fail with a locked target,
    # and rebuilds the exact schema the installed Telethon (CURRENT_VERSION 7)
    # expects. Other tables (entities/sent_files/update_state) are recreated if
    # missing; Telethon repopulates their contents on connect.
    conn = None
    try:
        conn = sqlite3.connect(path)
        cur = conn.cursor()

        # Rebuild the sessions table with exactly 5 columns.
        cur.execute("DROP TABLE IF EXISTS sessions")
        cur.execute(
            "CREATE TABLE sessions ("
            "dc_id integer primary key,"
            "server_address text,"
            "port integer,"
            "auth_key blob,"
            "takeout_id integer)"
        )
        cur.execute(
            "INSERT INTO sessions (dc_id, server_address, port, auth_key, takeout_id) "
            "VALUES (?, ?, ?, ?, NULL)",
            (int(info["dc_id"]), info["server_address"], int(info["port"]),
             sqlite3.Binary(bytes(info["auth_key"]))),
        )

        # Ensure the supporting tables exist (Telethon needs these to exist).
        cur.execute(
            "CREATE TABLE IF NOT EXISTS entities ("
            "id integer primary key, hash integer not null, username text,"
            "phone integer, name text, date integer)"
        )
        cur.execute(
            "CREATE TABLE IF NOT EXISTS sent_files ("
            "md5_digest blob, file_size integer, type integer, id integer, hash integer,"
            "primary key(md5_digest, file_size, type))"
        )
        cur.execute(
            "CREATE TABLE IF NOT EXISTS update_state ("
            "id integer primary key, pts integer, qts integer, date integer, seq integer)"
        )

        # Normalize the version table to the installed Telethon's current version.
        cur.execute("DROP TABLE IF EXISTS version")
        cur.execute("CREATE TABLE version (version integer primary key)")
        cur.execute("INSERT INTO version VALUES (7)")

        conn.commit()
    except Exception as e:
        logger.error("[SESSION NORMALIZE] in-place rebuild failed for %s: %s", path, e)
        return False
    finally:
        try:
            if conn is not None:
                conn.close()
        except Exception:
            pass

    # Verify the repaired file now loads.
    if _telethon_can_open(path):
        logger.info("[SESSION NORMALIZE] repaired %s", path)
        return True
    logger.error("[SESSION NORMALIZE] repair did not take effect for %s", path)
    return False


def normalize_many(paths) -> dict:
    """Normalize a list of session paths. Returns {path: bool}."""
    out = {}
    for p in paths:
        try:
            out[p] = normalize_session_file(p)
        except Exception as e:
            logger.error("[SESSION NORMALIZE] unexpected error for %s: %s", p, e)
            out[p] = False
    return out
