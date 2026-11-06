import json
import os
import urllib.error
import urllib.request


def _load_local_env() -> None:
    path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            if key.startswith("export "):
                key = key[len("export ") :].strip()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
                value = value[1:-1]
            os.environ.setdefault(key, value)


_load_local_env()


def mail_configured() -> bool:
    return bool(os.getenv("RESEND_API_KEY"))


def send_code_email(to_email: str, code: str, purpose: str) -> bool:
    subject = "Your AWSSBG secret code"
    body = f"Hey! AWSSBG here! This is your secret code {code}"
    from_addr = os.getenv("MAIL_FROM", "AWSSBGJRU <noreply@keithspeirs.dev>")

    key = os.getenv("RESEND_API_KEY")
    if not key:
        print(f"[mail] {purpose} code for {to_email}: {code}")
        return False

    payload = json.dumps(
        {
            "from": from_addr,
            "to": [to_email],
            "subject": subject,
            "text": body,
        }
    ).encode()
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "User-Agent": "AWSSBGJRU/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            print(f"[mail] sent from {from_addr} status={res.status}")
            return 200 <= res.status < 300
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        print(f"[mail] resend {e.code}: {detail}")
        return False
    except urllib.error.URLError as e:
        print(f"[mail] send failed: {e}")
        return False
