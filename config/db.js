import sqlite3 from "sqlite3";
import logger from "../utilities/logger.js";

const dbPath = process.env.DB_PATH;

/**
 * SQLite database connection instance configured from the DB_PATH environment variable.
 * @type {sqlite3.Database}
 */
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error(err.message);
  } else {
    logger.info(`Connected to SQLite: ${dbPath}`);
  }
});

/**
 * Execute a SQL query that returns multiple rows.
 *
 * @param {string} sql - The SQL statement to run.
 * @param {Array<any>} [params=[]] - Parameter values to bind to the query.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of result rows.
 */
export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

/**
 * Execute a SQL statement that does not return rows, such as INSERT, UPDATE, or DELETE.
 *
 * @param {string} sql - The SQL statement to run.
 * @param {Array<any>} [params=[]] - Parameter values to bind to the statement.
 * @returns {Promise<Object>} A promise that resolves to the sqlite3 statement context.
 */
export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

/**
 * Execute a SQL query and return the first matching row.
 *
 * @param {string} sql - The SQL statement to run.
 * @param {Array<any>} [params=[]] - Parameter values to bind to the query.
 * @returns {Promise<Object|null>} A promise that resolves to the first matching row or null.
 */
export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Start a SQL transaction.
 *
 * @returns {Promise<Object>} A promise that resolves when the transaction begins.
 */
export function beginTransaction() {
  return run("BEGIN TRANSACTION");
}

/**
 * Commit the current database transaction.
 *
 * @returns {Promise<Object>} A promise that resolves when the transaction is committed.
 */
export function commit() {
  return run("COMMIT");
}

/**
 * Roll back the current database transaction.
 *
 * @returns {Promise<Object>} A promise that resolves when the transaction is rolled back.
 */
export function rollback() {
  return run("ROLLBACK");
}

export default db;
