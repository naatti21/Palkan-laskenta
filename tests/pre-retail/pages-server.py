"""Serve the test build with the directory-index redirects used by Cloudflare Pages."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, urlunsplit


class PagesHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="_pre-retail", **kwargs)

    def send_head(self):
        url = urlsplit(self.path)
        if url.path.endswith("/index.html"):
            self.send_response(308)
            self.send_header("Location", urlunsplit(("", "", url.path.removesuffix("index.html"), url.query, "")))
            self.end_headers()
            return None
        return super().send_head()


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 4190), PagesHandler).serve_forever()
