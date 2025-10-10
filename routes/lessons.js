const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

/**
 * @swagger
 * tags:
 *   name: Lessons
 *   description: API quản lý bài học trong hệ thống khóa học
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Lesson:
 *       type: object
 *       properties:
 *         lesson_id:
 *           type: integer
 *           example: 1
 *         course_id:
 *           type: integer
 *           example: 2
 *         lesson_name:
 *           type: string
 *           example: "Introduction to Đàn Tranh"
 *         description:
 *           type: string
 *           example: "Hướng dẫn cơ bản về cấu tạo và cách chơi đàn Tranh."
 *         video_url:
 *           type: string
 *           example: "https://example.com/video.mp4"
 *         picture_url:
 *           type: string
 *           example: "https://example.com/image.jpg"
 *         is_free:
 *           type: boolean
 *           example: true
 *         created_at:
 *           type: string
 *           example: "2025-10-07T12:00:00Z"
 *     CreateLesson:
 *       type: object
 *       required:
 *         - course_id
 *         - lesson_name
 *       properties:
 *         course_id:
 *           type: integer
 *           example: 1
 *         lesson_name:
 *           type: string
 *           example: "Cách lên dây đàn Tranh"
 *         description:
 *           type: string
 *           example: "Chi tiết từng bước trong việc lên dây đàn Tranh."
 *         video_url:
 *           type: string
 *           example: "https://example.com/lesson1.mp4"
 *         picture_url:
 *           type: string
 *           example: "https://example.com/lesson1.jpg"
 *         is_free:
 *           type: boolean
 *           example: false
 */

/**
 * @swagger
 * /api/payments/ping:
 *   get:
 *     summary: Kiểm tra API hoạt động
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Lessons API is working
 */
// ✅ Test route
router.get("/ping", (req, res) => {
  res.send("Lessons API is working!");
});

/**
 * 📌 GET /api/lessons
 * Lấy toàn bộ danh sách bài học
 */
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM Lessons");
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /lessons:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/lessons:
 *   get:
 *     summary: Lấy danh sách tất cả bài học
 *     tags: [Lessons]
 *     responses:
 *       200:
 *         description: Danh sách bài học được trả về
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Lesson'
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * @swagger
 * /api/lessons/{id}:
 *   get:
 *     summary: Lấy thông tin chi tiết một bài học theo ID
 *     tags: [Lessons]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của bài học
 *     responses:
 *       200:
 *         description: Trả về thông tin bài học
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Lesson'
 *       404:
 *         description: Không tìm thấy bài học
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 GET /api/lessons/:id
 * Lấy thông tin bài học theo ID
 */
router.get("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("lesson_id", sql.Int, req.params.id)
      .query("SELECT * FROM Lessons WHERE lesson_id = @lesson_id");

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in GET /lessons/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/lessons/create:
 *   post:
 *     summary: Thêm mới một bài học (Admin hoặc Employee)
 *     tags: [Lessons]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateLesson'
 *     responses:
 *       201:
 *         description: Tạo bài học thành công
 *         content:
 *           application/json:
 *             example:
 *               message: "✅ Lesson added successfully"
 *       400:
 *         description: Thiếu thông tin hoặc dữ liệu không hợp lệ
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 POST /api/lessons
 * Thêm mới bài học
 * Required: course_id, lesson_name
 */
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { course_id, lesson_name, description, video_url, picture_url, is_free } = req.body;

  // Kiểm tra dữ liệu bắt buộc
  if (!course_id || !lesson_name) {
    return res.status(400).json({ message: "Missing required fields: course_id, lesson_name" });
  }

  try {
    const pool = await poolPromise;
    const is_free = is_free ? 1 : 0;
    const checkCourse = await pool.request()
      .input("course_id", sql.Int, course_id)
      .query("SELECT COUNT(*) AS count FROM Courses WHERE course_id = @course_id");
    if (checkCourse.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid course_id: course not found" });
    }

    await pool.request()
      .input("course_id", sql.Int, course_id)
      .input("lesson_name", sql.NVarChar(100), lesson_name)
      .input("description", sql.NVarChar(200), description || null)
      .input("video_url", sql.VarChar(300), video_url || null)
      .input("picture_url", sql.VarChar(300), picture_url || null)
      .input("is_free", sql.Bit, is_free)
      .query(`
        INSERT INTO Lessons (course_id, lesson_name, description, video_url, picture_url, is_free, created_at)
        VALUES (@course_id, @lesson_name, @description, @video_url, @picture_url, @is_free, GETDATE())
      `);

    res.status(201).json({ message: "✅ Lesson added successfully" });
  } catch (err) {
    console.error("❌ Error in POST /lessons:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/lessons/{id}:
 *   put:
 *     summary: Cập nhật thông tin bài học theo ID (Admin hoặc Employee)
 *     tags: [Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của bài học cần cập nhật
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateLesson'
 *     responses:
 *       200:
 *         description: Cập nhật bài học thành công
 *         content:
 *           application/json:
 *             example:
 *               message: "✅ Lesson updated successfully"
 *       404:
 *         description: Không tìm thấy bài học
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 PUT /api/lessons/:id
 * Cập nhật bài học theo ID
 */
router.put("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { course_id, lesson_name, description, video_url, picture_url, is_free } = req.body;

  if (!course_id || !lesson_name) {
    return res.status(400).json({ message: "Missing required fields: course_id, lesson_name" });
  }

  try {
    const pool = await poolPromise;
    const is_free = is_free ? 1 : 0;
    const checkCourse = await pool.request()
      .input("course_id", sql.Int, course_id)
      .query("SELECT COUNT(*) AS count FROM Courses WHERE course_id = @course_id");
    if (checkCourse.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid course_id: course not found" });
    }

    const result = await pool.request()
      .input("lesson_id", sql.Int, req.params.id)
      .input("course_id", sql.Int, course_id)
      .input("lesson_name", sql.NVarChar(100), lesson_name)
      .input("description", sql.NVarChar(200), description || null)
      .input("video_url", sql.VarChar(300), video_url || null)
      .input("picture_url", sql.VarChar(300), picture_url || null)
      .input("is_free", sql.Bit, is_free)
      .query(`
        UPDATE Lessons
        SET course_id = @course_id,
            lesson_name = @lesson_name,
            description = @description,
            video_url = @video_url,
            picture_url = @picture_url,
            is_free = @is_free
        WHERE lesson_id = @lesson_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    res.json({ message: "✅ Lesson updated successfully" });
  } catch (err) {
    console.error("❌ Error in PUT /lessons/:id:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * @swagger
 * /api/lessons/{id}:
 *   delete:
 *     summary: Xóa bài học theo ID (Admin hoặc Employee)
 *     tags: [Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của bài học cần xóa
 *     responses:
 *       200:
 *         description: Xóa thành công
 *         content:
 *           application/json:
 *             example:
 *               message: "✅ Lesson deleted successfully"
 *       404:
 *         description: Không tìm thấy bài học
 *       500:
 *         description: Lỗi máy chủ
 */

/**
 * 📌 DELETE /api/lessons/:id
 * Xóa bài học
 */
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("lesson_id", sql.Int, req.params.id)
      .query("DELETE FROM Lessons WHERE lesson_id = @lesson_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    res.json({ message: "✅ Lesson deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /lessons/:id:", err.message);
    res.status(500).send(err.message);
  }
});

module.exports = router;
