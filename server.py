#!/usr/bin/env python3
"""Tiny static server for AgriSense that disables caching,
so every refresh always loads the newest files."""
import http.server

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, *args):  # keep console quiet
        pass

if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("0.0.0.0", 8000), NoCacheHandler).serve_forever()
