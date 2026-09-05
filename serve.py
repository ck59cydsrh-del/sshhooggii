#!/usr/bin/env python3
"""sshhooggii — 静的配信 + ローカル通信の中継。

同じWi-Fiにいる2台で対戦するための最小限の中継所。
turn-based なので WebSocket は使わず、標準ライブラリだけで
「部屋に着手を積む / 続きを取りに行く」という長ポーリングで足りる。

  python3 serve.py [port]

起動すると LAN 内から届くURLを表示する。
"""
import http.server
import json
import socket
import socketserver
import sys
import threading
import time
from urllib.parse import urlparse, parse_qs

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8902
ROOM_TTL = 60 * 60          # 1時間触られていない部屋は捨てる
POLL_TIMEOUT = 25           # 長ポーリングの上限(秒)

_lock = threading.Condition()
_rooms = {}                 # code -> {"moves":[...], "seats":{}, "touched":ts, "meta":{}}


def _now():
    return time.time()


def _sweep():
    dead = [c for c, r in _rooms.items() if _now() - r["touched"] > ROOM_TTL]
    for c in dead:
        del _rooms[c]


def _room(code, create=False):
    r = _rooms.get(code)
    if r is None and create:
        r = {"moves": [], "seats": {}, "touched": _now(), "meta": None}
        _rooms[code] = r
    if r is not None:
        r["touched"] = _now()
    return r


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        if "/api/" not in self.path:          # 静的配信のログだけ出す
            super().log_message(fmt, *args)

    # ---------- 応答の下ごしらえ ----------
    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        # 開発中に古いJS/CSSを掴まないようにする
        if self.path.endswith((".js", ".css", ".html")) or self.path in ("/", ""):
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    # ---------- ローカル通信 ----------
    def do_GET(self):
        u = urlparse(self.path)
        if not u.path.startswith("/api/"):
            return super().do_GET()

        q = parse_qs(u.query)
        code = (q.get("room", [""])[0] or "").upper()

        if u.path == "/api/join":
            seat = q.get("seat", ["s"])[0]
            with _lock:
                _sweep()
                r = _room(code, create=True)
                # 席が空いていれば座る。既に自分の札が入っていれば復帰扱い
                token = q.get("token", [""])[0]
                holder = r["seats"].get(seat)
                if holder and holder != token:
                    return self._json({"ok": False, "reason": "seat_taken"})
                r["seats"][seat] = token
                _lock.notify_all()
                return self._json({"ok": True, "seat": seat,
                                   "seats": list(r["seats"].keys()),
                                   "count": len(r["moves"]), "meta": r["meta"]})

        if u.path == "/api/poll":
            since = int(q.get("since", ["0"])[0])
            deadline = _now() + POLL_TIMEOUT
            with _lock:
                _sweep()
                r = _room(code, create=True)
                while len(r["moves"]) <= since and _now() < deadline:
                    _lock.wait(timeout=max(0.1, deadline - _now()))
                    r = _room(code, create=True)
                return self._json({"ok": True, "moves": r["moves"][since:],
                                   "count": len(r["moves"]),
                                   "seats": list(r["seats"].keys()), "meta": r["meta"]})

        return self._json({"ok": False, "reason": "unknown"}, 404)

    def do_POST(self):
        u = urlparse(self.path)
        if not u.path.startswith("/api/"):
            return self._json({"ok": False}, 404)
        length = int(self.headers.get("Content-Length", 0))
        try:
            data = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return self._json({"ok": False, "reason": "bad_json"}, 400)

        code = str(data.get("room", "")).upper()

        if u.path == "/api/move":
            with _lock:
                r = _room(code, create=True)
                r["moves"].append(data.get("move"))
                _lock.notify_all()
                return self._json({"ok": True, "count": len(r["moves"])})

        if u.path == "/api/meta":            # 編成など、対局の前提を共有する
            with _lock:
                r = _room(code, create=True)
                # 両陣営がそれぞれ自分のぶんを送るので、上書きせず統合する
                merged = dict(r["meta"] or {})
                merged.update(data.get("meta") or {})
                r["meta"] = merged
                r["moves"] = []
                _lock.notify_all()
                return self._json({"ok": True, "meta": merged})

        if u.path == "/api/reset":
            with _lock:
                r = _room(code, create=True)
                r["moves"] = []
                _lock.notify_all()
                return self._json({"ok": True})

        return self._json({"ok": False, "reason": "unknown"}, 404)


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))          # 送信はしない。経路を引くだけ
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    import os
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    ip = lan_ip()
    print(f"  この端末   http://localhost:{PORT}")
    print(f"  同じWi-Fi  http://{ip}:{PORT}")
    print("  ローカル通信: 2台で同じ合言葉を入れると繋がります")
    Server(("0.0.0.0", PORT), Handler).serve_forever()
