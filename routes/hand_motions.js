const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");


/**
 * @swagger
 * tags:
 *   name: Hand Motions
 *   description: API quản lý dữ liệu chuyển động tay (AI Motion Tracking) trong bài học
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     HandMotion:
 *       type: object
 *       properties:
 *         motion_id:
 *           type: integer
 *           example: 1
 *         lesson_id:
 *           type: integer
 *           example: 5
 *         model_id:
 *           type: integer
 *           example: 2
 *         motion_data:
 *           type: string
 *           description: Dữ liệu JSON hoặc chuỗi chứa toạ độ chuyển động tay
 *           example: '{"x":120,"y":250,"timestamp":1697032200}'
 *         description:
 *           type: string
 *           example: "Mô phỏng động tác nhấn dây trong đàn tranh"
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-10T10:00:00Z"
 *
 *     CreateHandMotionRequest:
 *       type: object
 *       required:
 *         - lesson_id
 *         - model_id
 *         - motion_data
 *       properties:
 *         lesson_id:
 *           type: integer
 *           example: 5
 *         model_id:
 *           type: integer
 *           example: 2
 *         motion_data:
 *           type: string
 *           example: '{"motion":"up-down","accuracy":98.7}'
 *         description:
 *           type: string
 *           example: "Mô hình AI ghi nhận động tác đúng chuẩn"
 *
 *     UpdateHandMotionRequest:
 *       type: object
 *       required:
 *         - lesson_id
 *         - model_id
 *         - motion_data
 *       properties:
 *         lesson_id:
 *           type: integer
 *           example: 5
 *         model_id:
 *           type: integer
 *           example: 2
 *         motion_data:
 *           type: string
 *           example: '{"motion":"down-up","accuracy":96.5}'
 *         description:
 *           type: string
 *           example: "Cập nhật mô phỏng động tác mới"
 */

/**
 * @swagger
 * /api/hand-motions/ping:
 *   get:
 *     summary: Kiểm tra API hoạt động
 *     tags: [Hand Motions]
 *     responses:
 *       200:
 *         description: API hoạt động tốt
 *         content:
 *           text/plain:
 *             example: "Hand Motions API is working!"
 */

// ✅ Test route
router.get("/ping", (req, res) => {
  res.send("Hand Motions API is working!");
});

