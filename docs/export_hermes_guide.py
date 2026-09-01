"""Copy docs/Hermes Club App.pdf for the marketing site download link.

Role screenshots live in website/public/guide/roles/ and are referenced from
website/src/data/rolesInterfaces.json. Re-run this only to refresh the PDF copy.
"""

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "docs" / "Hermes Club App.pdf"
PUBLIC_PDF = ROOT / "website" / "public" / "docs" / "hermes-club-app.pdf"


def main():
    PUBLIC_PDF.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(PDF_PATH, PUBLIC_PDF)
    print(f"Copied PDF to {PUBLIC_PDF}")


if __name__ == "__main__":
    main()
