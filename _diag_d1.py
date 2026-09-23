import sqlite3
import glob
import os

FILES = glob.glob(
    r'C:\opt\workstations\project\blogs\taiping_blog\apps\edge\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\*.sqlite'
)

for f in FILES:
    print('=' * 70)
    print('FILE:', os.path.basename(f), os.path.getsize(f), 'bytes')
    con = sqlite3.connect('file:' + f.replace('\\', '/') + '?mode=ro', uri=True)
    cur = con.cursor()
    tabs = [r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )]
    print('TABLES:', tabs)
    if 'admins' in tabs:
        n = cur.execute('SELECT COUNT(*) FROM admins').fetchone()[0]
        print('admins rows:', n)
        for r in cur.execute(
            'SELECT id, username, substr(password_hash,1,40), created_at, updated_at FROM admins'
        ):
            print('   ', r)
        cols = [c[1] for c in cur.execute('PRAGMA table_info(admins)')]
        print('admins columns:', cols)
    if 'sessions' in tabs:
        print('sessions rows:', cur.execute('SELECT COUNT(*) FROM sessions').fetchone()[0])
    if 'auth_attempts' in tabs:
        print('auth_attempts rows:', cur.execute('SELECT COUNT(*) FROM auth_attempts').fetchone()[0])
        for r in cur.execute('SELECT * FROM auth_attempts LIMIT 10'):
            print('    attempt:', r)
    if 'settings' in tabs:
        print('settings rows:', cur.execute('SELECT COUNT(*) FROM settings').fetchone()[0])
    if 'migrations' in tabs:
        for r in cur.execute('SELECT * FROM migrations'):
            print('    migration:', r)
    con.close()
