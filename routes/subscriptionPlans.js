const express = require("express");
const router = express.Router();
const { pool } = require("../db"); // Import pool từ db.js mới
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// GET /api/subscription-plans (Lấy danh sách gói)
router.get("/", async (req, res) => {
    try {
        // Luôn chỉ lấy các gói đang hoạt động cho mọi người xem
        const sqlQuery = "SELECT plan_id, plan_name, description, price, duration_in_days, is_active, currency FROM SubscriptionPlans WHERE is_active = 1 ORDER BY price ASC";
        const [rows] = await pool.query(sqlQuery);
        res.json(rows);
    } catch (err) {
        console.error("❌ Lỗi GET /subscription-plans:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// GET /api/subscription-plans/:id (Lấy chi tiết gói)
router.get("/:id", verifyToken, async (req, res) => { // Giữ verifyToken vì có thể admin muốn xem cả gói inactive
    try {
        const planId = req.params.id;
        const sqlQuery = "SELECT * FROM SubscriptionPlans WHERE plan_id = ?";
        const [rows] = await pool.query(sqlQuery, [planId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Không tìm thấy gói đăng ký." });
        }

        // Nếu người dùng là customer và gói không active, cũng báo not found
        if (req.user.role === 'customer' && !rows[0].is_active) {
             return res.status(404).json({ message: "Không tìm thấy gói đăng ký." });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error("❌ Lỗi GET /subscription-plans/:id:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// POST /api/subscription-plans/create (Tạo gói mới - Admin/Employee)
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    const { plan_name, description, price, duration_in_days, is_active = true } = req.body; // Mặc định is_active là true

    if (!plan_name || price === undefined || !duration_in_days) {
        return res.status(400).json({ message: "Thiếu trường bắt buộc: plan_name, price, duration_in_days." });
    }

    try {
        const sqlInsert = `
            INSERT INTO SubscriptionPlans (plan_name, description, price, currency, duration_in_days, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `;
        // Chuyển is_active sang 1 hoặc 0
        const isActiveBit = (is_active === true || is_active === 1) ? 1 : 0;
        const [result] = await pool.query(sqlInsert, [
            plan_name, description || null, price, 'VND', duration_in_days, isActiveBit
        ]);

        // Lấy lại bản ghi vừa tạo để trả về (tùy chọn)
        const [newPlanRows] = await pool.query("SELECT * FROM SubscriptionPlans WHERE plan_id = ?", [result.insertId]);

        res.status(201).json(newPlanRows[0]);

    } catch (err) {
        console.error("❌ Lỗi POST /subscription-plans/create:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// PUT /api/subscription-plans/:id (Cập nhật gói - Admin/Employee)
router.put("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    if (Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Không có trường nào để cập nhật." });
    }

    try {
        const planId = req.params.id;
        const { plan_name, description, price, duration_in_days, is_active } = req.body;

        const setClauses = [];
        const params = [];

        if (plan_name !== undefined) { setClauses.push("plan_name = ?"); params.push(plan_name); }
        if (description !== undefined) { setClauses.push("description = ?"); params.push(description); }
        if (price !== undefined) { setClauses.push("price = ?"); params.push(price); }
        if (duration_in_days !== undefined) { setClauses.push("duration_in_days = ?"); params.push(duration_in_days); }
        if (is_active !== undefined) { setClauses.push("is_active = ?"); params.push(is_active ? 1 : 0); } // Chuyển boolean thành 1/0

        if (setClauses.length === 0) {
            return res.status(400).json({ message: "Không có trường hợp lệ để cập nhật." });
        }

        params.push(planId); // Thêm plan_id vào cuối cho WHERE

        const sqlUpdate = `UPDATE SubscriptionPlans SET ${setClauses.join(", ")} WHERE plan_id = ?`;
        const [result] = await pool.query(sqlUpdate, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Không tìm thấy gói đăng ký." });
        }

        res.json({ message: "✅ Cập nhật gói đăng ký thành công." });
    } catch (err) {
        console.error("❌ Lỗi PUT /subscription-plans/:id:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// DELETE /api/subscription-plans/:id (Xóa gói - Admin/Employee)
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    try {
        const planIdToDelete = req.params.id;

        // Kiểm tra UserSubscriptions
        const [userSubRows] = await pool.query("SELECT COUNT(*) AS count FROM UserSubscriptions WHERE plan_id = ?", [planIdToDelete]);
        if (userSubRows[0].count > 0) {
            return res.status(400).json({ message: "Không thể xóa gói này.", reason: "Có người dùng đang hoặc đã đăng ký gói này." });
        }

        // Kiểm tra Payments
        const [paymentRows] = await pool.query("SELECT COUNT(*) AS count FROM Payments WHERE plan_id = ?", [planIdToDelete]);
        if (paymentRows[0].count > 0) {
            return res.status(400).json({ message: "Không thể xóa gói này.", reason: "Có lịch sử thanh toán liên quan đến gói này." });
        }

        // Tiến hành xóa
        const [result] = await pool.query("DELETE FROM SubscriptionPlans WHERE plan_id = ?", [planIdToDelete]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Không tìm thấy gói đăng ký." });
        }

        res.json({ message: "✅ Xóa gói đăng ký thành công." });

    } catch (err) {
        console.error("❌ Lỗi DELETE /subscription-plans/:id:", err.message);
        // Bắt lỗi khóa ngoại nếu có
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
             return res.status(400).json({ message: "Không thể xóa gói do ràng buộc dữ liệu.", reason: "Lỗi khóa ngoại." });
        }
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

module.exports = router;