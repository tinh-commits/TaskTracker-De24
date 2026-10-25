"""Generate secure local credentials without committing .env to GitHub."""
from pathlib import Path
import secrets

root = Path(__file__).resolve().parents[1]
example = root / '.env.example'
dest = root / '.env'
if dest.exists():
    raise SystemExit('Already exists: .env. Refusing to overwrite existing credentials.')
contents = example.read_text(encoding='utf-8')
secrets_map = {
    'POSTGRES_PASSWORD': secrets.token_urlsafe(24),
    'APP_DB_PASSWORD': secrets.token_urlsafe(24),
    'METRICS_DB_PASSWORD': secrets.token_urlsafe(24),
    'PGADMIN_DEFAULT_PASSWORD': secrets.token_urlsafe(24),
    'GF_SECURITY_ADMIN_PASSWORD': secrets.token_urlsafe(24),
    'JWT_SECRET': secrets.token_urlsafe(48),
    'BOOTSTRAP_ADMIN_PASSWORD': secrets.token_urlsafe(18),
    'BOOTSTRAP_MEMBER_PASSWORD': secrets.token_urlsafe(18),
}
for key, value in secrets_map.items():
    lines = contents.splitlines()
    lines = [f'{key}={value}' if line.startswith(f'{key}=') else line for line in lines]
    contents = '\n'.join(lines) + '\n'
dest.write_text(contents, encoding='utf-8')
try:
    dest.chmod(0o600)
except OSError:
    pass
print('Created .env. Demo sign-in credentials (store safely; do not commit):')
print('  Admin:    admin /', secrets_map['BOOTSTRAP_ADMIN_PASSWORD'])
print('  Member:   nhanvien /', secrets_map['BOOTSTRAP_MEMBER_PASSWORD'])
print('  Grafana:  admin /', secrets_map['GF_SECURITY_ADMIN_PASSWORD'])
print('  pgAdmin:  admin@example.local /', secrets_map['PGADMIN_DEFAULT_PASSWORD'])
