#!/usr/bin/env python3
"""Validate/import the private CHESS purchases workbook. Defaults to dry-run.

Requires: pip install openpyxl "psycopg[binary]"
--apply is restricted to the DEV project and prueba-souverain organization.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
import uuid
from collections import Counter, defaultdict
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

csv.field_size_limit(sys.maxsize)

ROOT = Path(__file__).resolve().parents[2]
APP = Path(__file__).resolve().parents[1]
MASTERS = ROOT / "Chess/SOUVERAIN/CHESS_export"
DEFAULT_FILE = ROOT / "Souverain/COMPRAS 01-01-2015 A 26-11-2026.xlsx.xlsx"
ORG = uuid.UUID("bfccd3f4-d06b-4119-8cc4-f0213183c427")
DEV = "ahoffmttlkjtlxijjvna"
HEADER_AMOUNTS = {
    "gross_amount": "Total Bruto", "discount_amount": "Bonificación",
    "non_taxable_amount": "No Gravado", "net_taxable_amount": "Neto Gravado",
    "vat_amount": "I.V.A.", "internal_tax_amount": "Imp. Internos",
    "perception_iibb_amount": "Per. I.Brutos", "perception_3337_amount": "Per. 3337",
    "perception_5329_amount": "Per. 5329", "municipal_tax_amount": "Perc.Munic.",
    "total_amount": "Total Cpbte.",
}
LINE_AMOUNTS = {
    "boxes": "Bultos", "units": "Unidades", "unit_price": "Precio",
    "discount_percentage": "Bonif.", "net_amount": "Neto Línea",
    "vat_rate": "Tasa IVA Línea", "vat_amount": "Importe IVA Línea", "subtotal": "Subtotal",
}
EMPTY_DOCUMENTS = {
    ("FC", "A", "13", "25944", "2020-01-23"),
    ("FC", "A", "36", "1166", "2022-11-03"),
    ("ME", "", "2", "2025", "2025-05-30"),
}


def text(value):
    return "" if value is None else str(value).strip()


def code(value):
    value = text(value)
    if not value:
        return ""
    try:
        number = Decimal(value)
        if number == number.to_integral_value():
            return str(int(number))
    except Exception:
        pass
    return value.upper()


def number(value):
    result = Decimal(text(value).replace(",", ".") or "0")
    if not result.is_finite():
        raise ValueError(f"Invalid numeric value: {value}")
    return result


def day(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()[:10]
    return date.fromisoformat(text(value)[:10]).isoformat()


def identity(row):
    fields = ("Empresa", "Comprobante", "Letra", "Serie", "Número", "Sucursal", "Cuenta Acreedora")
    parts = [code(row.get(field)) for field in fields]
    if any(not parts[i] for i in (0, 1, 3, 4, 5, 6)):
        raise ValueError("Missing document identity field")
    return "|".join(parts)


def source_id(entity, key):
    return str(uuid.uuid5(ORG, f"CHESS:{entity}:{key}"))


def unique(rows, field, normalize=text, nonzero=False):
    values = {normalize(row.get(field)) for row in rows}
    if nonzero:
        values.discard(Decimal(0))
    if len(values) > 1:
        raise ValueError(f"Conflicting {field}: {values}")
    return next(iter(values), Decimal(0) if nonzero else "")


def read_master(path, key):
    with path.open(encoding="utf-8-sig", newline="") as source:
        return {code(row[key]): row for row in csv.DictReader(source, delimiter=";")}


def normalize_document(rows, fingerprint, sheet, suppliers, products, presentations):
    first = rows[0]
    key = identity(first)
    kind = code(first["Comprobante"])
    if kind not in {"FC", "NC", "ND", "ME", "MI"}:
        raise ValueError(f"Unknown document type {kind}")
    issue_date = unique(rows, "Fecha Comp.", day)
    empty_key = (kind, code(first["Letra"]), code(first["Serie"]), code(first["Número"]), issue_date)
    if empty_key in EMPTY_DOCUMENTS:
        amounts = set(HEADER_AMOUNTS.values()) | {"Subtotal", "Neto Línea", "Importe IVA Línea", "Bultos", "Unidades", "Precio"}
        if any(sum(number(row.get(f)) for row in rows) != 0 for f in amounts):
            raise ValueError(f"Agreed empty document has amounts: {key}")
        return None, [], "empty"
    supplier = code(first["Cuenta Acreedora"])
    missing_products = {code(row["Artículo"]) for row in rows if code(row["Artículo"]) not in {"", "0"} and code(row["Artículo"]) not in products}
    if supplier not in suppliers or missing_products:
        return None, [], "unmapped"
    doc_id = source_id("purchase-document", key)
    sign = -1 if kind in {"NC", "MI"} else 1
    currency = unique(rows, "Moneda")
    if currency != "$":
        raise ValueError(f"Unmapped currency {currency}")
    document = dict(
        id=doc_id, organization_id=str(ORG), source_key=key,
        company_code=code(first["Empresa"]), branch_code=code(first["Sucursal"]),
        document_code=kind, document_letter=code(first["Letra"]),
        document_series=int(code(first["Serie"])), document_number=int(code(first["Número"])),
        printed_number=f"{kind} {code(first['Letra'])} {int(code(first['Serie'])):05d}-{int(code(first['Número'])):08d}",
        supplier_id=source_id("supplier", supplier), supplier_chess_code=supplier,
        supplier_name=unique(rows, "Descripción Cuenta Acreedora"),
        document_date=issue_date, tax_date=unique(rows, "Fecha Imp.", day),
        debt_sign=sign, purchase_sign=0 if kind == "MI" else sign,
        is_fiscal=kind in {"FC", "NC", "ND"}, is_mipyme=code(first["Letra"]) == "M",
        currency="ARS", exchange_rate=unique(rows, "Cotización", number),
        payment_methods=sorted({text(r.get("Forma de Pago")) for r in rows} - {""}),
        payment_order_references=sorted({text(r.get("Ordenes de Pago")) for r in rows} - {""}),
        source_file_sha256=fingerprint, source_sheet=sheet,
    )
    # The closing row carries the voucher totals. Other rows can contain line
    # internal tax amounts in the same columns; never aggregate them as headers.
    closing_rows = [r for r in rows if number(r.get("Total Cpbte.")) != 0]
    if not closing_rows:
        closing_rows = [r for r in rows if number(r.get("Total Bruto")) != 0 or number(r.get("Bonificación")) != 0]
    if not closing_rows:
        closing_rows = [rows[-1]]
    for target, source in HEADER_AMOUNTS.items():
        document[target] = unique(closing_rows, source, number, nonzero=True)
    lines = []
    for row in rows:
        product = code(row["Artículo"])
        article = product not in {"", "0"}
        factor = presentations.get(product)
        amounts = {k: number(row.get(v)) for k, v in LINE_AMOUNTS.items()}
        raw = {k: (v.isoformat() if isinstance(v, (date, datetime)) else v) for k, v in row.items() if k != "_row"}
        lines.append(dict(
            id=source_id("purchase-line", f"{key}:{row['_row']}"), organization_id=str(ORG),
            historical_document_id=doc_id, source_row=row["_row"], row_kind="ARTICLE" if article else "ACCOUNTING",
            product_id=source_id("product", product) if article else None,
            product_chess_code=product if article else None,
            description=text(row.get("Descripción Artículo")), concept=text(row.get("Concepto")),
            units_per_box=factor if article else None,
            base_unit_quantity=(amounts["boxes"] * factor + amounts["units"]) if article and factor else None,
            cost_center=text(row.get("Descripción Centro Costo")), expense=text(row.get("Descripción Egreso")),
            category=text(row.get("Descripción Rubro")), raw_data=raw, **amounts,
        ))
    return document, lines, None


def prepare(path):
    from openpyxl import load_workbook
    fingerprint = hashlib.sha256(path.read_bytes()).hexdigest()
    suppliers = read_master(MASTERS / "CHESS_CxP_Proveedores_ttproveedor.csv", "codprov")
    products = read_master(MASTERS / "CHESS_Inventarios_Articulos.csv", "codart")
    presentation_rows = read_master(MASTERS / "CHESS_Inventarios_Articulos_Presentaciones.csv", "codart")
    presentations = {k: number(v["cant"]) for k, v in presentation_rows.items() if number(v["cant"]) > 0}
    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet = workbook.worksheets[0]
    iterator = sheet.iter_rows(values_only=True)
    headers = [text(v) for v in next(iterator)]
    required = set(HEADER_AMOUNTS.values()) | set(LINE_AMOUNTS.values()) | {"Empresa", "Comprobante", "Letra", "Serie", "Número", "Sucursal", "Cuenta Acreedora", "Descripción Cuenta Acreedora", "Fecha Comp.", "Fecha Imp.", "Artículo", "Moneda", "Cotización", "Ordenes de Pago"}
    if required - set(headers):
        raise ValueError(f"Missing Excel headers: {required - set(headers)}")
    grouped = defaultdict(list)
    for row_number, values in enumerate(iterator, 2):
        if all(v is None for v in values):
            continue
        row = {**dict(zip(headers, values)), "_row": row_number}
        grouped[identity(row)].append(row)
    documents, items, exclusions = [], [], []
    for key, rows in grouped.items():
        try:
            document, lines, reason = normalize_document(rows, fingerprint, sheet.title, suppliers, products, presentations)
        except Exception as error:
            raise ValueError(f"{key}: {error}") from error
        if reason:
            exclusions.append({"key": key, "reason": reason, "rows": len(rows)})
        else:
            documents.append(document)
            items.extend(lines)
    workbook.close()
    return documents, items, exclusions


def database_url():
    values = dict(os.environ)
    for path in (APP / ".env.local", ROOT / ".env.local"):
        if path.is_file():
            for line in path.read_text(encoding="utf-8-sig").splitlines():
                key, sep, value = line.strip().removeprefix("export ").partition("=")
                if sep and key.strip() in {"DATABASE_URL", "SOUVERAIN_DATABASE_URL"}:
                    values.setdefault(key.strip(), value.strip().strip("\"'"))
    return values.get("SOUVERAIN_DATABASE_URL") or values.get("DATABASE_URL")


def operational_snapshot(conn):
    result = {}
    for table in ("purchase_orders", "supplier_invoices", "accounts_payable", "supplier_credits", "stock_lots", "inventory_movements", "sales_orders", "accounts_receivable", "customer_credits", "historical_sales_documents"):
        if conn.execute("SELECT to_regclass(%s)", (f"public.{table}",)).fetchone()[0]:
            result[table] = conn.execute(f"SELECT count(*), md5(COALESCE(string_agg(t::text, '' ORDER BY id),'')) FROM public.{table} t WHERE organization_id=%s", (ORG,)).fetchone()
    return result


def persist(conn, documents, items):
    from psycopg.types.json import Jsonb
    hashes = {row[0] for row in conn.execute("SELECT DISTINCT source_file_sha256 FROM public.historical_purchase_documents WHERE organization_id=%s", (ORG,))}
    if hashes and hashes != {documents[0]["source_file_sha256"]}:
        raise ValueError("Source workbook changed; review before replacing a previous import")
    for table, records in (("historical_purchase_documents", documents), ("historical_purchase_document_items", items)):
        if not records:
            continue
        columns = list(records[0])
        update = ",".join(f"{c}=EXCLUDED.{c}" for c in columns if c not in {"id", "organization_id"})
        stage = f"load_{table}"
        conn.execute(f"CREATE TEMP TABLE {stage} (LIKE public.{table} INCLUDING DEFAULTS) ON COMMIT DROP")
        with conn.cursor() as cur:
            with cur.copy(f"COPY {stage} ({','.join(columns)}) FROM STDIN") as copy:
                for record in records:
                    copy.write_row(tuple(Jsonb(record[c]) if c == "raw_data" else record[c] for c in columns))
        conn.execute(f"INSERT INTO public.{table} ({','.join(columns)}) SELECT {','.join(columns)} FROM {stage} ON CONFLICT (id) DO UPDATE SET {update}")
        print(f"Prepared {table}: {len(records)} rows", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, default=DEFAULT_FILE)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--check-db", action="store_true")
    parser.add_argument("--migrate", action="store_true", help="Apply the additive historical migration, requires --apply")
    args = parser.parse_args()
    if args.migrate and not args.apply:
        parser.error("--migrate requires --apply")
    documents, items, exclusions = prepare(args.file)
    if not documents:
        raise ValueError("No importable documents")
    totals = defaultdict(Decimal)
    for doc in documents:
        totals[doc["document_code"]] += abs(doc["total_amount"]) * doc["debt_sign"]
    print(json.dumps({"documents": len(documents), "rows": len(items), "by_type": dict(Counter(d["document_code"] for d in documents)), "excluded": dict(Counter(e["reason"] for e in exclusions)), "excluded_rows": sum(e["rows"] for e in exclusions), "signed_totals_ARS": {k: str(v) for k, v in totals.items()}}, ensure_ascii=False, indent=2), flush=True)
    if not (args.apply or args.check_db):
        return
    import psycopg
    dsn = database_url()
    if not dsn or DEV not in dsn:
        raise ValueError("Only the configured DEV project is accepted; no connection printed")
    with psycopg.connect(dsn, connect_timeout=20, prepare_threshold=None) as conn:
        conn.execute("SET LOCAL statement_timeout = '180s'")
        org = conn.execute("SELECT slug FROM public.organizations WHERE id=%s", (ORG,)).fetchone()
        if org != ("prueba-souverain",):
            raise ValueError("Unexpected target organization")
        supplier_ids = {str(r[0]) for r in conn.execute("SELECT id FROM public.suppliers WHERE organization_id=%s", (ORG,))}
        product_ids = {str(r[0]) for r in conn.execute("SELECT id FROM public.products WHERE organization_id=%s", (ORG,))}
        if any(d["supplier_id"] not in supplier_ids for d in documents) or any(i["product_id"] and i["product_id"] not in product_ids for i in items):
            raise ValueError("Source-to-DEV master mapping mismatch; aborting")
        before = operational_snapshot(conn)
        if not args.apply:
            print("DEV mapping verified; dry-run, no writes")
            return
        if args.migrate:
            version = "20261127120000"
            applied = conn.execute("SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=%s", (version,)).fetchone()
            if not applied:
                migration = APP / "supabase/migrations/20261127120000_chess_historical_purchases.sql"
                sql = migration.read_text(encoding="utf-8")
                conn.execute(sql)
                conn.execute("INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (%s,%s,%s)", (version, "chess_historical_purchases", [sql]))
        persist(conn, documents, items)
        if operational_snapshot(conn) != before:
            raise ValueError("Operational snapshot changed; rolling back")
        counts = conn.execute("SELECT count(*) FROM public.historical_purchase_documents WHERE organization_id=%s", (ORG,)).fetchone()[0]
        line_count = conn.execute("SELECT count(*) FROM public.historical_purchase_document_items WHERE organization_id=%s", (ORG,)).fetchone()[0]
        if (counts, line_count) != (len(documents), len(items)):
            raise ValueError("Unexpected persisted counts; rolling back")
        print(f"DEV verified: {counts} documents, {line_count} rows. Operational snapshot unchanged.")


if __name__ == "__main__":
    main()
