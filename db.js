const sql = require("mssql");
require("dotenv").config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    port: 1433,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log("✅ Connected to SQL Server");
        return pool;
    })
    .catch(err => {
        console.error("❌ Database connection failed:", err);
        process.exit(1);
    });

module.exports = { sql, poolPromise };
