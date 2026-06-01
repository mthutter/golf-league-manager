import sqlite3 from "sqlite3";

const db = new sqlite3.Database("./golf-league-db.db", (err) => {
  if (err) console.error(err.message);

  console.log("Connected to SQLite");
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

export default db;
