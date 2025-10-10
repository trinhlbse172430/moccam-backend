const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");

/**
 * @swagger
 * tags:
 *   name: CustomerProgress
 *   description: API quản lý tiến độ học tập của khách hàng
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     CustomerProgress:
 *       type: object
 *       properties:
 *         progress_id:
 *           type: integer
 *           example: 1
 *         customer_id:
 *           type: integer
 *           example: 15
 *         lesson_id:
 *           type: integer
 *           example: 5
 *         status:
 *           type: string
 *           example: "completed"
 *         last_watched:
 *           type: string
 *           format: date-time
 *           example: "2025-10-10T09:30:00Z"
 *         lesson_name:
 *           type: string
 *           example: "Giới thiệu về Đàn Tranh"
 *
 *     CreateProgressRequest:
 *       type: object
 *       required:
 *         - customer_id
 *         - lesson_id
 *         - status
 *       properties:
 *         customer_id:
 *           type: integer
 *           example: 15
 *         lesson_id:
 *           type: integer
 *           example: 5
 *         status:
 *           type: string
 *           example: "in_progress"
 *         last_watched:
 *           type: string
 *           format: date-time
 *           example: "2025-10-10T10:00:00Z"
 *
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "✅ Customer progress added successfully"
 */

/**
 * @swagger
 * /api/customer-progress/ping:
 *   get:
 *     summary: Kiểm tra API hoạt động
 *     tags: [CustomerProgress]
 *     responses:
 *       200:
 *         description: API hoạt động bình thường
 *         content:
 *           text/plain:
 *             example: "Customer Progress API is working!"
 */
// ✅ Test route
router.get("/ping", (req, res) => {
  res.send("Customer Progress API is working!");
});

/**
 * @swagger
 * /api/customer-progress:
 *   get:
 *     summary: Lấy danh sách toàn bộ tiến độ học tập
 *     tags: [CustomerProgress]
 *     responses:
 *       200:
 *         description: Danh sách tiến độ học tập
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CustomerProgress'
 *       500:
 *         description: Lỗi máy chủ
 */
/**
 * 📌 GET /api/customer-progress
 * Lấy tất cả tiến độ học của khách hàng
 */
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM CustomerProgress");
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /customer-progress:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/customer-progress/{id}:
 *   get:
 *     summary: Lấy tiến độ học theo ID
 *     tags: [CustomerProgress]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của tiến độ học
 *     responses:
 *       200:
 *         description: Thông tin tiến độ học
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomerProgress'
 *       404:
 *         description: Không tìm thấy tiến độ học
 *       500:
 *         description: Lỗi máy chủ
 */
/**
 * 📌 GET /api/customer-progress/:id
 * Lấy tiến độ học theo ID
 */
