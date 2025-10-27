const express = require("express");
const router = express.Router();
const { pool } = require("../db"); // Import pool từ db.js mới
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// GET /api/notifications (Lấy danh sách thông báo)
router.get("/", verifyToken, async (req, res) => {
    try {
        let sqlQuery = "SELECT * FROM Notifications";
        const params = [];

        // Chỉ lọc nếu người dùng là 'customer'
        if (req.user.role === 'customer') {
            sqlQuery += " WHERE user_id = ? OR user_id IS NULL";
            params.push(req.user.id);
        }
        // Nếu là admin/employee, không có WHERE, lấy tất cả

        sqlQuery += " ORDER BY created_at DESC";

        const [rows] = await pool.query(sqlQuery, params);
        res.json(rows);
    } catch (err) {
        console.error("❌ Lỗi GET /notifications:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// POST /api/notifications/create (Tạo thông báo mới - Admin/Employee)
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    const { user_id, title, message, type } = req.body;

    if (!title || !message) {
        return res.status(400).json({ message: "Thiếu trường bắt buộc: title, message." });
    }

    try {
        const sqlInsert = `
            INSERT INTO Notifications (user_id, title, message, type, created_at)
            VALUES (?, ?, ?, ?, NOW())
        `;
        await pool.query(sqlInsert, [
            user_id || null, // Nếu user_id không có thì chèn NULL
            title,
            message,
            type || null
        ]);
        
        res.status(201).json({ message: "✅ Tạo thông báo thành công." });
    } catch (err) {
        console.error("❌ Lỗi POST /notification/create:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// DELETE /api/notifications/:id (Xóa thông báo - Admin/Employee)
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    try {
        const notificationId = req.params.id;
        const sqlDelete = "DELETE FROM Notifications WHERE notification_id = ?";
        const [result] = await pool.query(sqlDelete, [notificationId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Không tìm thấy thông báo." });
        }

        res.json({ message: "✅ Xóa thông báo thành công." });
    } catch (err) {
        console.error("❌ Lỗi DELETE /notifications/:id:", err.message);
         // Bắt lỗi khóa ngoại nếu có (mặc dù bảng này thường không bị tham chiếu)
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
             return res.status(400).json({ message: "Không thể xóa thông báo do ràng buộc dữ liệu.", reason: "Lỗi khóa ngoại." });
        }
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

module.exports = router;