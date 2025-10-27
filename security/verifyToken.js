const jwt = require("jsonwebtoken");
const { pool } = require("../db"); // Import pool từ db.js mới
require("dotenv").config();

/**
 * 🛡️ Middleware: Xác thực token và lấy thông tin user từ DB
 */
const verifyToken = async (req, res, next) => {
    try {
        // 1️⃣ Lấy token từ header
        const authHeader = req.headers["authorization"];
        const token = authHeader && authHeader.startsWith("Bearer ") && authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({ message: "🚫 Chưa cung cấp token xác thực" });
        }

        // 2️⃣ Giải mã token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
             // Phân biệt lỗi hết hạn và lỗi sai token
             if (jwtError.name === 'TokenExpiredError') {
                 return res.status(401).json({ message: "Token đã hết hạn" });
             }
             return res.status(401).json({ message: "Token không hợp lệ" });
        }


        if (!decoded?.id) {
            return res.status(401).json({ message: "Token không chứa thông tin user ID" });
        }

        // 3️⃣ Truy vấn user thật từ DB (đảm bảo user vẫn tồn tại)
        const sqlQuery = "SELECT user_id, full_name, email, role FROM Users WHERE user_id = ?";
        const [rows] = await pool.query(sqlQuery, [decoded.id]);

        const user = rows[0];
        if (!user) {
            return res.status(401).json({ message: "Người dùng không còn tồn tại trong hệ thống" });
        }

        // 4️⃣ Gắn thông tin user vào req để các API khác dùng
        // Đổi tên các trường trả về từ DB cho khớp với cách dùng trong token (id thay vì user_id)
        req.user = {
            id: user.user_id,
            name: user.full_name,
            email: user.email,
            role: user.role
        };

        next(); // ✅ Cho phép đi tiếp
    } catch (err) {
        console.error("❌ Lỗi verifyToken:", err.message);
        // Trả về lỗi 500 nếu có lỗi không lường trước (vd: lỗi DB)
        return res.status(500).json({ message: "Lỗi máy chủ khi xác thực token" });
    }
};

/**
 * 🔐 Middleware: Kiểm tra quyền truy cập
 * @param {...string} roles Danh sách quyền được phép (vd: 'admin', 'employee', 'customer')
 */
const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        // Middleware này chạy SAU verifyToken, nên req.user phải tồn tại
        if (!req.user?.role) { // Kiểm tra kỹ hơn
             // Lỗi này không nên xảy ra nếu verifyToken chạy đúng
             console.error("Lỗi authorizeRoles: req.user không có thông tin role");
             return res.status(500).json({ message: "Lỗi hệ thống: Không thể xác định vai trò người dùng." });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: `🚫 Bạn không có quyền truy cập chức năng này. Yêu cầu quyền: ${roles.join(' hoặc ')}.` });
        }
        next(); // ✅ Có quyền, đi tiếp
    };
};

module.exports = { verifyToken, authorizeRoles };