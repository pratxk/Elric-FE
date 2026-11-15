"""
Seed ONE flagged invoice through the backend's own store layer (never a
frontend fixture row). Used by the reload-flash stability test so the
dashboard has a non-zero pending-approval amount and a non-zero vendor
balance that must stay byte-identical across reloads.

Run with the backend venv python and TEST_DATABASE_URL set to the same
temp DB the test backend uses:
    TEST_DATABASE_URL=sqlite:////tmp/elric-playwright-test/elric.db \
      ../backend/.venv/bin/python tests/seed-invoice.py
Prints the created invoice id.
"""

import os
import sys
import uuid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend")))

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "sqlite:////tmp/elric-playwright-test/elric.db"
)

from app.infra.store import store  # noqa: E402

# v1.1 per-user scoping: a row with user_id NULL is invisible to every
# user ("legacy rows ... are never served"), so the seed must carry the
# test user's id or the dashboard will still show ₹0.00.
user_id = os.environ.get("SEED_USER_ID", "")
if not user_id:
    raise SystemExit("SEED_USER_ID is required (the test user's id)")

invoice_id = str(uuid.uuid4())
row = store.create_invoice(
    {
        "id": invoice_id,
        "user_id": user_id,
        "vendor_id": "VEN-SEED",
        "vendor_name": "Seed Vendor",
        "invoice_number": "SEED-0001",
        "invoice_date": "2026-11-14",
        "due_date": "2026-12-14",
        "status": "flagged",
        "subtotal": "84745.76",
        "tax_total": "15254.24",
        "total": "100000.00",
        "document_hash": f"seed-{uuid.uuid4().hex[:16]}",
        "lines": [
            {
                "description": "Seeded test line",
                "hsn_code": "9999",
                "qty": 1,
                "unit_price": 84745.76,
                "tax_rate_pct": 18,
            }
        ],
        "exceptions": [
            {
                "code": "PRICE_VARIANCE",
                "message": "Seeded variance for the stability test.",
                "severity": "medium",
            }
        ],
    }
)
print(row.id)
