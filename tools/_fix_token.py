"""Fix token: refresh access_token and add email field."""
import json, urllib.request, urllib.parse, ssl, time

ctx = ssl.create_default_context()
TOKEN = r"C:\Users\akash\.copilot-gmail\token.json"
CREDS = r"C:\Users\akash\Downloads\client_secret_84524660788-hjerd1r1uakugnkr93are6r7br3mmmjq.apps.googleusercontent.com.json"
WS_TOKEN = r"c:\users\akash\work\copilot-minimax\tools\.gmail_token.json"

t = json.load(open(TOKEN))
creds = json.load(open(CREDS))["installed"]

body = urllib.parse.urlencode({
    "client_id": creds["client_id"],
    "client_secret": creds["client_secret"],
    "refresh_token": t["refresh_token"],
    "grant_type": "refresh_token",
}).encode()
req = urllib.request.Request("https://oauth2.googleapis.com/token", data=body,
    headers={"Content-Type": "application/x-www-form-urlencoded"})
r = json.loads(urllib.request.urlopen(req, context=ctx).read())

t["access_token"] = r["access_token"]
t["expires_in"] = r.get("expires_in", 3599)
t["saved_at"] = int(time.time() * 1000)

req2 = urllib.request.Request("https://www.googleapis.com/oauth2/v2/userinfo",
    headers={"Authorization": f"Bearer {r['access_token']}"})
user = json.loads(urllib.request.urlopen(req2, context=ctx).read())
t["email"] = user["email"]

json.dump(t, open(TOKEN, "w"))
json.dump(t, open(WS_TOKEN, "w"))
print(f"Token refreshed. Email: {user['email']}")
