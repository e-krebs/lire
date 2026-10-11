"""Run from this folder with python3 capture.py using the bundled Chrome Headless Shell."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json
import subprocess
import tempfile
import threading

ROOT = Path(__file__).resolve().parent
NAMES = {f'{scene}-{theme}.png' for scene in ('hammock', 'bath', 'spring', 'autumn', 'winter', 'fishing', 'cat', 'rooftop', 'boat', 'beach', 'alpine-lake', 'bivouac', 'hut-terrace', 'coastal-bench', 'lighthouse-jetty', 'granite-cottage', 'bike-cafe', 'bike-canal', 'poolside', 'fireside', 'paris-cafe', 'lake-peacock', 'grass-level') for theme in ('light', 'dark')}
RENDERS = ROOT / 'renders'
RENDERS.mkdir(exist_ok=True)
received = set()
ANGLES = {f'{scene}-angle-{i}.png' for scene in ('alpine','jetty','grass','bee','lady') for i in range(1,5)}
ANGLE_DIR = ROOT / 'review-angles'
ANGLE_DIR.mkdir(exist_ok=True)
EXPORTS = NAMES | ANGLES | {'review-320.png', 'review-scenes-320.png', 'review-meadow-angles.png', 'review-ground-rocks-320.png', 'qa.json'}
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
assert report['complete'] and len(report['images']) == 46
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
assert checks['grass-level']['ladybugs'] == checks['grass-level']['bees'] == 1 and checks['grass-level']['blades'] >= 150, checks['grass-level']
assert checks['grass-level']['beeWings'] == 2, checks['grass-level']
meadow = checks['grass-level']
assert .32 <= meadow['beeBodyLength'] / meadow['daisyHeadDiameter'] <= .35, meadow
assert .58 <= meadow['ladybugBodyLength'] / meadow['beeBodyLength'] <= .62, meadow
assert meadow['beeLength320'] > 12 and meadow['ladybugLength320'] > 7 and meadow['beeLength320'] > meadow['ladybugLength320'] * 1.5, meadow
assert meadow['minimumRootSpacing'] >= .055 and meadow['maximumNearestRootSpacing'] > meadow['minimumRootSpacing'] * 2, meadow
assert max(meadow['densityCellCounts']) / min(meadow['densityCellCounts']) > 1.5, meadow
assert all(0 < meadow[key] < (meadow['shortBlades'] + meadow['uprightBlades']) * .3 for key in ('bentBlades', 'crossingBlades', 'veryShortBlades')), meadow
assert meadow['heightFactorRange'][1] - meadow['heightFactorRange'][0] > .9 and meadow['bendAmountRange'][1] - meadow['bendAmountRange'][0] > .6, meadow
assert meadow['bladeWidthRange'][1] / meadow['bladeWidthRange'][0] > 3 and meadow['leanAngleRange'][1] - meadow['leanAngleRange'][0] > 6, meadow
assert .15 < meadow['beeAxisViewDot'] < .6 and meadow['beeTopViewDot'] > .65 and meadow['beeWingSeparation320'] > 1, meadow
assert meadow['beeAbdomens'] == meadow['beeThoraxes'] == meadow['beeHeads'] == 1 and meadow['beeStripes'] == 4 and meadow['beeFuzz'] > 0 and meadow['beeLegs'] == 6 and meadow['beeEyes'] == meadow['beeAntennae'] == 2, meadow
assert meadow['beeWingLength'] > meadow['beeAbdomenLength'] and meadow['beeAbdomenColours'] == ['#392d20','#b58a45'], meadow
assert meadow['beeWingFoldDegrees'] < 10 and meadow['beeThoraxHeight'] / meadow['beeBodyLength'] < .18 and meadow['beeVisibleEyes'] == 1, meadow
assert meadow['daisyLeaves'] == 2 and .055 <= meadow['daisyStemRadius'] <= .065 and meadow['daisyStemHeight'] >= 3.05 and meadow['stemHeadJoinGap'] < .001, meadow
assert meadow['stemGroundY'] <= .08 and meadow['stemBaseFrontBlades'] > 0, meadow
assert .75 < meadow['ladybugShellRoundness'] < .95 and 1.1 < meadow['ladybugShellOvalRatio'] < 1.3 and meadow['ladybugHeadBodyRatio'] < .25 and meadow['ladybugShellOverhang'] > .04, meadow
assert meadow['ladybugSpots'] == 7 and meadow['ladybugSpotSides'] == [3,1,3] and meadow['ladybugSpotRadiusRange'][1] / meadow['ladybugSpotRadiusRange'][0] > 1.5, meadow
assert meadow['ladybugPronota'] == 1 and meadow['ladybugWhitePatches'] == 2 and meadow['ladybugLegs'] == 6, meadow
assert meadow['ladybugShellRoughness'] <= .25 and meadow['ladybugShellColour'] == '#ed3025', meadow
assert meadow['ladybugHeadTopInsidePronotum'] and meadow['ladybugHeadPronotumOverhang'] < .005, meadow
assert meadow['beeWingColour'] == '#ded4ba' and meadow['beeWingOpacity'] >= .5, meadow
assert meadow['ladybugPerchWidth'] < .09 and meadow['ladybugPerchColour'] in meadow['grassColours'] and meadow['ladybugPerchNeighbours'] >= 35 and meadow['preservedPlantingRandomDraws'] > 0, meadow
assert meadow['meadowReviewAngles'] == 12, meadow
assert checks['grass-level']['daisyCentreY'] > checks['grass-level']['maxGrassBladeY'] + .6, checks['grass-level']
assert meadow['flatGroundPatches'] == meadow['cloverPatches'] == 0, meadow
assert meadow['understoryBlades'] > 6000 and meadow['edgeBlades'] >= 400 and meadow['minimumUnderstoryHeight'] >= .16, meadow
assert meadow['addedLadybugBlades'] >= 100 and meadow['ladybugPerchNeighbours'] > 300, meadow
assert meadow['groundCoverageSamples'] > 400 and meadow['uncoveredGroundSamples'] == 0, meadow
assert abs(meadow['daisyHeadDiameter'] - 2.016 * .70) < .0001, meadow
assert checks['lake-peacock']['bushes'] == 3 and checks['lake-peacock']['plantBirdBoundsIntersections'] == 0, checks['lake-peacock']
cottage = checks['granite-cottage']
assert cottage['texturedBlocks'] > 40 and cottage['darkJoints']
assert cottage['earthPatches'] == 3 and cottage['grassPatches'] >= 3 and 30 <= cottage['grassBlades'] <= 50 and .18 < cottage['maxGrassHeight'] < .24, cottage
assert cottage['pathFlagstones'] == 4 and cottage['looseSlabs'] == 2 and all(5 <= sides <= 7 for sides in cottage['flagstoneSides']), cottage
assert all(vertices >= 48 for vertices in cottage['outlineVertexCounts']) and cottage['maxOutlineSegmentLength'] < .20 and cottage['outlineRightAngles'] == 0, cottage
assert cottage['pathStoneMinimumGap'] > .04 and cottage['stoneBoundsIntersections'] == 0, cottage
assert all(abs(gap) < .001 for gap in cottage['stoneGroundGaps']), cottage
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
print('46 images, 20 inspection angles, grounded rocks, bike contacts, cafe clearances, edge walls, granite blocks, net props, peacock and meadow verified')
