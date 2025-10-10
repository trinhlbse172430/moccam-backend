const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

/**
 * @swagger
 * tags:
 *   name: AI_Models
 *   description: API quản lý các mô hình AI được huấn luyện và sử dụng trong hệ thống
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     AI_Model:
 *       type: object
 *       properties:
 *         model_id:
 *           type: integer
 *           example: 1
 *         model_name:
 *           type: string
 *           example: "ChatGPT-5"
 *         version:
 *           type: string
 *           example: "v1.2.0"
 *         description:
 *           type: string
 *           example: "Mô hình AI hỗ trợ xử lý ngôn ngữ tự nhiên và trả lời hội thoại thông minh."
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-10T08:30:00Z"
 *
 *     CreateAIModelRequest:
 *       type: object
 *       required:
 *         - model_name
 *         - version
 *       properties:
 *         model_name:
 *           type: string
 *           example: "VoiceGen V3"
 *         version:
 *           type: string
 *           example: "3.0"
 *         description:
 *           type: string
 *           example: "Mô hình tạo giọng nói tiếng Việt tự nhiên."
 *
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "✅ AI Model added successfully"
 */

/**
 * @swagger
 * /api/ai-models/ping:
 *   get:
 *     summary: Kiểm tra API hoạt động
 *     tags: [AI_Models]
 *     responses:
 *       200:
 *         description: API đang hoạt động
 *         content:
 *           text/plain:
 *             example: "AI_Models API is working!"
 */
// ✅ Test route
router.get("/ping", (req, res) => {
  res.send("AI_Models API is working!");
});

/**
 * @swagger
 * /api/ai-models:
 *   get:
 *     summary: Lấy danh sách tất cả mô hình AI
 *     tags: [AI_Models]
 *     responses:
 *       200:
 *         description: Danh sách mô hình AI
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AI_Model'
 *       500:
 *         description: Lỗi máy chủ
 */
/**
 * 📌 GET /api/ai-models
 * Lấy toàn bộ danh sách mô hình AI
 */
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM AI_Models");
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /ai-models:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/ai-models/{id}:
 *   get:
 *     summary: Lấy thông tin mô hình AI theo ID
 *     tags: [AI_Models]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của mô hình AI
 *     responses:
 *       200:
 *         description: Thông tin chi tiết của mô hình AI
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AI_Model'
 *       404:
 *         description: Không tìm thấy mô hình AI
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 GET /api/ai-models/:id
 * Lấy mô hình AI theo ID
 */
router.get("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("model_id", sql.Int, req.params.id)
      .query("SELECT * FROM AI_Models WHERE model_id = @model_id");

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "AI Model not found" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in GET /ai-models/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/ai-models/create:
 *   post:
 *     summary: Thêm mô hình AI mới (chỉ admin hoặc employee)
 *     tags: [AI_Models]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateAIModelRequest'
 *     responses:
 *       201:
 *         description: Thêm mô hình AI thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Thiếu dữ liệu bắt buộc
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 POST /api/ai-models
 * Thêm mới mô hình AI
 * Required: model_name, version
 */

router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { model_name, version, description } = req.body;

  if (!model_name || !version) {
    return res.status(400).json({ message: "Missing required fields: model_name, version" });
  }

  try {
    const pool = await poolPromise;
    await pool.request()
      .input("model_name", sql.NVarChar(30), model_name)
      .input("version", sql.VarChar(10), version)
      .input("description", sql.NVarChar(200), description || null)
      .query(`
        INSERT INTO AI_Models (model_name, version, description, created_at)
        VALUES (@model_name, @version, @description, GETDATE())
      `);

    res.status(201).json({ message: "✅ AI Model added successfully" });
  } catch (err) {
    console.error("❌ Error in POST /ai-models:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/ai-models/{id}:
 *   put:
 *     summary: Cập nhật thông tin mô hình AI (chỉ admin hoặc employee)
 *     tags: [AI_Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của mô hình cần cập nhật
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateAIModelRequest'
 *     responses:
 *       200:
 *         description: Cập nhật mô hình AI thành công
 *       404:
 *         description: Không tìm thấy mô hình AI
 *       400:
 *         description: Thiếu dữ liệu đầu vào
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 PUT /api/ai-models/:id
 * Cập nhật thông tin mô hình AI
 */
router.put("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { model_name, version, description } = req.body;

  if (!model_name || !version) {
    return res.status(400).json({ message: "Missing required fields: model_name, version" });
  }

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("model_id", sql.Int, req.params.id)
      .input("model_name", sql.NVarChar(30), model_name)
      .input("version", sql.VarChar(10), version)
      .input("description", sql.NVarChar(200), description || null)
      .query(`
        UPDATE AI_Models
        SET model_name = @model_name,
            version = @version,
            description = @description
        WHERE model_id = @model_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "AI Model not found" });
    }

    res.json({ message: "✅ AI Model updated successfully" });
  } catch (err) {
    console.error("❌ Error in PUT /ai-models/:id:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/ai-models/{id}:
 *   delete:
 *     summary: Xóa mô hình AI (chỉ admin hoặc employee)
 *     tags: [AI_Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của mô hình cần xóa
 *     responses:
 *       200:
 *         description: Xóa mô hình AI thành công
 *       404:
 *         description: Không tìm thấy mô hình AI
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 DELETE /api/ai-models/:id
 * Xóa mô hình AI
 */
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("model_id", sql.Int, req.params.id)
      .query("DELETE FROM AI_Models WHERE model_id = @model_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "AI Model not found" });
    }

    res.json({ message: "✅ AI Model deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /ai-models/:id:", err.message);
    res.status(500).send(err.message);
  }
});

module.exports = router;
