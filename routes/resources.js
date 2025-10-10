const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

/**
 * @swagger
 * tags:
 *   name: Resources
 *   description: Quản lý tài nguyên học tập (Resources API)
 */
/**
 * @swagger
 * components:
 *   schemas:
 *     Resource:
 *       type: object
 *       properties:
 *         resource_id:
 *           type: integer
 *           example: 1
 *         lesson_id:
 *           type: integer
 *           example: 5
 *         title:
 *           type: string
 *           example: "Tài liệu Đàn Tranh cơ bản"
 *         resource_type:
 *           type: string
 *           example: "pdf"
 *         url:
 *           type: string
 *           example: "https://example.com/resource.pdf"
 *         description:
 *           type: string
 *           example: "Tài liệu hướng dẫn cơ bản cho học viên mới"
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-07T10:00:00Z"
 *     CreateResourceRequest:
 *       type: object
 *       required:
 *         - lesson_id
 *         - title
 *         - resource_type
 *         - url
 *       properties:
 *         lesson_id:
 *           type: integer
 *           example: 5
 *         title:
 *           type: string
 *           example: "Slide Bài 1 - Giới thiệu"
 *         resource_type:
 *           type: string
 *           description: "Ví dụ: video | pdf | link | image"
 *           example: "pdf"
 *         url:
 *           type: string
 *           example: "https://cdn.example.com/resources/slide1.pdf"
 *         description:
 *           type: string
 *           example: "Slide tóm tắt nội dung bài học 1"
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "✅ Resource added successfully"
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Error message"
 */


/**
 * @swagger
 * /api/resources/ping:
 *   get:
 *     summary: Kiểm tra API Resources hoạt động
 *     tags: [Resources]
 *     responses:
 *       200:
 *         description: API is working
 *         content:
 *           text/plain:
 *             example: "Resources API is working!"
 */
// ✅ Test route
router.get("/ping", (req, res) => {
  res.send("Resources API is working!");
});

/**
 * @swagger
 * /api/resources:
 *   get:
 *     summary: Lấy danh sách tất cả tài nguyên học tập
 *     tags: [Resources]
 *     responses:
 *       200:
 *         description: Danh sách tài nguyên trả về thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Resource'
 *       500:
 *         description: Lỗi máy chủ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
/**
 * 📌 GET /api/resources
 * Lấy tất cả tài nguyên học tập
 */
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM Resources");
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /resources:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/resources/{id}:
 *   get:
 *     summary: Lấy thông tin chi tiết một tài nguyên theo ID
 *     tags: [Resources]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của tài nguyên
 *     responses:
 *       200:
 *         description: Thông tin tài nguyên
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Resource'
 *       404:
 *         description: Không tìm thấy tài nguyên
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Lỗi máy chủ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
/**
 * 📌 GET /api/resources/:id
 * Lấy tài nguyên theo ID
 */
