#!/usr/bin/env python3
"""
ReloAssistant Local Server
Serves static files and proxies Google Sheets CSV requests to bypass CORS.
Usage: python3 server.py
"""

import http.server
import urllib.request
import urllib.error
import ssl
import json
import os
import sys

PORT = 8080
GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT0W9OeoTIqSg46yVGMUV4Kc3efIjtuVpy3YDEgdhCr8BlBvH3oSBb6Ny5TF87FPVR98V1Vss9NZvJ9/pub?output=csv'


class ReloHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler that serves static files and proxies Google Sheets."""

    def end_headers(self):
        """Add no-cache headers for development."""
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        # Proxy endpoint for Google Sheets CSV
        if self.path.startswith('/api/sync'):
            self.proxy_google_sheets()
        else:
            # Serve static files normally
            super().do_GET()

    def proxy_google_sheets(self):
        """Fetch CSV from Google Sheets and return it with CORS headers."""
        try:
            print(f'[DEBUG-SYNC] Fetching Google Sheet CSV...')
            # Create SSL context that skips certificate verification
            # (needed on macOS where Python may lack proper CA certs)
            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE

            req = urllib.request.Request(
                GOOGLE_SHEET_CSV_URL,
                headers={
                    'User-Agent': 'Mozilla/5.0 (ReloAssistant/1.0)'
                }
            )
            with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as response:
                csv_data = response.read()
                print(f'[DEBUG-SYNC] Got {len(csv_data)} bytes from Google Sheets')
                print(f'[DEBUG-SYNC] First 100 bytes: {csv_data[:100]}')

            self.send_response(200)
            self.send_header('Content-Type', 'text/csv; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            self.wfile.write(csv_data)
            print(f'[DEBUG-SYNC] Response sent successfully')

        except urllib.error.HTTPError as e:
            print(f'[DEBUG-SYNC] HTTPError: {e.code}')
            self.send_error_json(e.code, f'Google Sheets returned HTTP {e.code}')
        except urllib.error.URLError as e:
            print(f'[DEBUG-SYNC] URLError: {e.reason}')
            self.send_error_json(502, f'Failed to reach Google Sheets: {e.reason}')
        except Exception as e:
            print(f'[DEBUG-SYNC] Exception: {type(e).__name__}: {e}')
            self.send_error_json(500, f'Proxy error: {str(e)}')

    def send_error_json(self, code, message):
        """Send an error response as JSON."""
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({'error': message}).encode())

    def log_message(self, format, *args):
        """Custom log format."""
        try:
            first_arg = str(args[0]) if args else ''
            if '/api/sync' in first_arg:
                sys.stderr.write(f"[SYNC] {first_arg}\n")
            # Suppress static file logs for cleaner output
        except Exception:
            pass


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = http.server.HTTPServer(('', PORT), ReloHandler)
    print(f'🏠 ReloAssistant server running at http://localhost:{PORT}')
    print(f'📊 Dashboard: http://localhost:{PORT}')
    print(f'🔄 Sync endpoint: http://localhost:{PORT}/api/sync')
    print(f'Press Ctrl+C to stop.\n')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
        server.server_close()


if __name__ == '__main__':
    main()
