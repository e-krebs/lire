"""Run from this folder with python3 capture.py using the bundled Chrome Headless Shell."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json
import subprocess
import tempfile
import threading

ROOT = Path(__file__).resolve().parent
NAMES = {f'{scene}-{theme}.png' for scene in ('hammock', 'bath', 'spring', 'autumn', 'winter', 'fishing', 'cat', 'rooftop', 'boat', 'beach', 'alpine-lake', 'bivouac', 'hut-terrace', 'coastal-bench', 'lighthouse-jetty', 'granite-cottage', 'bike-cafe', 'bike-canal', 'poolside', 'fireside', 'paris-cafe', 'lake-peacock') for theme in ('light', 'dark')}
RENDERS = ROOT / 'renders'
RENDERS.mkdir(exist_ok=True)
received = set()
ANGLES = {f'{scene}-angle-{i}.png' for scene in ('alpine','jetty') for i in range(1,5)}
ANGLE_DIR = ROOT / 'review-angles'
ANGLE_DIR.mkdir(exist_ok=True)
EXPORTS = NAMES | ANGLES | {'review-320.png', 'qa.json'}
finished = threading.Event()
(ROOT/'error.json').unlink(missing_ok=True)
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def do_POST(self):
        name = self.path.removeprefix('/export/')
        if not self.path.startswith('/export/') or name not in EXPORTS | {'error.json'}:
            self.send_error(404)
            return
        data = self.rfile.read(int(self.headers['Content-Length']))
        if name.endswith('.png') and not data.startswith(b'\x89PNG\r\n\x1a\n'):
            self.send_error(400)
            return
        ((RENDERS if name in NAMES else ANGLE_DIR if name in ANGLES else ROOT) / name).write_bytes(data)
        received.add(name)
        self.send_response(200)
        self.end_headers()
        if name in {'qa.json', 'error.json'}:
            finished.set()
    def log_message(self, format, *args):
        print(format % args, flush=True)

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
port = server.server_address[1]
chrome = str(ROOT.parent / 'chrome-headless-shell-mac-arm64/chrome-headless-shell')
profile = tempfile.TemporaryDirectory(prefix='lire-capture-', dir=ROOT)
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
if 'error.json' in received:
    raise SystemExit((ROOT/'error.json').read_text())
report = json.loads((ROOT / 'qa.json').read_text())
assert report['complete'] and len(report['images']) == 44
assert received == EXPORTS, EXPORTS - received
assert {item['file'] for item in report['images']} == NAMES
assert {path.name for path in RENDERS.glob('*.png')} == NAMES
for item in report['images']:
    assert item['clearEdges'] and item['transparentPixels'] > 0, item
    assert item['width'] == 960 and item['height'] == 600, item
    path = RENDERS / item['file']
    print(f'{path.name}: {path.stat().st_size:,} bytes; transparent edges verified')

checks = report['geometryChecks']
assert checks['alpine-lake']['sockObstacleBoundsIntersections'] == 0
assert checks['alpine-lake']['snowRockMasses'] == 5 and checks['alpine-lake']['snowThickness'] == .065
assert checks['alpine-lake']['unsupportedLooseRocks'] == 0, checks['alpine-lake']
assert checks['alpine-lake']['maxLooseRockGap'] <= .001, checks['alpine-lake']
canal = checks['bike-canal']
assert canal['contactMeshes'] == ['step-through tube'], canal
assert all(canal[key] == 0 for key in ('bikeBollardPenetrations', 'bikeBenchPenetrations', 'bottleBenchPenetrations', 'bikeBottlePenetrations', 'baguetteBasketPenetrations')), canal
assert canal['bollardCount'] == 5 and canal['extraBollardPenetrations'] == 0 and canal['bikeBenchHorizontalGap'] > .08, canal
cafe = checks['bike-cafe']
assert all(cafe[key] == 0 for key in ('bikeWallPenetrations', 'kickstandPenetrations', 'furnitureBoundsIntersections', 'wallFurnitureBoundsIntersections', 'helmetBikeBoundsIntersections', 'wallOutsideHexVertices')), cafe
pool = checks['poolside']
assert pool['mosaicTileSize'] == .025 and pool['mosaicColours'] == 9, pool
assert pool['floorTiles'] > 10000 and pool['wallTiles'] > 2000, pool
assert pool['swimCapMeshes'] == 2 and pool['swimCapHeight'] / pool['swimCapWidth'] < .06, pool
assert abs(pool['swimCapDeckClearance']) < .00001, pool
assert cafe['rackHoops'] == cafe['lockChainLinks'] == 0 and cafe['helmetOnChair'] and cafe['kickstandDown'], cafe
assert abs(cafe['helmetSeatClearance']) < .0001, cafe
assert all(abs(gap) < .0001 for gap in cafe['wheelGroundClearances']) and abs(cafe['kickstandGroundClearance']) < .0001, cafe
assert cafe['bikeTiltRadians'] > 0 and cafe['helmetShellColour'] == '#7fb2e5', cafe
assert canal['bollardSpacing'] == 1.16 and canal['bollardAlignmentError'] == 0, canal
assert 30 <= checks['fishing']['rodAngleDegrees'] <= 40 and not checks['fishing']['lineTaut']
assert checks['fishing']['lineCatenary'] and checks['fishing']['lineTouchesWaterNearFloat']
assert checks['fishing']['lineLength'] > checks['fishing']['straightLineLength'] and abs(checks['fishing']['lineWaterClearance']) < .00001
assert checks['lake-peacock']['bushes'] == 3 and checks['lake-peacock']['plantBirdBoundsIntersections'] == 0, checks['lake-peacock']
assert checks['granite-cottage']['texturedBlocks'] > 40 and checks['granite-cottage']['darkJoints']
jetty = checks['lighthouse-jetty']
assert jetty['netStrands'] == 26 and jetty['netFloats'] == 3 and jetty['buoys'] == 2 and jetty['woodenCrate']
assert jetty['netStonePenetrations'] == jetty['netPropPenetrations'] == 0, jetty
assert all(abs(gap) < .00001 for gap in jetty['floatStoneClearances']), jetty
paris = checks['paris-cafe']
assert paris['lunchPlates'] == paris['wineGlasses'] == paris['cutleryPairs'] == 2 and paris['mealBoundsIntersections'] == 0, paris
assert paris['meals'] == ['croque-monsieur with salad', 'steak-frites'], paris
assert paris['chairs'] == 2 and paris['planters'] == 1 and paris['propBoundsIntersections'] == 0, paris
assert paris['wallOutsideHexVertices'] == 0 and abs(paris['wallBaseY'] - .122) < .00001, paris
assert abs(paris['wallBackEdge'] - paris['hexBackEdge']) < .00001, paris
assert checks['lake-peacock']['peacocks'] == 1 and checks['lake-peacock']['cafeProps'] == 0
for name in ('bike-cafe', 'fireside'):
    wall = checks[name]
    assert wall['wallOutsideHexVertices'] == 0, wall
    assert abs(wall['wallBackEdge'] - wall['hexBackEdge']) < .00001, wall
    assert abs(wall['wallBaseY'] - (.113 if name == 'bike-cafe' else .05)) < .00001, wall
    assert wall['wallThickness'] == .22, wall
assert checks['fireside']['chimneyBuiltIntoWall'], checks['fireside']
print('44 images, eight inspection angles, grounded rocks, bike contacts, cafe clearances, edge walls, granite blocks, net props and peacock verified')
