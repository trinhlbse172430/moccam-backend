const jwt = require("jsonwebtoken");
const { sql, poolPromise } = require("../db");
require("dotenv").config();

// ✅ Kiểm tra token hợp lệ & lấy thông tin user thật từ DB
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ message: "No token, access denied" });
  }

  try {
    // Giải mã token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔒 Truy vấn user thật trong DB
    const pool = await poolPromise;
    const result = await pool.request()
      .input("user_id", sql.Int, decoded.id)
      .query("SELECT user_id, full_name, email, role FROM Users WHERE user_id = @user_id");

    const user = result.recordset[0];
    if (!user) {
      return res.status(404).json({ message: "User not found in system" });
    }

    req.user = user; // Gắn thông tin user thật vào request
    next();
  } catch (err) {
    console.error("❌ Lỗi verifyToken:", err.message);
    res.status(403).json({ message: "Token is invalid or expired" });
  }
};

// ✅ Kiểm tra quyền truy cập
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have access to this functionality" });
    }
    next();
  };
};

module.exports = { verifyToken, authorizeRoles };