router.get("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("progress_id", sql.Int, req.params.id)
      .query("SELECT * FROM CustomerProgress WHERE progress_id = @progress_id");

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Progress not found" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in GET /customer-progress/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/customer-progress/{id}:
 *   get:
 *     summary: Lấy tiến độ học theo ID
 *     tags: [CustomerProgress]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của tiến độ học
 *     responses:
 *       200:
 *         description: Thông tin tiến độ học
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomerProgress'
 *       404:
 *         description: Không tìm thấy tiến độ học
 *       500:
 *         description: Lỗi máy chủ
 */
/**
 * 📌 GET /api/customer-progress/customer/:customer_id
 * Lấy tiến độ học của một khách hàng cụ thể
 */
router.get("/customer/:customer_id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("customer_id", sql.Int, req.params.customer_id)
      .query(`
        SELECT cp.*, l.lesson_name
        FROM CustomerProgress cp
        JOIN Lessons l ON cp.lesson_id = l.lesson_id
        WHERE cp.customer_id = @customer_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "No progress found for this customer" });
    }

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /customer-progress/customer/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/customer-progress:
 *   post:
 *     summary: Thêm tiến độ học mới
 *     tags: [CustomerProgress]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProgressRequest'
 *     responses:
 *       201:
 *         description: Thêm tiến độ thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc khách hàng/bài học không tồn tại
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 POST /api/customer-progress
 * Thêm tiến độ học mới
 * Required: customer_id, lesson_id, status
 */
router.post("/", async (req, res) => {
  const { customer_id, lesson_id, status, last_watched } = req.body;

  if (!customer_id || !lesson_id || !status) {
    return res.status(400).json({ message: "Missing required fields: customer_id, lesson_id, status" });
  }

  try {
    const pool = await poolPromise;

    // 🔍 Kiểm tra customer_id tồn tại
    const checkCustomer = await pool.request()
      .input("customer_id", sql.Int, customer_id)
      .query("SELECT COUNT(*) AS count FROM Customers WHERE customer_id = @customer_id");

    if (checkCustomer.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid customer_id: customer not found" });
    }

    // 🔍 Kiểm tra lesson_id tồn tại
    const checkLesson = await pool.request()
      .input("lesson_id", sql.Int, lesson_id)
      .query("SELECT COUNT(*) AS count FROM Lessons WHERE lesson_id = @lesson_id");

    if (checkLesson.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid lesson_id: lesson not found" });
    }

    // ✅ Thêm tiến độ mới
    await pool.request()
      .input("customer_id", sql.Int, customer_id)
      .input("lesson_id", sql.Int, lesson_id)
      .input("status", sql.NVarChar(30), status)
      .input("last_watched", sql.DateTime, last_watched || new Date())
      .query(`
        INSERT INTO CustomerProgress (customer_id, lesson_id, status, last_watched)
        VALUES (@customer_id, @lesson_id, @status, @last_watched)
      `);

    res.status(201).json({ message: "✅ Customer progress added successfully" });
  } catch (err) {
    console.error("❌ Error in POST /customer-progress:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/customer-progress/{id}:
 *   put:
 *     summary: Cập nhật tiến độ học
 *     tags: [CustomerProgress]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của tiến độ học
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProgressRequest'
 *     responses:
 *       200:
 *         description: Cập nhật tiến độ thành công
 *       404:
 *         description: Không tìm thấy tiến độ học
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 PUT /api/customer-progress/:id
 * Cập nhật tiến độ học
 */
router.put("/:id", async (req, res) => {
  const { customer_id, lesson_id, status, last_watched } = req.body;

  if (!customer_id || !lesson_id || !status) {
    return res.status(400).json({ message: "Missing required fields: customer_id, lesson_id, status" });
  }

  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input("progress_id", sql.Int, req.params.id)
      .input("customer_id", sql.Int, customer_id)
      .input("lesson_id", sql.Int, lesson_id)
      .input("status", sql.NVarChar(30), status)
      .input("last_watched", sql.DateTime, last_watched || new Date())
      .query(`
        UPDATE CustomerProgress
        SET customer_id = @customer_id,
            lesson_id = @lesson_id,
            status = @status,
            last_watched = @last_watched
        WHERE progress_id = @progress_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Progress not found" });
    }

    res.json({ message: "✅ Customer progress updated successfully" });
  } catch (err) {
    console.error("❌ Error in PUT /customer-progress/:id:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/customer-progress/{id}:
 *   delete:
 *     summary: Xóa tiến độ học
 *     tags: [CustomerProgress]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID tiến độ học cần xóa
 *     responses:
 *       200:
 *         description: Xóa tiến độ học thành công
 *       404:
 *         description: Không tìm thấy tiến độ học
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 DELETE /api/customer-progress/:id
 * Xóa tiến độ học
 */
router.delete("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("progress_id", sql.Int, req.params.id)
      .query("DELETE FROM CustomerProgress WHERE progress_id = @progress_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Progress not found" });
    }

    res.json({ message: "✅ Customer progress deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /customer-progress/:id:", err.message);
    res.status(500).send(err.message);
  }
});

module.exports = router;
