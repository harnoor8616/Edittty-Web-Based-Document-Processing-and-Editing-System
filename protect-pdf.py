import sys

from pypdf import PdfReader, PdfWriter


def main() -> None:
    if len(sys.argv) != 4:
        raise ValueError("Usage: python protect-pdf.py <input> <output> <password>")

    input_path, output_path, password = sys.argv[1], sys.argv[2], sys.argv[3]
    if len(password) < 4:
        raise ValueError("Password must be at least 4 characters long.")

    reader = PdfReader(input_path)
    if reader.is_encrypted:
        raise ValueError("This PDF is already encrypted and cannot be protected again here.")

    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    try:
        if reader.metadata:
            writer.add_metadata({key: value for key, value in reader.metadata.items() if key and value})
    except Exception:
        pass

    writer.encrypt(password)

    with open(output_path, "wb") as output_file:
        writer.write(output_file)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
