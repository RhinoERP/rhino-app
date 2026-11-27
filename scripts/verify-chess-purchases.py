#!/usr/bin/env python3
"""Read-only DEV postflight, including actual authenticated-role/RLS checks."""
import importlib.util
import json
import uuid
from pathlib import Path

import psycopg

SPEC = importlib.util.spec_from_file_location("purchases", Path(__file__).with_name("import-chess-purchases.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def claims(conn, user):
    conn.execute("SELECT set_config('request.jwt.claims',%s,true),set_config('request.jwt.claim.sub',%s,true)", (json.dumps({"sub": str(user), "role": "authenticated"}), str(user)))


def main():
    dsn = MODULE.database_url()
    if not dsn or MODULE.DEV not in dsn:
        raise ValueError("Only DEV is accepted")
    with psycopg.connect(dsn, connect_timeout=20, prepare_threshold=None) as conn:
        conn.execute("SET TRANSACTION READ ONLY")
        conn.execute("SET LOCAL statement_timeout='60s'")
        org = MODULE.ORG
        assert conn.execute("SELECT count(*) FROM public.historical_purchase_documents WHERE organization_id=%s", (org,)).fetchone()[0] == 27177
        assert conn.execute("SELECT count(*) FROM public.historical_purchase_document_items WHERE organization_id=%s", (org,)).fetchone()[0] == 57361
        assert conn.execute("SELECT count(*) FROM public.historical_purchase_documents WHERE organization_id=%s AND document_code='MI' AND purchase_sign<>0", (org,)).fetchone()[0] == 0
        assert conn.execute("SELECT count(*) FROM public.historical_purchase_documents WHERE organization_id=%s AND document_code IN ('NC','MI') AND debt_sign<>-1", (org,)).fetchone()[0] == 0
        before = MODULE.operational_snapshot(conn)
        summary = conn.execute("SELECT document_code,count(*),sum(total_amount),count(*) FILTER (WHERE total_amount=0) FROM public.historical_purchase_documents WHERE organization_id=%s GROUP BY document_code ORDER BY document_code", (org,)).fetchall()
        member = conn.execute("SELECT user_id FROM public.organization_members WHERE organization_id=%s AND is_active AND is_owner LIMIT 1", (org,)).fetchone()
        if not member:
            raise ValueError("No active owner available to test authorized RLS")
        conn.execute("SET LOCAL ROLE authenticated")
        claims(conn, uuid.uuid4())
        assert not conn.execute("SELECT public.can_read_chess_purchase_history(%s)", (org,)).fetchone()[0]
        assert conn.execute("SELECT count(*) FROM public.historical_purchase_documents WHERE organization_id=%s", (org,)).fetchone()[0] == 0
        assert conn.execute("SELECT count(*) FROM public.historical_purchase_document_items WHERE organization_id=%s", (org,)).fetchone()[0] == 0
        claims(conn, member[0])
        assert conn.execute("SELECT public.can_read_chess_purchase_history(%s)", (org,)).fetchone()[0]
        assert conn.execute("SELECT count(*) FROM public.historical_purchase_documents WHERE organization_id=%s", (org,)).fetchone()[0] == 27177
        assert not conn.execute("SELECT public.can_read_chess_purchase_history(%s)", (uuid.uuid4(),)).fetchone()[0]
        for table in ("historical_purchase_documents", "historical_purchase_document_items"):
            for operation in ("INSERT", "UPDATE", "DELETE", "TRUNCATE"):
                assert not conn.execute("SELECT has_table_privilege('authenticated',%s,%s)", (f"public.{table}", operation)).fetchone()[0]
        conn.execute("RESET ROLE")
        assert MODULE.operational_snapshot(conn) == before
        print(json.dumps({"by_type": [(kind, count, str(total), zeros) for kind, count, total, zeros in summary], "rls": "owner read, nonmember denied, foreign org denied, client mutations denied", "operational_snapshot": "unchanged"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
