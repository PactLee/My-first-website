"""로컬 실행용 서버: 저장소를 웹으로 열어주고 /wfm/* 요청을 warframe.market API 로 전달한다.

브라우저가 warframe.market 직접 호출을 막을 때(CORS) 사용한다.
    python3 warframe/tools/server.py
    -> http://localhost:8000/warframe/
"""
import http.server
import os
import urllib.error
import urllib.request

PORT = 8000
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
API = "https://api.warframe.market"
HEADERS = {"User-Agent": "warframe-ko-helper", "Accept": "application/json",
           "Platform": "pc", "Language": "ko", "Crossplay": "true"}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if not self.path.startswith("/wfm/"):
            return super().do_GET()
        req = urllib.request.Request(API + self.path[len("/wfm"):], headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                status, body = res.status, res.read()
        except urllib.error.HTTPError as e:
            status, body = e.code, e.read()
        except urllib.error.URLError as e:
            status, body = 502, str(e.reason).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print(f"http://localhost:{PORT}/warframe/ 에서 열 수 있습니다 (종료: Ctrl+C)")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
