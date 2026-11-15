import fs from 'fs';
import path from 'path';

// Универсальная загрузка SQLite: проверяем better-sqlite3, иначе встроенный node:sqlite (Node 22+)
let DatabaseConstructor;
let dbEngine = 'none';

try {
  const { default: Database } = await import('better-sqlite3');
  DatabaseConstructor = Database;
  dbEngine = 'better-sqlite3';
} catch {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    DatabaseConstructor = DatabaseSync;
    dbEngine = 'node:sqlite';
  } catch (err) {
    console.error('❌ Не удалось загрузить SQLite (better-sqlite3 или node:sqlite):', err.message);
  }
}

class DurakDatabase {
  constructor(dbPath = './durak.db') {
    if (!DatabaseConstructor) {
      throw new Error('SQLite недоступен. Установите better-sqlite3 или используйте Node.js v22+');
    }

    this.dbPath = path.resolve(dbPath);
    console.log(`📦 Подключение к SQLite [${dbEngine}]: ${this.dbPath}`);
    this.db = new DatabaseConstructor(this.dbPath);

    this.initTables();
    this.autoMigrateFromJSON();
  }

  initTables() {
    // 1. Таблица сообщений чатов
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_chat_text ON messages(chat_id, text);
    `);

    // 2. Таблица шуток (/joke)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jokes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL UNIQUE
      );
    `);

    // 3. Таблица настроек (режимы, параметры)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // 4. Таблица динамических категорий тем
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        keywords TEXT NOT NULL,
        message_count INTEGER DEFAULT 0,
        is_auto INTEGER DEFAULT 1,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  autoMigrateFromJSON() {
    // Проверяем, есть ли уже сообщения в базе
    const countRow = this.db.prepare('SELECT count(*) as count FROM messages').get();
    const messageCount = countRow ? (countRow.count || 0) : 0;

    if (messageCount === 0) {
      // Ищем старый wordBase.json в возможных путях
      const wordBasePaths = [
        '../durakBase/wordBase.json',
        './durakBase/wordBase.json',
        './wordBase.json'
      ];

      for (const p of wordBasePaths) {
        const resolved = path.resolve(p);
        if (fs.existsSync(resolved)) {
          try {
            console.log(`📥 Найдена старая база сообщений ${resolved}, импортирую в SQLite...`);
            const data = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
            let total = 0;

            this.db.exec('BEGIN TRANSACTION');
            const insertStmt = this.db.prepare(`
              INSERT OR IGNORE INTO messages (chat_id, text, created_at)
              VALUES (?, ?, ?)
            `);

            const now = Date.now();
            for (const [chatId, texts] of Object.entries(data)) {
              if (Array.isArray(texts)) {
                for (const text of texts) {
                  if (typeof text === 'string' && text.trim().length > 0) {
                    insertStmt.run(String(chatId), text.trim(), now);
                    total++;
                  }
                }
              }
            }
            this.db.exec('COMMIT');
            console.log(`✅ Успешно импортировано ${total} сообщений из ${p}!`);
            break;
          } catch (err) {
            console.error(`⚠️ Ошибка импорта из ${p}:`, err.message);
            try { this.db.exec('ROLLBACK'); } catch {}
          }
        }
      }
    }

    // Проверяем шутки
    const jokeCountRow = this.db.prepare('SELECT count(*) as count FROM jokes').get();
    const jokeCount = jokeCountRow ? (jokeCountRow.count || 0) : 0;

    if (jokeCount === 0) {
      const jokeBasePaths = [
        '../durakBase/jokeBase.json',
        './durakBase/jokeBase.json',
        './jokeBase.json'
      ];

      for (const p of jokeBasePaths) {
        const resolved = path.resolve(p);
        if (fs.existsSync(resolved)) {
          try {
            console.log(`📥 Найдена база анекдотов ${resolved}, импортирую в SQLite...`);
            const jokes = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
            if (Array.isArray(jokes)) {
              this.db.exec('BEGIN TRANSACTION');
              const insertJoke = this.db.prepare('INSERT OR IGNORE INTO jokes (text) VALUES (?)');
              for (const joke of jokes) {
                if (typeof joke === 'string' && joke.trim().length > 0) {
                  insertJoke.run(joke.trim());
                }
              }
              this.db.exec('COMMIT');
              console.log(`✅ Успешно импортировано ${jokes.length} шуток из ${p}!`);
            }
            break;
          } catch (err) {
            console.error(`⚠️ Ошибка импорта шуток из ${p}:`, err.message);
            try { this.db.exec('ROLLBACK'); } catch {}
          }
        }
      }
    }

    // Если шуток всё ещё нет, добавляем базовые шаблоны
    const checkJokes = this.db.prepare('SELECT count(*) as count FROM jokes').get();
    if (!checkJokes || checkJokes.count === 0) {
      const defaultJokes = [
        "Заходит как-то joke в бар, а бармен ему говорит...",
        "Сидят два программиста, один другому: joke!",
        "Если долго смотреть на joke, то joke начнет смотреть на тебя."
      ];
      const insertJoke = this.db.prepare('INSERT OR IGNORE INTO jokes (text) VALUES (?)');
      for (const j of defaultJokes) insertJoke.run(j);
    }
  }

