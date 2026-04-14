"""Gmail CLI — read, search, reply, compose via Gmail API (pure stdlib)."""
import base64, http.server, json, os, sys, time, urllib.parse, urllib.request, ssl, webbrowser

CREDS_FILE = os.path.join(os.path.expanduser("~"), "Downloads",
    "client_secret_84524660788-hjerd1r1uakugnkr93are6r7br3mmmjq.apps.googleusercontent.com.json")

# Global token path — shared with VS Code extension
_GLOBAL_DIR = os.path.join(os.path.expanduser("~"), ".copilot-gmail")
os.makedirs(_GLOBAL_DIR, exist_ok=True)
TOKEN_FILE = os.path.join(_GLOBAL_DIR, "token.json")
_WS_TOKEN = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".gmail_token.json")
SCOPES = (
    "https://www.googleapis.com/auth/gmail.readonly "
    "https://www.googleapis.com/auth/gmail.send "
    "https://www.googleapis.com/auth/gmail.modify "
    "https://www.googleapis.com/auth/userinfo.email"
)

# ── helpers ──────────────────────────────────────────────────

ctx = ssl.create_default_context()

def api_get(url: str, token: str) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, context=ctx) as r:
        return json.loads(r.read())

def api_post(url: str, data: dict) -> dict:
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, context=ctx) as r:
        return json.loads(r.read())

def load_creds():
    with open(CREDS_FILE) as f:
        return json.load(f)["installed"]

# ── OAuth ────────────────────────────────────────────────────

def get_token() -> str:
    # Try cached token
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE) as f:
            data = json.load(f)
        # Try refresh
        creds = load_creds()
        try:
            tokens = api_post("https://oauth2.googleapis.com/token", {
                "client_id": creds["client_id"],
                "client_secret": creds["client_secret"],
                "refresh_token": data["refresh_token"],
                "grant_type": "refresh_token",
            })
            data["access_token"] = tokens["access_token"]
            data["expires_in"] = tokens.get("expires_in", 3599)
            data["saved_at"] = int(time.time() * 1000)
            for p in (TOKEN_FILE, _WS_TOKEN):
                with open(p, "w") as f:
                    json.dump(data, f)
            return tokens["access_token"]
        except Exception:
            pass  # Fall through to full auth

    # Full OAuth flow
    creds = load_creds()
    code_holder = {}
    port_holder = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if "code" in qs:
                code_holder["code"] = qs["code"][0]
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(b"<h2>Authenticated! You can close this tab.</h2>")
            else:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Error")
        def log_message(self, *a): pass

    srv = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    port_holder["port"] = srv.server_address[1]
    redirect_uri = f"http://127.0.0.1:{port_holder['port']}"

    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={creds['client_id']}"
        f"&redirect_uri={urllib.parse.quote(redirect_uri)}"
        f"&response_type=code&scope={urllib.parse.quote(SCOPES)}"
        f"&access_type=offline&prompt=consent"
    )

    print(f"\n  Opening browser for Google sign-in...\n")
    webbrowser.open(auth_url)
    srv.handle_request()  # Wait for callback
    srv.server_close()

    if "code" not in code_holder:
        print("ERROR: OAuth failed."); sys.exit(1)

    tokens = api_post("https://oauth2.googleapis.com/token", {
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "code": code_holder["code"],
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    })

    tokens["saved_at"] = int(time.time() * 1000)
    for p in (TOKEN_FILE, _WS_TOKEN):
        with open(p, "w") as f:
            json.dump(tokens, f)
    return tokens["access_token"]

# ── Gmail reader ─────────────────────────────────────────────

def hdr(headers, name):
    for h in headers:
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""

def get_body(payload):
    import base64
    if payload.get("body", {}).get("data"):
        return base64.urlsafe_b64decode(payload["body"]["data"] + "==").decode("utf-8", errors="replace")
    for part in payload.get("parts", []):
        if part.get("mimeType") == "text/plain" and part.get("body", {}).get("data"):
            return base64.urlsafe_b64decode(part["body"]["data"] + "==").decode("utf-8", errors="replace")
    # Try nested parts
    for part in payload.get("parts", []):
        result = get_body(part)
        if result:
            return result
    return "(no text body)"

def search_and_display(token: str, query: str, label: str):
    print(f"\n{'='*70}")
    print(f"  SEARCH: {label}")
    print(f"  Query: {query}")
    print(f"{'='*70}")

    url = f"https://www.googleapis.com/gmail/v1/users/me/messages?q={urllib.parse.quote(query)}&maxResults=15"
    result = api_get(url, token)

    messages = result.get("messages", [])
    if not messages:
        print("  (no emails found)\n")
        return

    print(f"  Found {len(messages)} emails\n")

    for i, stub in enumerate(messages):
        try:
            msg = api_get(f"https://www.googleapis.com/gmail/v1/users/me/messages/{stub['id']}?format=full", token)
            headers = msg.get("payload", {}).get("headers", [])
            subject = hdr(headers, "Subject") or "(no subject)"
            from_addr = hdr(headers, "From")
            to_addr = hdr(headers, "To")
            date = hdr(headers, "Date")
            body = get_body(msg.get("payload", {}))

            # Truncate body for readability
            if len(body) > 800:
                body = body[:800] + "..."

            print(f"  ── Email {i+1} ──────────────────────────────────────")
            print(f"  From:    {from_addr}")
            print(f"  To:      {to_addr}")
            print(f"  Date:    {date}")
            print(f"  Subject: {subject}")
            print(f"  ─────────────────────────────────────────────────")
            print(f"  {body}")
            print()
        except Exception as e:
            print(f"  (failed to fetch message {stub['id']}: {e})")

