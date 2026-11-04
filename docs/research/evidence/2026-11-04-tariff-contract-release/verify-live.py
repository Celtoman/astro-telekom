import base64, concurrent.futures, datetime, gzip, hashlib, http.client, importlib.util, json, pathlib, re, sys, threading, time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
spec = importlib.util.spec_from_file_location('tariff_html', HERE.parent/'2026-11-04-tariff-contract-implementation/verify-html.py')
html_check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(html_check)
env = {}
for line in (ROOT/'.env').read_text(encoding='utf-8-sig').splitlines():
    if re.match(r'^\w+=', line):
        key, value = line.split('=', 1)
        env[key] = value.strip().strip('\"').strip("'")
AUTH = 'Basic '+base64.b64encode((env['BASIC_AUTH_USERNAME']+':'+env['BASIC_AUTH_PASSWORD']).encode()).decode()
BASE = 'https://tv-internet-dom.ru'
expected = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
mode = sys.argv[2]
connections = threading.local()

def request(path, body=None):
    data = None if body is None else json.dumps(body).encode()
    for attempt in range(2):
        connection = getattr(connections, 'current', None)
        if connection is None:
            connection = http.client.HTTPSConnection('tv-internet-dom.ru', timeout=60)
            connections.current = connection
        try:
            connection.request('GET' if body is None else 'POST', path, body=data, headers={'Authorization': AUTH, 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip', 'User-Agent': 'AstroTelekom-Approved-Release-Verification/1.0'})
            response = connection.getresponse()
            payload = response.read()
            if response.getheader('Content-Encoding') == 'gzip':
                payload = gzip.decompress(payload)
            result = response.status, payload, dict(response.getheaders()), BASE+path
            if response.will_close:
                connection.close()
                connections.current = None
            return result
        except (OSError, http.client.HTTPException):
            connection.close()
            connections.current = None
            if attempt:
                raise

def check_html(item):
    try:
        status, body, headers, final_url = request(item['path'])
        errors = [] if status == 200 else ['HTTP '+str(status)]
        if final_url != BASE+item['path']: errors.append('unexpected redirect')
        if status == 200:
            text = body.decode('utf-8')
            errors += html_check.check_page(text, item)
            if item['view']['cinemas']:
                section = re.search(r'<section\b[^>]*data-tariff-block="cinemas"[\s\S]*?</section>', text)
                if not section or 'Подписки в тарифе' not in section[0] or 'Уже включено' in section[0]: errors.append('cinema heading')
        if 'noindex' not in next((v for k,v in headers.items() if k.lower() == 'x-robots-tag'), ''): errors.append('test noindex')
        return {'path': item['path'], 'status': status, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(), 'errors': errors}
    except Exception as e:
        return {'path': item['path'], 'errors': [type(e).__name__+': '+str(e)]}

def check_quote(item):
    try:
        status, body, headers, final_url = request(item['endpoint'], item['selection'])
        actual = json.loads(body)
        errors = []
        if status != item.get('expectedStatus', 200): errors.append('HTTP '+str(status))
        if status == 200:
            for key in ['selection', 'choices', 'totals', 'charges', 'fingerprint']:
                if actual.get(key) != item['expected'].get(key): errors.append(key)
        elif item.get('expectedError') and item['expectedError'] not in str(actual.get('message')):
            errors.append('error reason')
        return {'path': item['path'], 'selection': item['selection'], 'status': status, 'totals': actual.get('totals'), 'errors': errors}
    except Exception as e:
        return {'path': item['path'], 'errors': [type(e).__name__+': '+str(e)]}

started = time.monotonic()
results = []
if mode == 'html':
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for result in pool.map(check_html, expected):
            results.append(result)
            if len(results) % 200 == 0: print(json.dumps({'checked': len(results), 'failed': sum(bool(x['errors']) for x in results)}), flush=True)
else:
    for item in expected:
        tick = time.monotonic()
        results.append(check_quote(item))
        if len(results) % 40 == 0: print(json.dumps({'checked': len(results), 'failed': sum(bool(x['errors']) for x in results)}), flush=True)
        time.sleep(max(0, 0.4-(time.monotonic()-tick)))
failures = [r for r in results if r['errors']]
summary = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'checked': len(results), 'mode': mode, 'elapsedSeconds': round(time.monotonic()-started, 2), 'failures': failures, 'rows': results}
(HERE/('live-'+mode+'.json')).write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps({k:v for k,v in summary.items() if k != 'rows'}, ensure_ascii=False), flush=True)
if failures: sys.exit(1)
