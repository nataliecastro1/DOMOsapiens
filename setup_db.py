import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

conn = psycopg2.connect("postgresql://postgres:the-big-secret-pathfinder@localhost:5432/postgres")
conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
cur = conn.cursor()

try:
    cur.execute("CREATE DATABASE roi_prototype;")
    print("Database roi_prototype created successfully.")
except psycopg2.errors.DuplicateDatabase:
    print("Database roi_prototype already exists.")
except Exception as e:
    print("Error:", e)

cur.close()
conn.close()