router.get("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("resource_id", sql.Int, req.params.id)
      .query("SELECT * FROM Resources WHERE resource_id = @resource_id");

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Resource not found" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in GET /resources/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/resources/create:
 *   post:
 *     summary: Tạo tài nguyên học tập mới (chỉ admin hoặc employee)
 *     tags: [Resources]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Dữ liệu tạo tài nguyên (lesson_id, title, resource_type, url là bắt buộc)
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateResourceRequest'
 *     responses:
 *       201:
 *         description: Tạo tài nguyên thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               message: "✅ Resource added successfully"
 *       400:
 *         description: Thiếu thông tin bắt buộc hoặc lesson_id không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Missing required fields: lesson_id, title, resource_type, url"
 *       401:
 *         description: Không có quyền (token JWT không hợp lệ hoặc không có role)
 *       500:
 *         description: Lỗi máy chủ
 */
/**
 * 📌 POST /api/resources
 * Thêm tài nguyên mới
 * Required: lesson_id, title, resource_type, url
 */
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { lesson_id, title, resource_type, url, description } = req.body;

  if (!lesson_id || !title || !resource_type || !url) {
    return res.status(400).json({ message: "Missing required fields: lesson_id, title, resource_type, url" });
  }

  try {
    const pool = await poolPromise;

    // 🔍 Kiểm tra lesson_id có tồn tại không
    const checkLesson = await pool.request()
      .input("lesson_id", sql.Int, lesson_id)
      .query("SELECT COUNT(*) AS count FROM Lessons WHERE lesson_id = @lesson_id");

    if (checkLesson.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid lesson_id: lesson not found" });
    }

    // ✅ Thêm mới tài nguyên
    await pool.request()
      .input("lesson_id", sql.Int, lesson_id)
      .input("title", sql.NVarChar(100), title)
      .input("resource_type", sql.VarChar(10), resource_type)
      .input("url", sql.VarChar(200), url)
      .input("description", sql.NVarChar(300), description || null)
      .query(`
        INSERT INTO Resources (lesson_id, title, resource_type, url, description, created_at)
        VALUES (@lesson_id, @title, @resource_type, @url, @description, GETDATE())
      `);

    res.status(201).json({ message: "✅ Resource added successfully" });
  } catch (err) {
    console.error("❌ Error in POST /resources:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/resources/{id}:
 *   put:
 *     summary: Cập nhật thông tin tài nguyên (chỉ admin hoặc employee)
 *     tags: [Resources]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của tài nguyên cần cập nhật
 *     requestBody:
 *       description: "Trường có thể cập nhật gồm: lesson_id, title, resource_type, url, description"
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateResourceRequest'
 *     responses:
 *       200:
 *         description: Cập nhật tài nguyên thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Dữ liệu không hợp lệ (ví dụ lesson_id không tồn tại)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Không tìm thấy tài nguyên
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 PUT /api/resources/:id
 * Cập nhật tài nguyên
 */
router.put("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { lesson_id, title, resource_type, url, description } = req.body;

  if (!lesson_id || !title || !resource_type || !url) {
    return res.status(400).json({ message: "Missing required fields: lesson_id, title, resource_type, url" });
  }

  try {
    const pool = await poolPromise;

    // 🔍 Kiểm tra lesson_id có tồn tại không
    const checkLesson = await pool.request()
      .input("lesson_id", sql.Int, lesson_id)
      .query("SELECT COUNT(*) AS count FROM Lessons WHERE lesson_id = @lesson_id");

    if (checkLesson.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid lesson_id: lesson not found" });
    }

    const result = await pool.request()
      .input("resource_id", sql.Int, req.params.id)
      .input("lesson_id", sql.Int, lesson_id)
      .input("title", sql.NVarChar(100), title)
      .input("resource_type", sql.VarChar(10), resource_type)
      .input("url", sql.VarChar(200), url)
      .input("description", sql.NVarChar(300), description || null)
      .query(`
        UPDATE Resources
        SET lesson_id = @lesson_id,
            title = @title,
            resource_type = @resource_type,
            url = @url,
            description = @description
        WHERE resource_id = @resource_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Resource not found" });
    }

    res.json({ message: "✅ Resource updated successfully" });
  } catch (err) {
    console.error("❌ Error in PUT /resources/:id:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/resources/{id}:
 *   delete:
 *     summary: Xóa tài nguyên học tập (chỉ admin hoặc employee)
 *     tags: [Resources]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của tài nguyên cần xóa
 *     responses:
 *       200:
 *         description: Xóa thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Không tìm thấy tài nguyên
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 DELETE /api/resources/:id
 * Xóa tài nguyên
 */
router.delete("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("resource_id", sql.Int, req.params.id)
      .query("DELETE FROM Resources WHERE resource_id = @resource_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Resource not found" });
    }

    res.json({ message: "✅ Resource deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /resources/:id:", err.message);
    res.status(500).send(err.message);
  }
});

module.exports = router;
