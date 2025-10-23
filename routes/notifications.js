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
 *           nullable: true
 *           description: "ID người nhận thông báo (null nếu là thông báo chung cho tất cả người dùng)"
 *           example: 15
 *         title:
 *           type: string
 *           example: "Gói của bạn sắp hết hạn"
 *         message:
 *           type: string
 *           example: "Gói đăng ký của bạn sẽ hết hạn trong 3 ngày tới."
 *         type:
 *           type: string
 *           example: "subscription_reminder"
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-16T08:00:00Z"
 *     CreateNotificationRequest:
 *       type: object
 *       required:
 *         - title
 *         - message
 *       properties:
 *         user_id:
 *           type: integer
 *           nullable: true
 *           description: "ID người nhận thông báo. Nếu bỏ trống hoặc null → gửi cho tất cả người dùng."
 *           example: 15
 *         title:
 *           type: string
 *           description: "Tiêu đề thông báo"
 *           example: "Bảo trì hệ thống"
 *         message:
 *           type: string
 *           description: "Nội dung thông báo gửi đến người dùng"
 *           example: "Hệ thống sẽ tạm dừng để cập nhật vào lúc 2h sáng ngày mai."
 *         type:
 *           type: string
 *           description: "Loại thông báo (ví dụ: system_update, subscription_reminder, promotion)"
 *           example: "system_update"
 */
/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Lấy danh sách thông báo của người dùng hiện tại (bao gồm thông báo chung)
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
 *       401:
 *         description: Không có quyền truy cập (thiếu hoặc sai token)
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/", verifyToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        let query = "SELECT * FROM Notifications"; // Bắt đầu với câu lệnh lấy tất cả
        const request = pool.request(); // Tạo request trước

        // 💡 Logic mới: Chỉ lọc nếu người dùng là 'customer'
        if (req.user.role === 'customer') {
            query += " WHERE user_id = @current_user_id OR user_id IS NULL";
            request.input('current_user_id', sql.Int, req.user.id);
        }
        // Nếu là admin/employee, không cần thêm mệnh đề WHERE, sẽ lấy tất cả

        query += " ORDER BY created_at DESC"; // Luôn sắp xếp

        const result = await request.query(query); // Thực thi query đã được điều chỉnh

        res.json(result.recordset);
    } catch (err) {
        console.error("❌ Error in GET /notifications:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * @swagger
 * /api/notifications/create:
 *   post:
 *     summary: Tạo thông báo mới (chỉ dành cho admin hoặc employee)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateNotificationRequest'
 *           examples:
 *             Gửi thông báo hệ thống (tất cả người dùng):
 *               value:
 *                 title: "Bảo trì hệ thống"
 *                 message: "Hệ thống sẽ tạm dừng để cập nhật vào lúc 2h sáng ngày mai."
 *                 type: "system_update"
 *             Gửi thông báo cho 1 người dùng cụ thể:
 *               value:
 *                 user_id: 15
 *                 title: "Gói của bạn sắp hết hạn"
 *                 message: "Gói đăng ký của bạn sẽ hết hạn trong 3 ngày tới."
 *                 type: "subscription_reminder"
 *     responses:
 *       201:
 *         description: Tạo thông báo thành công
 *         content:
 *           application/json:
 *             schema:
 *               example:
 *                 message: "✅ Notification created successfully."
 *       400:
 *         description: Thiếu thông tin bắt buộc (title, message)
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */

router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    const { user_id, title, message, type } = req.body;

    if (!title || !message) {
        return res.status(400).json({ message: "Missing required fields: title, message." });
    }

    try {
        const pool = await poolPromise;
        await pool.request()
            .input('user_id', sql.Int, user_id || null) // Nếu user_id không có thì chèn NULL
            .input('title', sql.NVarChar(50), title)
            .input('message', sql.NVarChar(255), message)
            .input('type', sql.NVarChar(30), type || null)
            .query(`
                INSERT INTO Notifications (user_id, title, message, type)
                VALUES (@user_id, @title, @message, @type)
            `);
        
        res.status(201).json({ message: "✅ Notification created successfully." });
    } catch (err) {
        console.error("❌ Error in POST /notifications:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     summary: Xóa thông báo theo ID (chỉ dành cho admin hoặc employee)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Xóa thông báo thành công
 *         content:
 *           application/json:
 *             schema:
 *               example:
 *                 message: "✅ Notification deleted successfully."
 *       404:
 *         description: Không tìm thấy thông báo
 *       500:
 *         description: Lỗi máy chủ
 */
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('notification_id', sql.Int, req.params.id)
            .query("DELETE FROM Notifications WHERE notification_id = @notification_id");

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Notification not found." });
        }

        res.json({ message: "✅ Notification deleted successfully." });
    } catch (err) {
        console.error("❌ Error in DELETE /notifications/:id:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;