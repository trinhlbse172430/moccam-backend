const mysql = require('mysql2/promise');
require('dotenv').config();

// 2. Cấu hình kết nối cho MySQL
const config = {
    host: process.env.DB_SERVER,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// 3. Tạo pool kết nối bằng mysql2
const pool = mysql.createPool(config);

// 4. Kiểm tra kết nối (tùy chọn nhưng nên có)
pool.getConnection()
    .then(connection => {
        console.log("✅ Connected to MySQL database!");
        connection.release(); // Trả kết nối về pool
    })
    .catch(err => {
        console.error("❌ Database connection failed:", err.message);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.error('Database connection was closed.');
        }
        if (err.code === 'ER_CON_COUNT_ERROR') {
            console.error('Database has too many connections.');
        }
        if (err.code === 'ECONNREFUSED') {
            console.error('Database connection was refused.');
        }
        process.exit(1); // Thoát nếu không kết nối được
    });

// 5. Export pool (không cần export sql nữa)
module.exports = { pool };