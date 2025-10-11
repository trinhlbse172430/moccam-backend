const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

/**
 * @swagger
 * tags:
 *   name: UserActivity
 *   description: API quản lý lịch sử hoạt động học tập (User Activity Log)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Activity:
 *       type: object
 *       properties:
 *         activity_id:
 *           type: integer
 *           example: 1
 *         user_id:
 *           type: integer
 *           example: 5
 *         full_name:
 *           type: string
 *           example: "Nguyễn Văn A"
 *         activity_date:
 *           type: string
 *           format: date
 *           example: "2025-10-10"
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "✅ Activity logged successfully for today."
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Server error"
 */

/**
 * @swagger
 * /api/activity:
 *   get:
 *     summary: Lấy toàn bộ lịch sử hoạt động người dùng (chỉ admin hoặc employee)
 *     tags: [UserActivity]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách lịch sử hoạt động được trả về thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Activity'
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT a.*, u.full_name
      FROM UserActivityLog a
      JOIN Users u ON a.user_id = u.user_id
      ORDER BY a.activity_date DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /activity:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * @swagger
 * /api/activity/log:
 *   post:
 *     summary: Ghi nhận hoạt động học tập trong ngày (người dùng tự động log 1 lần/ngày)
 *     description: 
 *       - Nếu user học lần đầu hôm nay → hệ thống sẽ thêm bản ghi mới.  
 *       - Nếu đã có log trong ngày → sẽ bỏ qua để tránh trùng lặp.
 *     tags: [UserActivity]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Log hoạt động thành công hoặc đã tồn tại
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Chưa đăng nhập hoặc token không hợp lệ
 *       403:
 *         description: Không thể ghi log thay người khác
 *       500:
 *         description: Lỗi máy chủ
 */
router.post("/log", verifyToken, authorizeRoles("customer", "employee", "admin"), async (req, res) => {
  const user_id = req.user.id;
  const today = new Date().toISOString().split("T")[0];

  try {
    const pool = await poolPromise;

    // 🔒 Chặn log cho người khác
    if (req.body.user_id && req.body.user_id !== user_id) {
      return res.status(403).json({ message: "You can only log your own activity" });
    }

    // 🔍 Kiểm tra đã có log hôm nay chưa
    const check = await pool.request()
      .input("user_id", sql.Int, user_id)
      .input("activity_date", sql.Date, today)
      .query(`
        SELECT COUNT(*) AS count
        FROM UserActivityLog
        WHERE user_id = @user_id AND activity_date = @activity_date
      `);

    if (check.recordset[0].count > 0) {
      return res.json({ message: "User has already logged activity today." });
    }

    // ✅ Ghi log mới
    await pool.request()
      .input("user_id", sql.Int, user_id)
      .input("activity_date", sql.Date, today)
      .query(`
        INSERT INTO UserActivityLog (user_id, activity_date)
        VALUES (@user_id, @activity_date)
      `);

    res.json({ message: "✅ Activity logged successfully for today." });
  } catch (err) {
    console.error("❌ Error in POST /activity/log:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * @swagger
 * /api/activity/{user_id}:
 *   get:
 *     summary: Lấy lịch sử hoạt động của 1 học viên cụ thể
 *     tags: [UserActivity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của người dùng cần xem lịch sử
 *     responses:
 *       200:
 *         description: Danh sách hoạt động được trả về thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Activity'
 *       403:
 *         description: Người dùng không được phép xem lịch sử của người khác
 *       404:
 *         description: Không có dữ liệu
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/:user_id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  try {
    if (req.user.role === "customer" && req.user.id !== parseInt(req.params.user_id)) {
      return res.status(403).json({ message: "You can only view your own activity log" });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input("user_id", sql.Int, req.params.user_id)
      .query(`
        SELECT activity_id, user_id, activity_date
        FROM UserActivityLog
        WHERE user_id = @user_id
        ORDER BY activity_date DESC
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "No activity found for this user" });
    }

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /activity/:user_id:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * @swagger
 * /api/activity/{id}:
 *   delete:
 *     summary: Xóa 1 bản ghi hoạt động (chỉ admin hoặc employee)
 *     tags: [UserActivity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của bản ghi hoạt động cần xóa
 *     responses:
 *       200:
 *         description: Xóa thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Không tìm thấy bản ghi
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("activity_id", sql.Int, req.params.id)
      .query("DELETE FROM UserActivityLog WHERE activity_id = @activity_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Activity not found" });
    }

    res.json({ message: "✅ Activity deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /activity/:id:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
