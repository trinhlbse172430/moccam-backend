const express = require("express");
const router = express.Router();
const { pool } = require("../db"); // Import pool từ db.js mới
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// GET /api/user-subscriptions (Lấy danh sách subscriptions)
router.get("/", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
    try {
        let sqlQuery = `
            SELECT us.*, u.full_name, sp.plan_name
            FROM UserSubscriptions us
            JOIN Users u ON us.user_id = u.user_id
            JOIN SubscriptionPlans sp ON us.plan_id = sp.plan_id
        `;
        const params = [];

        // Nếu là customer, chỉ cho xem của chính mình
        if (req.user.role === 'customer') {
            sqlQuery += ` WHERE us.user_id = ?`;
            params.push(req.user.id);
        }

        sqlQuery += ` ORDER BY us.start_date DESC`;
        const [rows] = await pool.query(sqlQuery, params);

        res.json(rows);
    } catch (err) {
        console.error("❌ Lỗi GET /user-subscriptions:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// GET /api/user-subscriptions/:id (Lấy chi tiết subscription)
router.get("/:id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
    try {
        const userSubscriptionId = req.params.id;
        const sqlQuery = `
            SELECT us.*, u.full_name, sp.plan_name
            FROM UserSubscriptions us
            JOIN Users u ON us.user_id = u.user_id
            JOIN SubscriptionPlans sp ON us.plan_id = sp.plan_id
            WHERE us.user_subscription_id = ?
        `;
        const [rows] = await pool.query(sqlQuery, [userSubscriptionId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Không tìm thấy gói đăng ký người dùng" });
        }

        const subscription = rows[0];

        // Customer chỉ được xem của chính mình
        if (req.user.role === 'customer' && subscription.user_id !== req.user.id) {
            return res.status(403).json({ message: "Bạn chỉ được phép xem gói đăng ký của mình." });
        }

        res.json(subscription);
    } catch (err)
    {
        console.error("❌ Lỗi GET /user-subscriptions/:id:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// PUT /api/user-subscriptions/:id/cancel (Hủy subscription)
router.put("/:id/cancel", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
    try {
        const userSubscriptionId = req.params.id;
        
        // 1. Lấy thông tin subscription để kiểm tra
        const [subRows] = await pool.query("SELECT * FROM UserSubscriptions WHERE user_subscription_id = ?", [userSubscriptionId]);

        if (subRows.length === 0) {
            return res.status(404).json({ message: "Không tìm thấy gói đăng ký người dùng" });
        }

        const subscription = subRows[0];

        // 2. Kiểm tra quyền
        if (req.user.role === 'customer' && subscription.user_id !== req.user.id) {
            return res.status(403).json({ message: "Bạn chỉ được phép hủy gói đăng ký của mình." });
        }

        // 3. Kiểm tra logic (chỉ có thể hủy gói đang 'active')
        if (subscription.status !== 'active') {
            return res.status(400).json({ message: `Không thể hủy gói đăng ký với trạng thái '${subscription.status}'.` });
        }

        // 4. Cập nhật trạng thái
        const sqlUpdate = "UPDATE UserSubscriptions SET status = 'canceled' WHERE user_subscription_id = ?";
        const [result] = await pool.query(sqlUpdate, [userSubscriptionId]);

        if (result.affectedRows === 0) {
             // Trường hợp hy hữu nếu ID bị xóa ngay sau khi select
             return res.status(404).json({ message: "Không tìm thấy gói đăng ký người dùng (lỗi không mong muốn)." });
        }

        res.json({ message: "✅ Hủy gói đăng ký thành công." });

    } catch (err) {
        console.error("❌ Lỗi PUT /user-subscriptions/:id/cancel:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

module.exports = router;