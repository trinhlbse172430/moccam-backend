const express = require("express");
const router = express.Router();
const { pool } = require("../db"); // Import pool từ db.js mới
const { verifyToken, authorizeRoles } = require("../security/verifyToken");
const { nanoid } = require('nanoid');

// GET /api/vouchers (Lấy tất cả voucher - Admin/Employee)
router.get("/", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    try {
        const sqlQuery = "SELECT * FROM Vouchers ORDER BY created_at DESC";
        const [rows] = await pool.query(sqlQuery);
        res.json(rows);
    } catch (err) {
        console.error("❌ Lỗi GET /vouchers:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// GET /api/vouchers/check/:code (Kiểm tra voucher - Mọi người dùng đã login)
router.get("/check/:code", verifyToken, async (req, res) => {
    try {
        const sqlQuery = "SELECT * FROM Vouchers WHERE code = ?";
        const [rows] = await pool.query(sqlQuery, [req.params.code]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Không tìm thấy voucher" });
        }

        const voucher = rows[0];
        const now = new Date();
        const startDate = new Date(voucher.start_date);
        const endDate = new Date(voucher.end_date);


        if (voucher.used_count >= voucher.max_usage) {
            return res.status(400).json({ message: "Voucher đã hết lượt sử dụng" });
        }
        if (now < startDate || now > endDate) {
            return res.status(400).json({ message: "Voucher đã hết hạn hoặc chưa có hiệu lực" });
        }

        res.json(voucher);
    } catch (err) {
        console.error("❌ Lỗi GET /vouchers/check/:code:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// POST /api/vouchers/create (Tạo voucher - Admin/Employee)
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    const { description, discount_value, max_usage, start_date, end_date } = req.body;

    if (!description || discount_value === undefined || !max_usage || !start_date || !end_date) {
        return res.status(400).json({ message: "Thiếu trường thông tin bắt buộc." });
    }
    if (new Date(start_date) >= new Date(end_date)) {
        return res.status(400).json({ message: "Ngày kết thúc phải sau ngày bắt đầu." });
    }

    try {
        let uniqueCode;
        let isCodeUnique = false;
        do {
            uniqueCode = nanoid(10).toUpperCase();
            const [rows] = await pool.query("SELECT COUNT(*) AS count FROM Vouchers WHERE code = ?", [uniqueCode]);
            if (rows[0].count === 0) {
                isCodeUnique = true;
            }
        } while (!isCodeUnique);

        const sqlInsert = `
            INSERT INTO Vouchers (code, description, discount_value, max_usage, start_date, end_date, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        await pool.query(sqlInsert, [
            uniqueCode, description, discount_value, max_usage, start_date, end_date, req.user.id
        ]);

        res.status(201).json({
            message: "✅ Tạo voucher thành công",
            code: uniqueCode
        });
    } catch (err) {
        console.error("❌ Lỗi POST /vouchers/create:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// PUT /api/vouchers/:id (Cập nhật voucher - Admin/Employee)
router.put("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    if (Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Không có trường nào để cập nhật." });
    }

    try {
        const voucherId = req.params.id;
        const { description, discount_value, max_usage, start_date, end_date } = req.body;

        const setClauses = [];
        const params = [];

        // Xây dựng câu lệnh SET động
        if (description !== undefined) { setClauses.push("description = ?"); params.push(description); }
        if (discount_value !== undefined) { setClauses.push("discount_value = ?"); params.push(discount_value); }
        if (max_usage !== undefined) { setClauses.push("max_usage = ?"); params.push(max_usage); }
        if (start_date !== undefined) { setClauses.push("start_date = ?"); params.push(start_date); }
        if (end_date !== undefined) { setClauses.push("end_date = ?"); params.push(end_date); }
        if (setClauses.length === 0) {
            return res.status(400).json({ message: "Không có trường hợp lệ để cập nhật." });
        }

        params.push(voucherId); // Thêm voucher_id vào cuối cho mệnh đề WHERE

        const sqlUpdate = `UPDATE Vouchers SET ${setClauses.join(", ")} WHERE voucher_id = ?`;
        const [result] = await pool.query(sqlUpdate, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Không tìm thấy voucher." });
        }

        res.json({ message: "✅ Cập nhật voucher thành công." });
    } catch (err) {
        console.error("❌ Lỗi PUT /vouchers/:id:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// DELETE /api/vouchers/:id (Xóa voucher - Admin/Employee)
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    try {
        const voucherId = req.params.id;

        // (Quan trọng) Kiểm tra xem voucher có đang được tham chiếu trong Payments không
        const [paymentRows] = await pool.query("SELECT COUNT(*) AS count FROM Payments WHERE voucher_id = ?", [voucherId]);
        if (paymentRows[0].count > 0) {
             return res.status(400).json({ message: "Không thể xóa voucher này vì nó đã được sử dụng trong lịch sử thanh toán." });
        }

        const [result] = await pool.query("DELETE FROM Vouchers WHERE voucher_id = ?", [voucherId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Không tìm thấy voucher." });
        }

        res.json({ message: "✅ Xóa voucher thành công." });
    } catch (err) {
        console.error("❌ Lỗi DELETE /vouchers/:id:", err.message);
         // Bắt lỗi khóa ngoại nếu có (mặc dù đã kiểm tra Payments)
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
             return res.status(400).json({ message: "Không thể xóa voucher do ràng buộc dữ liệu.", reason: "Lỗi khóa ngoại." });
        }
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

module.exports = router;