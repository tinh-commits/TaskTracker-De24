"""Basic local integration test. Run only after Docker Compose services are healthy."""
import json
import sys
from pathlib import Path
from http.cookiejar import CookieJar
from urllib.request import Request, build_opener, HTTPCookieProcessor
from urllib.error import HTTPError, URLError

BASE = 'http://127.0.0.1:8080'
ROOT = Path(__file__).resolve().parents[1]
values = {}
for line in (ROOT / '.env').read_text(encoding='utf-8').splitlines():
    if '=' in line and not line.strip().startswith('#'):
        k, v = line.split('=', 1)
        values[k] = v
opener = build_opener(HTTPCookieProcessor(CookieJar()))

def request(url, method='GET', data=None):
    raw = None if data is None else json.dumps(data).encode()
    headers = {'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json'}
    try:
        resp = opener.open(Request(url, method=method, data=raw, headers=headers), timeout=12)
        return resp.status, dict(resp.headers), resp.read().decode()
    except HTTPError as e:
        return e.code, dict(e.headers), e.read().decode()

def check(ok, name):
    print(('PASS' if ok else 'FAIL') + '  ' + name)
    if not ok: raise AssertionError(name)

try:
    status, head, body = request(BASE + '/health')
    check(status == 200 and 'connected' in body, 'App + PostgreSQL health')
    status, head, body = request(BASE + '/')
    check(status == 200 and 'TaskFlow' in body and 'x-frame-options' in {k.lower() for k in head}, 'Website via Nginx and security headers')
    status, _, _ = request(BASE + '/metrics')
    check(status == 404, 'Metrics not exposed on public Nginx')
    for port, name in [(5050,'pgAdmin'),(3001,'Grafana'),(9090,'Prometheus')]:
        st, _, _ = request(f'http://127.0.0.1:{port}/')
        check(st in [200,301,302], name + ' port reachable')
    status, _, body = request(BASE + '/api/login','POST',{'username':values.get('BOOTSTRAP_ADMIN_USERNAME','admin'),'password':values['BOOTSTRAP_ADMIN_PASSWORD']})
    check(status == 200 and 'user' in body, 'Admin login')
    status, _, body = request(BASE + '/api/tasks','POST',{'title':'[SMOKE] Kiểm tra hệ thống','description':'Tạo tự động, sẽ xóa','status':'todo','priority':'low','due_date':'2027-12-31'})
    check(status == 201 and 'id' in body, 'Create task')
    task_id = json.loads(body)['id']
    try:
        status, _, _ = request(BASE + '/api/tasks/' + str(task_id),'PATCH',{'title':'[SMOKE] Kiểm tra hệ thống','description':'Tạo tự động, sẽ xóa','status':'done','priority':'low','due_date':'2027-12-31'})
        check(status == 200, 'Update task')
    finally:
        status, _, _ = request(BASE + '/api/tasks/' + str(task_id),'DELETE',{})
        check(status == 200, 'Delete task (cleanup)')
    print('\nBasic end-to-end checks passed. Check Grafana dashboards, Prometheus targets and Loki queries in UI.')
except (HTTPError, URLError, AssertionError, OSError) as err:
    print('Integration tests not complete:', err, file=sys.stderr)
    sys.exit(1)
