/**
 * 📘 Subscriptions API – Quản lý gói đăng ký học
 */

const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

/**
 * @swagger
 * tags:
 *   name: Subscriptions
 *   description: API quản lý gói đăng ký học (Subscription Plans)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Subscription:
 *       type: object
 *       properties:
 *         subcription_id:
 *           type: integer
 *           example: 1
 *         user_id:
 *           type: integer
 *           example: 10
 *         subcription_name:
 *           type: string
 *           example: "Gói học 6 tháng"
 *         start_date:
 *           type: string
 *           format: date-time
 *           example: "2025-01-01T00:00:00Z"
 *         end_date:
 *           type: string
 *           format: date-time
 *           example: "2025-06-30T23:59:59Z"
 *         is_active:
 *           type: boolean
 *           example: true
 *         user_name:
 *           type: string
 *           example: "Nguyen Van A"
 *
 *     CreateSubscriptionRequest:
 *       type: object
 *       required:
 *         - subcription_name
 *         - start_date
 *         - end_date
 *       properties:
 *         subcription_name:
 *           type: string
 *           example: "Gói học 12 tháng"
 *         start_date:
 *           type: string
 *           format: date-time
 *           example: "2025-01-01T00:00:00Z"
 *         end_date:
 *           type: string
 *           format: date-time
 *           example: "2025-12-31T23:59:59Z"
 *         is_active:
 *           type: boolean
 *           example: true
 *
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "✅ Subscription created successfully"
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Error message"
 */

/**
 * @swagger
 * /api/subscriptions/ping:
 *   get:
 *     summary: Kiểm tra API Subscriptions hoạt động
 *     tags: [Subscriptions]
 *     responses:
 *       200:
 *         description: API hoạt động bình thường
 *         content:
 *           text/plain:
 *             example: "Subscriptions API is working!"
 */
router.get("/ping", (req, res) => res.send("Subscriptions API is working!"));

/**
 * @swagger
 * /api/subscriptions:
 *   get:
 *     summary: Lấy danh sách tất cả gói đăng ký (chỉ admin)
 *     tags: [Subscriptions]
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
 *                 $ref: '#/components/schemas/Subscription'
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT s.*, u.full_name AS user_name
      FROM Subscriptions s
      JOIN Users u ON s.user_id = u.user_id
      ORDER BY s.start_date DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /subscriptions:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/subscriptions/{id}:
 *   get:
 *     summary: Lấy thông tin chi tiết của một gói đăng ký theo ID
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của gói đăng ký
 *     responses:
 *       200:
 *         description: Chi tiết gói đăng ký
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Subscription'
 *       403:
 *         description: Không được phép xem
 *       404:
 *         description: Không tìm thấy gói đăng ký
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("subcription_id", sql.Int, req.params.id)
      .query(`
        SELECT s.*, u.full_name AS user_name
        FROM Subscriptions s
        JOIN Users u ON s.user_id = u.user_id
        WHERE s.subcription_id = @subcription_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    const sub = result.recordset[0];

    if (req.user.role === "customer" && sub.user_id !== req.user.id) {
      return res.status(403).json({ message: "You can only view your own subscriptions" });
    }

    res.json(sub);
  } catch (err) {
    console.error("❌ Error in GET /subscriptions/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/subscriptions/user/{user_id}:
 *   get:
 *     summary: Lấy danh sách gói đăng ký của một người dùng cụ thể
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của người dùng
 *     responses:
 *       200:
 *         description: Danh sách gói đăng ký
 *       403:
 *         description: Không có quyền xem
 *       404:
 *         description: Không có dữ liệu
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/user/:user_id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  try {
    if (req.user.role === "customer" && req.user.id !== parseInt(req.params.user_id)) {
      return res.status(403).json({ message: "You can only view your own subscriptions" });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input("user_id", sql.Int, req.params.user_id)
      .query(`
        SELECT * FROM Subscriptions
        WHERE user_id = @user_id
        ORDER BY start_date DESC
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "No subscriptions found for this user" });
    }

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /subscriptions/user/:user_id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/subscriptions/create:
 *   post:
 *     summary: Tạo gói đăng ký mới (chỉ người dùng đã đăng nhập)
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSubscriptionRequest'
 *     responses:
 *       201:
 *         description: Gói đăng ký được tạo thành công
 *       400:
 *         description: Thiếu thông tin hoặc ngày không hợp lệ
 *       500:
 *         description: Lỗi máy chủ
 */
router.post("/create", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  const { subcription_name, start_date, end_date, is_active } = req.body;
  const user_id = req.user?.id;

  if (!user_id || !subcription_name || !start_date || !end_date) {
    return res.status(400).json({ message: "Missing required fields: user_id, subcription_name, start_date, end_date" });
  }

  if (new Date(start_date) >= new Date(end_date)) {
    return res.status(400).json({ message: "End date must be after start date" });
  }

  try {
    const pool = await poolPromise;
    const checkUser = await pool.request()
      .input("user_id", sql.Int, user_id)
      .query("SELECT COUNT(*) AS count FROM Users WHERE user_id = @user_id");

    if (checkUser.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid user_id: user not found" });
    }

    await pool.request()
      .input("user_id", sql.Int, user_id)
      .input("subcription_name", sql.NVarChar(30), subcription_name)
      .input("start_date", sql.DateTime, start_date)
      .input("end_date", sql.DateTime, end_date)
      .input("is_active", sql.Bit, is_active ?? 1)
      .query(`
        INSERT INTO Subscriptions (user_id, subcription_name, start_date, end_date, is_active)
        VALUES (@user_id, @subcription_name, @start_date, @end_date, @is_active)
      `);

    res.status(201).json({ message: "✅ Subscription created successfully" });
  } catch (err) {
    console.error("❌ Error in POST /subscriptions:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/subscriptions/{id}:
 *   delete:
 *     summary: Xóa gói đăng ký (admin hoặc chính chủ)
 *     tags: [Subscriptions]
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
 *         description: Xóa thành công
 *       403:
 *         description: Không có quyền xóa
 *       404:
 *         description: Không tìm thấy gói đăng ký
 *       500:
 *         description: Lỗi máy chủ
 */
router.delete("/:id", verifyToken, authorizeRoles("admin", "customer"), async (req, res) => {
  try {
    const pool = await poolPromise;

    if (req.user.role === "customer") {
      const check = await pool.request()
        .input("subcription_id", sql.Int, req.params.id)
        .query("SELECT user_id FROM Subscriptions WHERE subcription_id = @subcription_id");

      if (check.recordset.length === 0 || check.recordset[0].user_id !== req.user.id) {
        return res.status(403).json({ message: "You are not allowed to delete this subscription" });
      }
    }

    const result = await pool.request()
      .input("subcription_id", sql.Int, req.params.id)
      .query("DELETE FROM Subscriptions WHERE subcription_id = @subcription_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    res.json({ message: "✅ Subscription deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /subscriptions/:id:", err.message);
    res.status(500).send(err.message);
  }
});

module.exports = router;
