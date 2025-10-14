const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

/**
 * @swagger
 * tags:
 *   name: UserSubscriptions
 *   description: 💎 Quản lý gói đăng ký của người dùng (User Subscriptions)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     UserSubscription:
 *       type: object
 *       properties:
 *         user_subscription_id:
 *           type: integer
 *           example: 15
 *         user_id:
 *           type: integer
 *           example: 3
 *         plan_id:
 *           type: integer
 *           example: 2
 *         status:
 *           type: string
 *           enum: [active, expired, canceled, pending]
 *           example: "active"
 *         start_date:
 *           type: string
 *           format: date-time
 *           example: "2025-10-01T00:00:00Z"
 *         end_date:
 *           type: string
 *           format: date-time
 *           example: "2025-11-01T00:00:00Z"
 *         plan_name:
 *           type: string
 *           example: "Premium Monthly Plan"
 *         full_name:
 *           type: string
 *           example: "Nguyen Van A"
 */

/* ===========================================================
   🟢 GET /api/user-subscriptions
   → Admin/Employee xem toàn bộ, Customer chỉ xem của chính họ
=========================================================== */
/**
 * @swagger
 * /api/user-subscriptions:
 *   get:
 *     summary: 📋 Lấy danh sách gói đăng ký người dùng
 *     tags: [UserSubscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách gói đăng ký trả về thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserSubscription'
 *       401:
 *         description: Không có hoặc token không hợp lệ
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  try {
    const pool = await poolPromise;
    let query = `
      SELECT us.*, u.full_name, sp.plan_name
      FROM UserSubscriptions us
      JOIN Users u ON us.user_id = u.user_id
      JOIN SubscriptionPlans sp ON us.plan_id = sp.plan_id
    `;
    const request = pool.request();

    if (req.user.role === "customer") {
      query += ` WHERE us.user_id = @user_id`;
      request.input("user_id", sql.Int, req.user.id);
    }

    query += ` ORDER BY us.start_date DESC`;
    const result = await request.query(query);

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /user-subscriptions:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===========================================================
   🟢 GET /api/user-subscriptions/:id
   → Xem chi tiết 1 gói đăng ký cụ thể
=========================================================== */
/**
 * @swagger
 * /api/user-subscriptions/{id}:
 *   get:
 *     summary: 🔍 Xem chi tiết một gói đăng ký cụ thể
 *     tags: [UserSubscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của bản ghi gói đăng ký
 *     responses:
 *       200:
 *         description: Chi tiết gói đăng ký
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserSubscription'
 *       403:
 *         description: Người dùng không có quyền truy cập
 *       404:
 *         description: Không tìm thấy gói đăng ký
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/:id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("user_subscription_id", sql.Int, req.params.id)
      .query(`
        SELECT us.*, u.full_name, sp.plan_name
        FROM UserSubscriptions us
        JOIN Users u ON us.user_id = u.user_id
        JOIN SubscriptionPlans sp ON us.plan_id = sp.plan_id
        WHERE us.user_subscription_id = @user_subscription_id
      `);

    if (result.recordset.length === 0)
      return res.status(404).json({ message: "User subscription not found" });

    const subscription = result.recordset[0];

    // 🔒 Customer chỉ được xem của chính họ
    if (req.user.role === "customer" && subscription.user_id !== req.user.id)
      return res.status(403).json({ message: "You can only view your own subscriptions." });

    res.json(subscription);
  } catch (err) {
    console.error("❌ Error in GET /user-subscriptions/:id:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===========================================================
   🟡 PUT /api/user-subscriptions/:id/cancel
   → Hủy gói đăng ký (Customer/Admin/Employee)
=========================================================== */
/**
 * @swagger
 * /api/user-subscriptions/{id}/cancel:
 *   put:
 *     summary: ❌ Hủy gói đăng ký đang hoạt động
 *     tags: [UserSubscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của gói đăng ký cần hủy
 *     responses:
 *       200:
 *         description: Hủy gói đăng ký thành công
 *         content:
 *           application/json:
 *             example:
 *               message: "✅ Subscription canceled successfully."
 *       400:
 *         description: Không thể hủy gói không ở trạng thái active
 *       403:
 *         description: Không có quyền hủy gói này
 *       404:
 *         description: Không tìm thấy gói đăng ký
 *       500:
 *         description: Lỗi máy chủ
 */
router.put("/:id/cancel", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  try {
    const pool = await poolPromise;

    const subResult = await pool.request()
      .input("user_subscription_id", sql.Int, req.params.id)
      .query("SELECT * FROM UserSubscriptions WHERE user_subscription_id = @user_subscription_id");

    if (subResult.recordset.length === 0)
      return res.status(404).json({ message: "User subscription not found" });

    const subscription = subResult.recordset[0];

    // 🔒 Customer chỉ được hủy của chính họ
    if (req.user.role === "customer" && subscription.user_id !== req.user.id)
      return res.status(403).json({ message: "You can only cancel your own subscriptions." });

    if (subscription.status !== "active")
      return res.status(400).json({ message: `Cannot cancel a subscription with status '${subscription.status}'.` });

    await pool.request()
      .input("user_subscription_id", sql.Int, req.params.id)
      .query("UPDATE UserSubscriptions SET status = 'canceled' WHERE user_subscription_id = @user_subscription_id");

    res.json({ message: "✅ Subscription canceled successfully." });
  } catch (err) {
    console.error("❌ Error in PUT /user-subscriptions/:id/cancel:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
