"""Run from this folder with python3 capture.py using the bundled Chrome Headless Shell."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json
import subprocess
import tempfile
import threading

ROOT = Path(__file__).resolve().parent
NAMES = {f'{scene}-{theme}.png' for scene in ('hammock', 'bath', 'spring', 'autumn', 'winter', 'fishing', 'cat', 'rooftop', 'boat', 'beach', 'alpine-lake', 'bivouac', 'hut-terrace', 'coastal-bench', 'lighthouse-jetty', 'granite-cottage') for theme in ('light', 'dark')}
RENDERS = ROOT / 'renders'
RENDERS.mkdir(exist_ok=True)
received = set()
EXPORTS = NAMES | {'review-320.png', 'qa.json'}
finished = threading.Event()
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def do_POST(self):
        name = self.path.removeprefix('/export/')
        if not self.path.startswith('/export/') or name not in EXPORTS:
            self.send_error(404)
            return
        data = self.rfile.read(int(self.headers['Content-Length']))
        if name.endswith('.png') and not data.startswith(b'\x89PNG\r\n\x1a\n'):
            self.send_error(400)
            return
        ((RENDERS if name in NAMES else ROOT) / name).write_bytes(data)
        received.add(name)
        self.send_response(200)
        self.end_headers()
        if name == 'qa.json':
            finished.set()
    def log_message(self, format, *args):
        print(format % args, flush=True)

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
port = server.server_address[1]
chrome = str(ROOT.parent / 'chrome-headless-shell-mac-arm64/chrome-headless-shell')
profile = tempfile.TemporaryDirectory(prefix='lire-capture-')
command = [chrome,
    '--headless=new', '--no-sandbox', '--single-process', '--in-process-gpu', '--no-zygote',
    '--disable-gpu', '--disable-gpu-compositing', '--use-gl=angle',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--no-first-run', '--no-default-browser-check',
    f'--user-data-dir={profile.name}',
    '--window-size=1440,1260', '--hide-scrollbars',
    f'http://127.0.0.1:{port}/tiles.html?export=1',
]
with (ROOT / 'chrome.log').open('w') as log:
    process = subprocess.Popen(command, stdout=log, stderr=log)
    try:
        if not finished.wait(timeout=300):
            raise SystemExit('Render did not complete; see chrome.log')
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        server.shutdown()
        server.server_close()
        profile.cleanup()
report = json.loads((ROOT / 'qa.json').read_text())
assert report['complete'] and len(report['images']) == 32
assert received == EXPORTS, EXPORTS - received
assert {item['file'] for item in report['images']} == NAMES
for item in report['images']:
    assert item['clearEdges'] and item['transparentPixels'] > 0, item
    assert item['width'] == 960 and item['height'] == 600, item
    path = RENDERS / item['file']
    print(f'{path.name}: {path.stat().st_size:,} bytes; transparent edges verified')
