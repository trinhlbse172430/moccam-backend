const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

/**
 * @swagger
 * tags:
 *   name: LessonProgress
 *   description: 🎓 API quản lý tiến độ học tập của học viên
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     LessonProgress:
 *       type: object
 *       properties:
 *         progress_id:
 *           type: integer
 *           example: 1
 *         user_id:
 *           type: integer
 *           example: 5
 *         lesson_id:
 *           type: integer
 *           example: 101
 *         status:
 *           type: string
 *           enum: [not_started, in_progress, completed]
 *           example: "in_progress"
 *         last_watched:
 *           type: string
 *           format: date-time
 *           example: "2025-10-10T10:15:00Z"
 *     UpdateProgressRequest:
 *       type: object
 *       required:
 *         - lesson_id
 *         - status
 *       properties:
 *         lesson_id:
 *           type: integer
 *           example: 101
 *         status:
 *           type: string
 *           enum: [not_started, in_progress, completed]
 *           example: "completed"
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "✅ Lesson progress updated successfully"
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Server error"
 */

/**
 * @swagger
 * /api/lesson-progress:
 *   get:
 *     summary: Lấy toàn bộ tiến độ học (chỉ admin/employee)
 *     tags: [LessonProgress]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách tiến độ học
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LessonProgress'
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT lp.*, u.full_name, l.lesson_title
      FROM LessonProgress lp
      JOIN Users u ON lp.user_id = u.user_id
      JOIN Lessons l ON lp.lesson_id = l.lesson_id
      ORDER BY lp.last_watched DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /lesson-progress:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * @swagger
 * /api/lesson-progress/{user_id}:
 *   get:
 *     summary: Lấy tiến độ học của một học viên
 *     tags: [LessonProgress]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của người dùng cần xem tiến độ học
 *     responses:
 *       200:
 *         description: Danh sách tiến độ của người dùng
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LessonProgress'
 *       403:
 *         description: Người dùng không thể xem tiến độ của người khác
 *       404:
 *         description: Không tìm thấy tiến độ học
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/:user_id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id);

    if (req.user.role === "customer" && req.user.id !== user_id) {
      return res.status(403).json({ message: "You can only view your own progress" });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input("user_id", sql.Int, user_id)
      .query(`
        SELECT lp.*, l.lesson_title
        FROM LessonProgress lp
        JOIN Lessons l ON lp.lesson_id = l.lesson_id
        WHERE lp.user_id = @user_id
        ORDER BY lp.last_watched DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /lesson-progress/:user_id:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * @swagger
 * /api/lesson-progress:
 *   post:
 *     summary: Cập nhật hoặc thêm tiến độ học (Customer)
 *     tags: [LessonProgress]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProgressRequest'
 *     responses:
 *       201:
 *         description: Cập nhật tiến độ học thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Thiếu dữ liệu bắt buộc
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */
router.post("/", verifyToken, authorizeRoles("customer"), async (req, res) => {
  const user_id = req.user.id;
  const { lesson_id, status } = req.body;

  if (!lesson_id || !status)
    return res.status(400).json({ message: "Missing required fields: lesson_id, status" });

  try {
    const pool = await poolPromise;
    await pool.request()
      .input("user_id", sql.Int, user_id)
      .input("lesson_id", sql.Int, lesson_id)
      .input("status", sql.NVarChar(30), status)
      .query(`
        IF EXISTS (SELECT 1 FROM LessonProgress WHERE user_id = @user_id AND lesson_id = @lesson_id)
          UPDATE LessonProgress
          SET status = @status, last_watched = GETDATE()
          WHERE user_id = @user_id AND lesson_id = @lesson_id;
        ELSE
          INSERT INTO LessonProgress (user_id, lesson_id, status, last_watched)
          VALUES (@user_id, @lesson_id, @status, GETDATE());
      `);

    res.status(201).json({ message: "✅ Lesson progress updated successfully" });
  } catch (err) {
    console.error("❌ Error in POST /lesson-progress:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * @swagger
 * /api/lesson-progress/{id}:
 *   put:
 *     summary: Cập nhật trạng thái tiến độ học (admin/employee hoặc chính chủ)
 *     tags: [LessonProgress]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của bản ghi tiến độ cần cập nhật
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [not_started, in_progress, completed]
 *                 example: "completed"
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       403:
 *         description: Không được phép chỉnh sửa tiến độ của người khác
 *       404:
 *         description: Không tìm thấy bản ghi
 *       500:
 *         description: Lỗi máy chủ
 */
router.put("/:id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ message: "Missing field: status" });

  try {
    const pool = await poolPromise;

    const check = await pool.request()
      .input("progress_id", sql.Int, req.params.id)
      .query("SELECT user_id FROM LessonProgress WHERE progress_id = @progress_id");

    if (check.recordset.length === 0)
      return res.status(404).json({ message: "Progress not found" });

    const recordUserId = check.recordset[0].user_id;
    if (req.user.role === "customer" && req.user.id !== recordUserId)
      return res.status(403).json({ message: "You cannot edit someone else's progress" });

    await pool.request()
      .input("progress_id", sql.Int, req.params.id)
      .input("status", sql.NVarChar(30), status)
      .query(`
        UPDATE LessonProgress
        SET status = @status, last_watched = GETDATE()
        WHERE progress_id = @progress_id
      `);

    res.json({ message: "✅ Lesson progress updated successfully" });
  } catch (err) {
    console.error("❌ Error in PUT /lesson-progress/:id:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * @swagger
 * /api/lesson-progress/{id}:
 *   delete:
 *     summary: Xóa bản ghi tiến độ học (admin/employee hoặc chính chủ)
 *     tags: [LessonProgress]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID bản ghi tiến độ cần xóa
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       403:
 *         description: Không được phép xóa bản ghi của người khác
 *       404:
 *         description: Không tìm thấy bản ghi
 *       500:
 *         description: Lỗi máy chủ
 */
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  try {
    const pool = await poolPromise;

    const check = await pool.request()
      .input("progress_id", sql.Int, req.params.id)
      .query("SELECT user_id FROM LessonProgress WHERE progress_id = @progress_id");

    if (check.recordset.length === 0)
      return res.status(404).json({ message: "Progress not found" });

    const recordUserId = check.recordset[0].user_id;
    if (req.user.role === "customer" && req.user.id !== recordUserId)
      return res.status(403).json({ message: "You cannot delete someone else's progress" });

    await pool.request()
      .input("progress_id", sql.Int, req.params.id)
      .query("DELETE FROM LessonProgress WHERE progress_id = @progress_id");

    res.json({ message: "✅ Lesson progress deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /lesson-progress/:id:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
