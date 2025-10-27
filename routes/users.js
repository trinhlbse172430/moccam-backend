const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// GET /api/users/ping (Kiểm tra API)
router.get("/ping", (req, res) => res.send("Users API is working!"));

// GET /api/users (Lấy tất cả user - Admin only)
router.get("/", verifyToken, authorizeRoles("admin"), async (req, res) => {
    try {
        const currentAdminId = req.user.id;
        const sqlQuery = `
            SELECT user_id, email, full_name, date_of_birth, picture, phone_number, role, created_at 
            FROM Users
            WHERE user_id <> ? 
        `;
        const [rows] = await pool.query(sqlQuery, [currentAdminId]);
        res.json(rows);
    } catch (err) {
        console.error("❌ Lỗi GET /users:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// GET /api/users/:id (Lấy user theo ID)
router.get("/:id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
    try {
        const targetUserId = parseInt(req.params.id, 10);
        
        // Kiểm tra quyền: Customer chỉ xem được chính mình
        if (req.user.role === "customer" && req.user.id !== targetUserId) {
            return res.status(403).json({ message: "Bạn không được phép xem thông tin người dùng khác" });
        }
        // Admin/Employee có thể xem bất kỳ ai (trừ check logic trong authorizeRoles nếu cần)

        const sqlQuery = `
            SELECT user_id, full_name, email, phone_number, role, date_of_birth, picture, created_at
            FROM Users 
            WHERE user_id = ?
        `;
        const [rows] = await pool.query(sqlQuery, [targetUserId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Người dùng không tồn tại" });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error("❌ Lỗi GET /users/:id:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// POST /api/users/create (Tạo user mới - Admin/Employee only)
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    const { password, email, full_name, phone_number, role, date_of_birth, picture } = req.body;

    if (!password || !email || !full_name || !phone_number || !role) {
        return res.status(400).json({ message: "Thiếu trường bắt buộc: password, email, full_name, phone_number, role" });
    }
    // (Optional) Thêm kiểm tra role hợp lệ ('admin', 'employee', 'customer')

    try {
        // Kiểm tra email trùng
        const [emailRows] = await pool.query("SELECT user_id FROM Users WHERE email = ?", [email]);
        if (emailRows.length > 0) return res.status(400).json({ message: "Email đã tồn tại" });

        // Kiểm tra phone trùng (chỉ nếu có)
        if (phone_number) {
            const [phoneRows] = await pool.query("SELECT user_id FROM Users WHERE phone_number = ?", [phone_number]);
            if (phoneRows.length > 0) return res.status(400).json({ message: "Số điện thoại đã tồn tại" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const sqlInsert = `
            INSERT INTO Users (email, password, full_name, phone_number, role, date_of_birth, picture, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        await pool.query(sqlInsert, [
            email, hashedPassword, full_name, phone_number || null, role, date_of_birth || null, picture || null
        ]);

        res.status(201).json({ message: "✅ Thêm người dùng thành công" });
    } catch (err) {
        console.error("❌ Lỗi POST /users/create:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// PUT /api/users/:id (Cập nhật user)
router.put("/:id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
    const targetUserId = parseInt(req.params.id, 10);
    const { full_name, email, phone_number, role, password, date_of_birth, picture } = req.body;

    if (Object.keys(req.body).length === 0)
        return res.status(400).json({ message: "Không có trường nào để cập nhật" });

    // Kiểm tra quyền: Customer chỉ sửa được chính mình
    if (req.user.role === "customer" && req.user.id !== targetUserId) {
        return res.status(403).json({ message: "Bạn không được phép sửa thông tin người dùng khác" });
    }

    try {
        // Lấy thông tin user hiện có để so sánh
        const [existingRows] = await pool.query("SELECT * FROM Users WHERE user_id = ?", [targetUserId]);
        if (existingRows.length === 0)
            return res.status(404).json({ message: "Người dùng không tồn tại" });
        
        const user = existingRows[0];
        const setClauses = [];
        const params = [];

        // Xây dựng câu lệnh UPDATE động và kiểm tra trùng lặp
        if (full_name !== undefined && full_name !== user.full_name) { setClauses.push("full_name = ?"); params.push(full_name); }
        if (email !== undefined && email !== user.email) {
            const [emailCheck] = await pool.query("SELECT user_id FROM Users WHERE email = ? AND user_id <> ?", [email, targetUserId]);
            if (emailCheck.length > 0) return res.status(400).json({ message: "Email đã tồn tại" });
            setClauses.push("email = ?"); params.push(email);
        }
        if (phone_number !== undefined && phone_number !== user.phone_number) {
            // Chỉ kiểm tra trùng nếu phone_number mới không phải null/rỗng
            if(phone_number){
                 const [phoneCheck] = await pool.query("SELECT user_id FROM Users WHERE phone_number = ? AND user_id <> ?", [phone_number, targetUserId]);
                 if (phoneCheck.length > 0) return res.status(400).json({ message: "Số điện thoại đã tồn tại" });
            }
            setClauses.push("phone_number = ?"); params.push(phone_number || null);
        }
        // Chỉ Admin mới được đổi Role (ví dụ)
        if (role !== undefined && role !== user.role && req.user.role === 'admin') { setClauses.push("role = ?"); params.push(role); }
        if (date_of_birth !== undefined && date_of_birth !== user.date_of_birth) { setClauses.push("date_of_birth = ?"); params.push(date_of_birth || null); }
        if (picture !== undefined && picture !== user.picture) { setClauses.push("picture = ?"); params.push(picture || null); }
        if (password) {
            const hashed = await bcrypt.hash(password, 10);
            setClauses.push("password = ?"); params.push(hashed);
        }

        if (setClauses.length === 0)
            return res.status(400).json({ message: "Không có thông tin mới để cập nhật" });

        params.push(targetUserId); // Thêm user_id vào cuối mảng params cho mệnh đề WHERE

        const sqlUpdate = `UPDATE Users SET ${setClauses.join(", ")} WHERE user_id = ?`;
        const [result] = await pool.query(sqlUpdate, params);

        if (result.affectedRows === 0) {
            // Trường hợp này ít xảy ra vì đã kiểm tra user tồn tại ở trên
            return res.status(404).json({ message: "Người dùng không tìm thấy (lỗi không mong muốn)" });
        }

        res.json({ message: "✅ Cập nhật người dùng thành công" });
    } catch (err) {
        console.error("❌ Lỗi PUT /users/:id:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// DELETE /api/users/:id (Xóa user - Admin only)
router.delete("/:id", verifyToken, authorizeRoles("admin"), async (req, res) => {
    try {
        const userIdToDelete = parseInt(req.params.id, 10);

        if (req.user.id === userIdToDelete) {
            return res.status(403).json({ message: "Quản trị viên không thể tự xóa tài khoản của mình." });
        }

        // --- Kiểm tra các bảng liên quan ---
        const checks = [
            { table: "UserSubscriptions", column: "user_id", message: "Người dùng có gói đăng ký đang hoạt động hoặc đã hết hạn." },
            { table: "Payments", column: "user_id", message: "Người dùng có lịch sử thanh toán." },
            { table: "Vouchers", column: "created_by", message: "Người dùng đã tạo voucher. Vui lòng gán lại hoặc xóa voucher trước." },
            { table: "Notifications", column: "user_id", message: "Người dùng có thông báo cá nhân." },
            { table: "Comments", column: "user_id", message: "Người dùng đã bình luận." },
            { table: "LessonProgress", column: "user_id", message: "Người dùng có tiến độ học." },
            { table: "AIPracticeSessions", column: "user_id", message: "Người dùng có lịch sử luyện tập AI." },
            { table: "UserActivityLog", column: "user_id", message: "Người dùng có log hoạt động." },
            { table: "Leaderboard", column: "user_id", message: "Người dùng có trong bảng xếp hạng." }
            // Thêm các bảng khác nếu cần
        ];

        for (const check of checks) {
            const [rows] = await pool.query(`SELECT COUNT(*) AS count FROM ${check.table} WHERE ${check.column} = ?`, [userIdToDelete]);
            if (rows[0].count > 0) {
                return res.status(400).json({ message: "Không thể xóa người dùng này.", reason: check.message });
            }
        }

        // --- Tiến hành xóa ---
        const [result] = await pool.query("DELETE FROM Users WHERE user_id = ?", [userIdToDelete]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Người dùng không tồn tại" });
        }

        res.json({ message: "✅ Xóa người dùng thành công" });

    } catch (err) {
        console.error("❌ Lỗi DELETE /users/:id:", err.message);
        // Kiểm tra lỗi khóa ngoại cụ thể từ MySQL nếu muốn
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
             return res.status(400).json({ message: "Không thể xóa người dùng do ràng buộc dữ liệu.", reason: "Lỗi khóa ngoại." });
        }
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

module.exports = router;