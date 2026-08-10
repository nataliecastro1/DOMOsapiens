import urllib.request
import urllib.error
import time

try:
    print("Testing /api/auth/me...")
    start = time.time()
    resp = urllib.request.urlopen("http://localhost:3600/hub/v1/roi/access", timeout=5)
    print("Code:", resp.getcode())
    print("Data:", resp.read())
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code, e.reason)
    print("Data:", e.read())
except Exception as e:
    print("Exception:", e)
print("Took:", time.time() - start)
