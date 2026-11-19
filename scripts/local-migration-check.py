"""Disposable PostgreSQL only. Creates unique test databases on the fixed local socket."""
from pathlib import Path
import subprocess
import uuid

root = Path(__file__).resolve().parents[1]
base = ['psql', '-h', '/tmp/busmora-competition-pg', '-p', '55438', '-v', 'ON_ERROR_STOP=1']
log = Path('/tmp/busmora-competition-pg/acceptance.log')

def run(db, *args):
    result = subprocess.run([*base, '-d', db, *args], cwd=root, text=True, capture_output=True)
    with log.open('a') as output:
        output.write(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError(result.stderr[-4000:])

for mode in ['empty', 'upgrade']:
    db = 'busmora_check_' + uuid.uuid4().hex[:12]
    run('postgres', '-c', f'CREATE DATABASE {db}')
    try:
        run(db, '-f', 'scripts/local-db-bootstrap.sql')
        for migration in sorted((root / 'supabase/migrations').glob('*.sql')):
            if mode == 'upgrade' and migration.name.startswith('20261118020000'):
                run(db, '-f', 'scripts/migration-upgrade-fixture.sql')
            run(db, '-f', str(migration))
        if mode == 'upgrade':
            run(db, '-f', 'scripts/migration-upgrade-assert.sql')
        for check in ['competition-db-check.sql', 'intake-db-check.sql', 'brain-governance-db-check.sql', 'task-execution-db-check.sql', 'deliverable-db-check.sql']:
            if (root / 'scripts' / check).exists():
                run(db, '-f', 'scripts/' + check)
        print(f'PASS: {mode} migration path and available database acceptance checks', flush=True)
    finally:
        run('postgres', '-c', f'DROP DATABASE {db}')
print(f'Full local evidence: {log}', flush=True)
