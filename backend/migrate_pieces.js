const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = process.env.DB_PATH || path.resolve(__dirname, "./jewelry.db");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to the SQLite database. Running migrations...");

    const alterQueries = [
      "ALTER TABLE rolling_processes ADD COLUMN issue_pieces INTEGER DEFAULT 0",
      "ALTER TABLE rolling_processes ADD COLUMN return_pieces INTEGER DEFAULT 0",
      "ALTER TABLE press_processes ADD COLUMN issue_pieces INTEGER DEFAULT 0",
      "ALTER TABLE press_processes ADD COLUMN return_pieces INTEGER DEFAULT 0",
      "ALTER TABLE tpp_processes ADD COLUMN issue_pieces INTEGER DEFAULT 0",
      "ALTER TABLE tpp_processes ADD COLUMN return_pieces INTEGER DEFAULT 0",
      "ALTER TABLE packing_processes ADD COLUMN issue_pieces INTEGER DEFAULT 0",
      "ALTER TABLE packing_processes ADD COLUMN return_pieces INTEGER DEFAULT 0",
    ];

    db.serialize(() => {
      alterQueries.forEach((q) => {
        db.run(q, (err) => {
          if (err) {
            // Ignore "duplicate column name" errors
            if (!err.message.includes("duplicate column name")) {
              console.error("Migration error:", err.message);
            }
          } else {
            console.log("Migration successful:", q);
          }
        });
      });
    });
  }
});
