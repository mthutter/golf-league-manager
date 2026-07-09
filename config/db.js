import sqlite3 from "sqlite3";
import logger from "../utilities/logger.js";

const dbPath = process.env.DB_PATH;

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error(err.message);
  } else {
    logger.info(`Connected to SQLite: ${dbPath}`);
  }
});

export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export default db;
