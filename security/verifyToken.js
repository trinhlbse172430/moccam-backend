const jwt = require("jsonwebtoken");
const { sql, poolPromise } = require("../db");
require("dotenv").config();

/**
 * 🛡️ Middleware: Xác thực token và lấy thông tin user từ DB
 */
const verifyToken = async (req, res, next) => {
  try {
    // 1️⃣ Lấy token từ header
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Bearer <token>

    if (!token) {
      return res.status(401).json({ message: "Unauthorized: missing user token" });
    }

    // 2️⃣ Giải mã token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.id) {
      return res.status(403).json({ message: "Invalid token payload" });
    }

    // 3️⃣ Truy vấn user thật từ DB (đảm bảo user vẫn tồn tại và lấy được role)
    const pool = await poolPromise;
    const result = await pool.request()
      .input("user_id", sql.Int, decoded.id)
      .query("SELECT user_id AS id, full_name, email, role FROM Users WHERE user_id = @user_id");

    const user = result.recordset[0];
    if (!user) {
      return res.status(404).json({ message: "User not found in system" });
    }

    // 4️⃣ Gắn thông tin user vào req để các API khác dùng
    req.user = user;

    next(); // ✅ Cho phép đi tiếp
  } catch (err) {
    console.error("❌ verifyToken error:", err.message);
    return res.status(403).json({ message: "Token is invalid or expired" });
  }
};

/**
 * 🔐 Middleware: Kiểm tra quyền truy cập
 * @param  {...string} roles Danh sách quyền được phép (vd: 'admin', 'employee', 'customer')
 */
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized: missing user data" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have access to this functionality" });
    }
    next();
  };
};

module.exports = { verifyToken, authorizeRoles };