  // Добавить сообщение
  addMessage(chatId, text) {
    if (!text || typeof text !== 'string') return false;
    const cleanText = text.trim();
    if (!cleanText) return false;

    try {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO messages (chat_id, text, created_at)
        VALUES (?, ?, ?)
      `);
      const res = stmt.run(String(chatId), cleanText, Date.now());
      return res.changes > 0;
    } catch (err) {
      console.error('Ошибка addMessage:', err.message);
      return false;
    }
  }

  // Получить случайное сообщение (для режима 1 и демотиваторов)
  getRandomMessage(chatId = null) {
    try {
      let row;
      if (chatId) {
        row = this.db.prepare(`
          SELECT text FROM messages
          WHERE chat_id = ?
          ORDER BY RANDOM() LIMIT 1
        `).get(String(chatId));
      }
      if (!row) {
        row = this.db.prepare(`
          SELECT text FROM messages
          ORDER BY RANDOM() LIMIT 1
        `).get();
      }
      return row ? row.text : 'Привет!';
    } catch (err) {
      console.error('Ошибка getRandomMessage:', err.message);
      return 'Привет!';
    }
  }

  // Получить все сообщения (для обучения)
  getAllMessages(chatId = null) {
    try {
      if (chatId) {
        return this.db.prepare('SELECT text FROM messages WHERE chat_id = ?').all(String(chatId)).map(r => r.text);
      }
      return this.db.prepare('SELECT text FROM messages').all().map(r => r.text);
    } catch (err) {
      console.error('Ошибка getAllMessages:', err.message);
      return [];
    }
  }

  // Количество сообщений
  getMessageCount(chatId = null) {
    try {
      if (chatId) {
        const row = this.db.prepare('SELECT count(*) as count FROM messages WHERE chat_id = ?').get(String(chatId));
        return row ? row.count : 0;
      }
      const row = this.db.prepare('SELECT count(*) as count FROM messages').get();
      return row ? row.count : 0;
    } catch {
      return 0;
    }
  }

  // Настройки (режимы и т.д.)
  getSetting(key, defaultValue = null) {
    try {
      const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return row ? row.value : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  setSetting(key, value) {
    try {
      this.db.prepare(`
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(key, String(value));
      return true;
    } catch (err) {
      console.error('Ошибка setSetting:', err.message);
      return false;
    }
  }

  // Шутки
  getRandomJoke() {
    try {
      const row = this.db.prepare('SELECT text FROM jokes ORDER BY RANDOM() LIMIT 1').get();
      return row ? row.text : 'joke';
    } catch {
      return 'joke';
    }
  }

  addJoke(text) {
    try {
      const res = this.db.prepare('INSERT OR IGNORE INTO jokes (text) VALUES (?)').run(text.trim());
      return res.changes > 0;
    } catch {
      return false;
    }
  }

  getAllJokes() {
    try {
      return this.db.prepare('SELECT text FROM jokes').all().map(r => r.text);
    } catch {
      return [];
    }
  }

  // Динамические категории
  saveCategories(categories) {
    if (!Array.isArray(categories)) return;
    try {
      this.db.exec('BEGIN TRANSACTION');
      const stmt = this.db.prepare(`
        INSERT INTO categories (name, keywords, message_count, is_auto, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          keywords = excluded.keywords,
          message_count = excluded.message_count,
          updated_at = excluded.updated_at
      `);
      const now = Date.now();
      for (const cat of categories) {
        const kws = Array.isArray(cat.keywords) ? cat.keywords.join(', ') : String(cat.keywords || '');
        stmt.run(
          cat.name,
          kws,
          cat.messageCount || 0,
          cat.isAuto ? 1 : 0,
          now
        );
      }
      this.db.exec('COMMIT');
    } catch (err) {
      console.error('Ошибка saveCategories:', err.message);
      try { this.db.exec('ROLLBACK'); } catch {}
    }
  }

  getCategories() {
    try {
      const rows = this.db.prepare('SELECT * FROM categories ORDER BY message_count DESC, id ASC').all();
      return rows.map(r => ({
        id: r.id,
        name: r.name,
        keywords: r.keywords.split(',').map(s => s.trim()).filter(Boolean),
        messageCount: r.message_count,
        isAuto: Boolean(r.is_auto),
        updatedAt: r.updated_at
      }));
    } catch (err) {
      console.error('Ошибка getCategories:', err.message);
      return [];
    }
  }

  updateCategoryCount(name, count) {
    try {
      this.db.prepare('UPDATE categories SET message_count = ? WHERE name = ?').run(count, name);
    } catch {}
  }

  close() {
    try {
      this.db.close();
    } catch {}
  }
}

export default DurakDatabase;