# ── Send / Reply ─────────────────────────────────────────────

def build_raw_email(to, subject, body, in_reply_to=None, thread_id=None):
    lines = [f"To: {to}", f"Subject: {subject}",
             'Content-Type: text/plain; charset="UTF-8"', "MIME-Version: 1.0"]
    if in_reply_to:
        lines.append(f"In-Reply-To: {in_reply_to}")
        lines.append(f"References: {in_reply_to}")
    lines.extend(["", body])
    return base64.urlsafe_b64encode("\r\n".join(lines).encode()).decode()

def send_email(token, to, subject, body):
    raw = build_raw_email(to, subject, body)
    payload = json.dumps({"raw": raw}).encode()
    req = urllib.request.Request(
        "https://www.googleapis.com/gmail/v1/users/me/messages/send",
        data=payload,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, context=ctx) as r:
        result = json.loads(r.read())
    print(f"\n  Email sent! Message ID: {result.get('id')}")

def reply_to_email(token, message_id, reply_body):
    msg = api_get(f"https://www.googleapis.com/gmail/v1/users/me/messages/{message_id}?format=full", token)
    headers = msg.get("payload", {}).get("headers", [])
    from_addr = hdr(headers, "From")
    subject = hdr(headers, "Subject")
    msg_id_header = hdr(headers, "Message-Id") or message_id
    thread_id = msg.get("threadId")

    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"

    raw = build_raw_email(from_addr, subject, reply_body, msg_id_header, thread_id)
    payload = json.dumps({"raw": raw, "threadId": thread_id}).encode()
    req = urllib.request.Request(
        "https://www.googleapis.com/gmail/v1/users/me/messages/send",
        data=payload,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, context=ctx) as r:
        result = json.loads(r.read())
    print(f"\n  Reply sent to {from_addr}! Message ID: {result.get('id')}")

def read_single(token, message_id):
    msg = api_get(f"https://www.googleapis.com/gmail/v1/users/me/messages/{message_id}?format=full", token)
    headers = msg.get("payload", {}).get("headers", [])
    print(f"\n  From:    {hdr(headers, 'From')}")
    print(f"  To:      {hdr(headers, 'To')}")
    print(f"  Date:    {hdr(headers, 'Date')}")
    print(f"  Subject: {hdr(headers, 'Subject')}")
    print(f"  ─────────────────────────────────────────────────")
    print(f"  {get_body(msg.get('payload', {}))}\n")

# ── Main ─────────────────────────────────────────────────────

def print_usage():
    print("""
  Gmail CLI — Usage:
    py -3 tools/gmail_reader.py inbox              Show recent inbox emails
    py -3 tools/gmail_reader.py search <query>     Search emails
    py -3 tools/gmail_reader.py read <messageId>   Read a specific email
    py -3 tools/gmail_reader.py reply <messageId> <body>   Reply to an email
    py -3 tools/gmail_reader.py send <to> <subject> <body> Send new email
    py -3 tools/gmail_reader.py labels             List all labels
""")

if __name__ == "__main__":
    if not os.path.exists(CREDS_FILE):
        print(f"ERROR: Credentials file not found at {CREDS_FILE}")
        sys.exit(1)

    # Need new scopes for send — delete old token to re-auth
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE) as f:
            data = json.load(f)
        if "scope" not in data or "gmail.send" not in data.get("scope", ""):
            print("Upgrading token for send/reply permissions...")
            os.remove(TOKEN_FILE)

    token = get_token()
    user = api_get("https://www.googleapis.com/oauth2/v2/userinfo", token)
    print(f"Logged in as: {user.get('email', 'unknown')}")

    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"

    if cmd == "inbox":
        search_and_display(token, "in:inbox", "Inbox")
    elif cmd == "search" and len(sys.argv) > 2:
        q = " ".join(sys.argv[2:])
        search_and_display(token, q, f"Search: {q}")
    elif cmd == "read" and len(sys.argv) > 2:
        read_single(token, sys.argv[2])
    elif cmd == "reply" and len(sys.argv) > 3:
        reply_to_email(token, sys.argv[2], " ".join(sys.argv[3:]))
    elif cmd == "send" and len(sys.argv) > 4:
        send_email(token, sys.argv[2], sys.argv[3], " ".join(sys.argv[4:]))
    elif cmd == "labels":
        labels = api_get("https://www.googleapis.com/gmail/v1/users/me/labels", token)
        for l in labels.get("labels", []):
            print(f"  {l['name']} ({l['type']})")
    else:
        print_usage()
