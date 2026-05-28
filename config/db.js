import sqlite3 from "sqlite3";

const db = new sqlite3.Database("./golf-league-db.db", (err) => {
  if (err) console.error(err.message);

  console.log("Connected to SQLite");
});

export default db;
