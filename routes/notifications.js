const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: API quản lý thông báo trong hệ thống
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       properties:
 *         notification_id:
 *           type: integer
 *           example: 1
 *         user_id:
 *           type: integer
 *           example: 10
 *         title:
 *           type: string
 *           example: "Thanh toán thành công"
 *         message:
 *           type: string
 *           example: "Cảm ơn bạn đã thanh toán gói học 6 tháng."
 *         type:
 *           type: string
 *           example: "payment"
 *         is_read:
 *           type: boolean
 *           example: false
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-10T09:30:00Z"
 *         read_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: null
 *         user_name:
 *           type: string
 *           example: "Nguyen Van A"
 *         role:
 *           type: string
 *           example: "customer"
 *     CreateNotificationRequest:
 *       type: object
 *       required:
 *         - user_id
 *         - title
 *         - message
 *         - type
 *       properties:
 *         user_id:
 *           type: integer
 *           example: 10
 *         title:
 *           type: string
 *           example: "Cập nhật tài khoản"
 *         message:
 *           type: string
 *           example: "Thông tin cá nhân của bạn đã được cập nhật thành công."
 *         type:
 *           type: string
 *           example: "system"
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "✅ Notification sent successfully"
 */

/**
 * @swagger
 * /api/notifications/ping:
 *   get:
 *     summary: Kiểm tra API hoạt động
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: API hoạt động bình thường
 *         content:
 *           text/plain:
 *             example: "Notifications API is working!"
 */
// ✅ Test route
router.get("/ping", (req, res) => {
  res.send("Notifications API is working!");
});

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Lấy danh sách toàn bộ thông báo (chỉ admin hoặc employee)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách thông báo
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Notification'
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */
/**
 * 📌 GET /api/notifications
 * Lấy tất cả thông báo (chỉ cho admin/employee)
 */
router.get("/", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT n.*, u.full_name AS user_name, u.role
      FROM Notifications n
      JOIN Users u ON n.user_id = u.user_id
      ORDER BY n.created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /notifications:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/notifications/user/{user_id}:
 *   get:
 *     summary: Lấy tất cả thông báo của 1 người dùng cụ thể
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID người dùng
 *     responses:
 *       200:
 *         description: Danh sách thông báo của người dùng
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Notification'
 *       404:
 *         description: Không tìm thấy thông báo
 *       500:
 *         description: Lỗi máy chủ
 */
/**
 * 📌 GET /api/notifications/user/:user_id
 * Lấy tất cả thông báo của 1 người dùng cụ thể
 */
router.get("/user/:user_id", verifyToken, async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("user_id", sql.Int, req.params.user_id)
      .query(`
        SELECT * FROM Notifications
        WHERE user_id = @user_id
        ORDER BY created_at DESC
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "No notifications found for this user" });
    }

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /notifications/user/:user_id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/notifications:
 *   post:
 *     summary: Gửi thông báo mới cho người dùng (chỉ admin/employee)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateNotificationRequest'
 *     responses:
 *       201:
 *         description: Tạo thông báo thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Thiếu dữ liệu hoặc user không tồn tại
 *       500:
 *         description: Lỗi máy chủ
 */
/**
 * 📌 POST /api/notifications
 * Gửi thông báo mới cho user (admin/employee)
 */
router.post("/", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { user_id, title, message, type } = req.body;

  if (!user_id || !title || !message || !type) {
    return res.status(400).json({ message: "Missing required fields: user_id, title, message, type" });
  }

  try {
    const pool = await poolPromise;

    // 🔍 Kiểm tra user_id hợp lệ
    const checkUser = await pool.request()
      .input("user_id", sql.Int, user_id)
      .query("SELECT COUNT(*) AS count FROM Users WHERE user_id = @user_id");

    if (checkUser.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid user_id: user not found" });
    }

    // ✅ Thêm thông báo
    await pool.request()
      .input("user_id", sql.Int, user_id)
      .input("title", sql.NVarChar(100), title)
      .input("message", sql.NVarChar(500), message)
      .input("type", sql.NVarChar(50), type)
      .query(`
        INSERT INTO Notifications (user_id, title, message, type, is_read, created_at)
        VALUES (@user_id, @title, @message, @type, 0, GETDATE())
      `);

    res.status(201).json({ message: "✅ Notification sent successfully" });
  } catch (err) {
    console.error("❌ Error in POST /notifications:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/notifications/read/{id}:
 *   put:
 *     summary: Đánh dấu 1 thông báo là đã đọc
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của thông báo
 *     responses:
 *       200:
 *         description: Thông báo được đánh dấu đã đọc
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Không tìm thấy thông báo
 *       500:
 *         description: Lỗi máy chủ
 */
/**
 * 📌 PUT /api/notifications/read/:id
 * Đánh dấu 1 thông báo là đã đọc
 */
router.put("/read/:id", verifyToken, async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("notification_id", sql.Int, req.params.id)
      .query(`
        UPDATE Notifications
        SET is_read = 1,
            read_at = GETDATE()
        WHERE notification_id = @notification_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json({ message: "✅ Notification marked as read" });
  } catch (err) {
    console.error("❌ Error in PUT /notifications/read/:id:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/notifications/read-all/{user_id}:
 *   put:
 *     summary: Đánh dấu tất cả thông báo của người dùng là đã đọc
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID người dùng
 *     responses:
 *       200:
 *         description: Đánh dấu tất cả thông báo đã đọc thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 PUT /api/notifications/read-all/:user_id
 * Đánh dấu toàn bộ thông báo của 1 user là đã đọc
 */
router.put("/read-all/:user_id", verifyToken, async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("user_id", sql.Int, req.params.user_id)
      .query(`
        UPDATE Notifications
        SET is_read = 1,
            read_at = GETDATE()
        WHERE user_id = @user_id AND is_read = 0
      `);

    res.json({ message: `✅ Marked ${result.rowsAffected[0]} notifications as read` });
  } catch (err) {
    console.error("❌ Error in PUT /notifications/read-all/:user_id:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     summary: Xóa 1 thông báo (chỉ admin/employee)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID thông báo cần xóa
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       404:
 *         description: Không tìm thấy thông báo
 *       500:
 *         description: Lỗi máy chủ
 */
/**
 * 📌 DELETE /api/notifications/:id
 * Xóa 1 thông báo (admin hoặc employee)
 */
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("notification_id", sql.Int, req.params.id)
      .query("DELETE FROM Notifications WHERE notification_id = @notification_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json({ message: "✅ Notification deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /notifications/:id:", err.message);
    res.status(500).send(err.message);
  }
});

module.exports = router;
