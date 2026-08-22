import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Docker'da ai-engine /app altinda calisir ve ./data:/app/data mount'u
# frontend ile ayni veritabanini gosterir. Docker disinda calisirken
# ortak dosyayi gostermek icin GEOMORPHOSIS_DATA_DIR kullanilabilir.
DATA_DIR = os.environ.get("GEOMORPHOSIS_DATA_DIR") or os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "geopulse.db")


def get_db_connection():
    """SQLite veritabanina baglanti acar."""
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def init_db():
    """Veritabani tablolarini olusturur (Eger yoksa)."""
    os.makedirs(DATA_DIR, exist_ok=True)
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS regions_analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address VARCHAR(45),
            image_no VARCHAR(100),
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            region_name VARCHAR(255),
            coordinates TEXT,
            ai_results TEXT
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS periodic_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            region_id INTEGER,
            notification_target VARCHAR(255),
            interval_minutes INTEGER DEFAULT 120,
            last_checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT 1,
            FOREIGN KEY (region_id) REFERENCES regions_analysis(id) ON DELETE CASCADE
        );
        """)

        # Arayüzde e-posta bildirimlerini etkinleştiren kullanıcıların kalıcı kaydı.
        # user_id, tarayıcıdaki GeoMorphosis kullanıcı kimliğidir.
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS email_subscriptions (
            user_id TEXT PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)

        conn.commit()
        conn.close()
        print("Veritabani tablolari basariyla olusturuldu.")
    except sqlite3.OperationalError as e:
        print(f"Veritabani hatasi (devam ediliyor): {e}")


if __name__ == "__main__":
    init_db()
