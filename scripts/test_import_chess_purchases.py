"""Meaningful importer regressions; no source workbook or DB required."""
import importlib.util
import unittest
from decimal import Decimal
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("purchases", Path(__file__).with_name("import-chess-purchases.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def row(**overrides):
    return {
        "Empresa": 1, "Comprobante": "FC", "Letra": "A", "Serie": 1,
        "Número": 32803, "Sucursal": 1, "Cuenta Acreedora": 33,
        "Descripción Cuenta Acreedora": "Proveedor test", "Fecha Comp.": "2020-01-01",
        "Fecha Imp.": "2020-01-01", "Artículo": 0, "Moneda": "$", "Cotización": 1,
        "_row": 2, **overrides,
    }


def normalize(rows, products=None):
    return MODULE.normalize_document(rows, "hash", "Hoja1", {"33": {}}, products or {"100": {}}, {"100": Decimal(6)})


class ImportTests(unittest.TestCase):
    def test_closing_row_not_line_tax_is_used_for_header(self):
        doc, lines, reason = normalize([
            row(**{"Artículo": 100, "Imp. Internos": 640.2, "Subtotal": 2560.8}),
            row(**{"_row": 3, "Imp. Internos": 6695.57, "Total Cpbte.": 52713.42}),
        ])
        self.assertIsNone(reason)
        self.assertEqual(doc["internal_tax_amount"], Decimal("6695.57"))
        self.assertEqual(lines[0]["raw_data"]["Imp. Internos"], 640.2)
        self.assertEqual([i["row_kind"] for i in lines], ["ARTICLE", "ACCOUNTING"])

    def test_split_accounting_rows_keep_subtotals_not_summed_headers(self):
        doc, lines, _ = normalize([
            row(**{"Subtotal": 999.35}),
            row(**{"_row": 3, "Subtotal": 191.65, "Neto Gravado": 999.35, "No Gravado": 191.65, "I.V.A.": 209.86, "Total Cpbte.": 1400.86}),
        ])
        self.assertEqual(doc["total_amount"], Decimal("1400.86"))
        self.assertEqual([i["subtotal"] for i in lines], [Decimal("999.35"), Decimal("191.65")])

    def test_zero_total_and_rounding_differences_are_preserved(self):
        doc, _, _ = normalize([row(**{"Comprobante": "ME", "Letra": "", "Total Bruto": 175.65, "Bonificación": 175.67, "Total Cpbte.": 0})])
        self.assertEqual(doc["total_amount"], 0)
        self.assertEqual(doc["gross_amount"] - doc["discount_amount"], Decimal("-0.02"))

    def test_mi_preserves_source_sign_and_is_excluded_from_purchase_metrics(self):
        doc, _, _ = normalize([row(**{"Comprobante": "MI", "Letra": "", "Total Cpbte.": -123})])
        self.assertEqual(doc["debt_sign"], -1)
        self.assertEqual(doc["purchase_sign"], 0)
        self.assertEqual(doc["total_amount"], -123)

    def test_unmapped_article_excludes_whole_document_not_partial_amount(self):
        doc, lines, reason = normalize([row(**{"Artículo": 999})])
        self.assertIsNone(doc)
        self.assertEqual(lines, [])
        self.assertEqual(reason, "unmapped")

    def test_zero_article_code_is_accounting_not_unmapped_product(self):
        doc, lines, reason = normalize([row(**{"Artículo": 0})])
        self.assertIsNone(reason)
        self.assertIsNotNone(doc)
        self.assertIsNone(lines[0]["product_id"])

    def test_supplier_is_part_of_identity(self):
        self.assertNotEqual(MODULE.identity(row()), MODULE.identity(row(**{"Cuenta Acreedora": 34})))

    def test_conflicting_closing_totals_abort(self):
        with self.assertRaises(ValueError):
            normalize([row(**{"Total Cpbte.": 100}), row(**{"_row": 3, "Total Cpbte.": 200})])

    def test_agreed_empty_records_are_skipped_but_new_amounts_abort(self):
        blank = row(**{"Serie": 13, "Número": 25944, "Fecha Comp.": "2020-01-23", "Bonif.": 100, "Tasa IVA Línea": 21})
        self.assertEqual(normalize([blank])[2], "empty")
        with self.assertRaises(ValueError):
            normalize([{**blank, "Total Cpbte.": 1}])

    def test_box_conversion_and_native_negative_line_are_preserved(self):
        _, lines, _ = normalize([row(**{"Artículo": 100, "Bultos": 2, "Unidades": 1, "Neto Línea": -10})])
        self.assertEqual(lines[0]["base_unit_quantity"], 13)
        self.assertEqual(lines[0]["net_amount"], -10)


if __name__ == "__main__":
    unittest.main()