/**
 * @swagger
 * /api/hand-motions:
 *   get:
 *     summary: Lấy danh sách tất cả hand motions
 *     tags: [Hand Motions]
 *     responses:
 *       200:
 *         description: Danh sách các hand motion
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/HandMotion'
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 GET /api/hand-motions
 * Lấy danh sách tất cả hand motions
 */
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM Hand_Motions");
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /hand-motions:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/hand-motions/{id}:
 *   get:
 *     summary: Lấy hand motion theo ID
 *     tags: [Hand Motions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của hand motion
 *     responses:
 *       200:
 *         description: Thông tin chi tiết hand motion
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HandMotion'
 *       404:
 *         description: Không tìm thấy hand motion
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 GET /api/hand-motions/:id
 * Lấy hand motion theo ID
 */
router.get("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("motion_id", sql.Int, req.params.id)
      .query("SELECT * FROM Hand_Motions WHERE motion_id = @motion_id");

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Hand motion not found" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in GET /hand-motions/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/hand-motions/create:
 *   post:
 *     summary: Tạo mới hand motion (chỉ admin hoặc employee)
 *     tags: [Hand Motions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateHandMotionRequest'
 *     responses:
 *       201:
 *         description: Tạo hand motion thành công
 *       400:
 *         description: Thiếu hoặc sai dữ liệu đầu vào
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 POST /api/hand-motions
 * Thêm hand motion mới
 * Required: lesson_id, model_id, motion_data
 */
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { lesson_id, model_id, motion_data, description } = req.body;

  if (!lesson_id || !model_id || !motion_data) {
    return res.status(400).json({ message: "Missing required fields: lesson_id, model_id, motion_data" });
  }

  try {
    const pool = await poolPromise;

    // 🔍 Kiểm tra lesson_id tồn tại
    const checkLesson = await pool.request()
      .input("lesson_id", sql.Int, lesson_id)
      .query("SELECT COUNT(*) AS count FROM Lessons WHERE lesson_id = @lesson_id");

    if (checkLesson.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid lesson_id: lesson not found" });
    }

    // 🔍 Kiểm tra model_id tồn tại
    const checkModel = await pool.request()
      .input("model_id", sql.Int, model_id)
      .query("SELECT COUNT(*) AS count FROM AI_Models WHERE model_id = @model_id");

    if (checkModel.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid model_id: model not found" });
    }

    // ✅ Thêm mới hand motion
    await pool.request()
      .input("lesson_id", sql.Int, lesson_id)
      .input("model_id", sql.Int, model_id)
      .input("motion_data", sql.NVarChar(sql.MAX), motion_data)
      .input("description", sql.NVarChar(200), description || null)
      .query(`
        INSERT INTO Hand_Motions (lesson_id, model_id, motion_data, description, created_at)
        VALUES (@lesson_id, @model_id, @motion_data, @description, GETDATE())
      `);

    res.status(201).json({ message: "✅ Hand motion added successfully" });
  } catch (err) {
    console.error("❌ Error in POST /hand-motions:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/hand-motions/{id}:
 *   put:
 *     summary: Cập nhật hand motion (chỉ admin hoặc employee)
 *     tags: [Hand Motions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của hand motion cần cập nhật
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateHandMotionRequest'
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       404:
 *         description: Không tìm thấy hand motion
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 PUT /api/hand-motions/:id
 * Cập nhật hand motion
 */
router.put("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { lesson_id, model_id, motion_data, description } = req.body;

  if (!lesson_id || !model_id || !motion_data) {
    return res.status(400).json({ message: "Missing required fields: lesson_id, model_id, motion_data" });
  }

  try {
    const pool = await poolPromise;

    // 🔍 Kiểm tra lesson_id
    const checkLesson = await pool.request()
      .input("lesson_id", sql.Int, lesson_id)
      .query("SELECT COUNT(*) AS count FROM Lessons WHERE lesson_id = @lesson_id");
    if (checkLesson.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid lesson_id: lesson not found" });
    }

    // 🔍 Kiểm tra model_id
    const checkModel = await pool.request()
      .input("model_id", sql.Int, model_id)
      .query("SELECT COUNT(*) AS count FROM AI_Models WHERE model_id = @model_id");
    if (checkModel.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid model_id: model not found" });
    }

    const result = await pool.request()
      .input("motion_id", sql.Int, req.params.id)
      .input("lesson_id", sql.Int, lesson_id)
      .input("model_id", sql.Int, model_id)
      .input("motion_data", sql.NVarChar(sql.MAX), motion_data)
      .input("description", sql.NVarChar(200), description || null)
      .query(`
        UPDATE Hand_Motions
        SET lesson_id = @lesson_id,
            model_id = @model_id,
            motion_data = @motion_data,
            description = @description
        WHERE motion_id = @motion_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Hand motion not found" });
    }

    res.json({ message: "✅ Hand motion updated successfully" });
  } catch (err) {
    console.error("❌ Error in PUT /hand-motions/:id:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/hand-motions/{id}:
 *   delete:
 *     summary: Xóa hand motion (chỉ admin hoặc employee)
 *     tags: [Hand Motions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của hand motion cần xóa
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       404:
 *         description: Không tìm thấy hand motion
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 DELETE /api/hand-motions/:id
 * Xóa hand motion
 */
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("motion_id", sql.Int, req.params.id)
      .query("DELETE FROM Hand_Motions WHERE motion_id = @motion_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Hand motion not found" });
    }

    res.json({ message: "✅ Hand motion deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /hand-motions/:id:", err.message);
    res.status(500).send(err.message);
  }
});

module.exports = router;
