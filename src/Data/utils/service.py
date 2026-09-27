"""Small JSON bridge used by the Go server."""
import json
import sys

from storage import service


def main():
    try:
        request = json.load(sys.stdin)
        json.dump({"ok": True, **service(request)}, sys.stdout, ensure_ascii=False)
    except Exception as exc:
        json.dump({"ok": False, "error": str(exc)}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
