const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

/**
 * @swagger
 * tags:
 *   name: LessonsProgress
 *   description: 🎓 API quản lý tiến độ học tập và bảng xếp hạng người học
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     LessonProgress:
 *       type: object
 *       properties:
 *         user_id:
 *           type: integer
 *           example: 5
 *         lesson_id:
 *           type: integer
 *           example: 12
 *         status:
 *           type: string
 *           example: "completed"
 *         last_watched:
 *           type: string
 *           format: date-time
 *           example: "2025-10-09T15:00:00Z"
 *     LeaderboardEntry:
 *       type: object
 *       properties:
 *         user_id:
 *           type: integer
 *           example: 7
 *         full_name:
 *           type: string
 *           example: "Nguyễn Văn A"
 *         total_points:
 *           type: integer
 *           example: 250
 *         streak_days:
 *           type: integer
 *           example: 5
 *         last_updated:
 *           type: string
 *           format: date-time
 *           example: "2025-10-09T15:00:00Z"
 *     UpdateLessonProgressRequest:
 *       type: object
 *       required:
 *         - lesson_id
 *         - status
 *       properties:
 *         lesson_id:
 *           type: integer
 *           example: 12
 *         status:
 *           type: string
 *           enum: [in-progress, completed]
 *           example: "completed"
 */

/**
 * @swagger
 * /api/lessons/progress:
 *   post:
 *     summary: Cập nhật tiến độ học của bài học (LessonProgress)
 *     description: 
 *       Ghi nhận tiến độ học của người dùng hiện tại. Nếu `status = completed`, hệ thống sẽ:  
 *       - Cập nhật `LessonProgress`  
 *       - Ghi log hoạt động trong ngày (`UserActivityLog`)  
 *       - Cập nhật điểm thưởng và streak trong `Leaderboard`
 *     tags: [LessonsProgress]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateLessonProgressRequest'
 *     responses:
 *       200:
 *         description: Cập nhật tiến độ thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "✅ Lesson progress updated"
 *       400:
 *         description: Thiếu thông tin hoặc dữ liệu không hợp lệ
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */
router.post("/lessons/progress", verifyToken, authorizeRoles("customer"), async (req, res) => {
  const userId = req.user?.id;
  const { lesson_id, status } = req.body;

  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  if (!lesson_id || !status) return res.status(400).json({ message: "Missing fields: lesson_id or status" });

  const normalizedStatus = String(status).trim().toLowerCase();

  let transaction;
  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const tr = transaction.request();
    tr.input("user_id", sql.Int, userId);
    tr.input("lesson_id", sql.Int, lesson_id);
    tr.input("status", sql.NVarChar(30), normalizedStatus);

    // 🧩 Cập nhật tiến độ hoặc thêm mới
    await tr.query(`
      IF EXISTS (SELECT 1 FROM LessonProgress WHERE user_id = @user_id AND lesson_id = @lesson_id)
        UPDATE LessonProgress
        SET status = @status, last_watched = GETDATE()
        WHERE user_id = @user_id AND lesson_id = @lesson_id;
      ELSE
        INSERT INTO LessonProgress (user_id, lesson_id, status, last_watched)
        VALUES (@user_id, @lesson_id, @status, GETDATE());
    `);

    // 🎯 Nếu hoàn thành bài học → cập nhật hoạt động & leaderboard
    if (normalizedStatus === "completed") {
      await tr.query(`
        IF NOT EXISTS (SELECT 1 FROM UserActivityLog WHERE user_id = @user_id AND activity_date = CAST(GETDATE() AS DATE))
          INSERT INTO UserActivityLog (user_id, activity_date) VALUES (@user_id, CAST(GETDATE() AS DATE));
      `);

      const prevDayRes = await tr.query(`
        SELECT COUNT(*) AS cnt
        FROM UserActivityLog
        WHERE user_id = @user_id
          AND activity_date = DATEADD(day, -1, CAST(GETDATE() AS DATE));
      `);
      const hadYesterday = prevDayRes.recordset[0].cnt > 0;

      const streakRes = await tr.query(`
        SELECT streak_days, total_points
        FROM Leaderboard
        WHERE user_id = @user_id;
      `);

      let newStreak = hadYesterday
        ? (streakRes.recordset[0]?.streak_days || 0) + 1
        : 1;

      // 🔢 Tính điểm và bonus
      let basePoints = 10;
      let bonus = 0;
      if (newStreak === 7) bonus = 10;
      else if (newStreak === 14) bonus = 15;

      const gainPoints = basePoints + bonus;
      tr.input("points", sql.Int, gainPoints);
      tr.input("streak_days", sql.Int, newStreak);

      await tr.query(`
        IF EXISTS (SELECT 1 FROM Leaderboard WHERE user_id = @user_id)
          UPDATE Leaderboard
          SET total_points = total_points + @points,
              streak_days = @streak_days,
              last_updated = GETDATE()
          WHERE user_id = @user_id;
        ELSE
          INSERT INTO Leaderboard (user_id, total_points, streak_days, last_updated)
          VALUES (@user_id, @points, @streak_days, GETDATE());
      `);
    }

    await transaction.commit();
    return res.json({ message: "✅ Lesson progress updated" });
  } catch (err) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error("Error in /lessons/progress:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * @swagger
 * /api/leaderboard:
 *   get:
 *     summary: Lấy top 10 người dùng có điểm cao nhất trên bảng xếp hạng
 *     tags: [LessonsProgress]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách top 10 leaderboard
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LeaderboardEntry'
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/leaderboard", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT TOP 10 L.user_id, U.full_name, L.total_points, L.streak_days, L.last_updated
      FROM Leaderboard L
      JOIN Users U ON L.user_id = U.user_id
      ORDER BY L.total_points DESC, L.streak_days DESC, L.last_updated DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("Error in GET /leaderboard:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * @swagger
 * /api/leaderboard/{user_id}:
 *   get:
 *     summary: Lấy thông tin bảng xếp hạng của một người dùng cụ thể
 *     tags: [LessonsProgress]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID người dùng cần xem leaderboard
 *     responses:
 *       200:
 *         description: Trả về thông tin điểm và streak của user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LeaderboardEntry'
 *       403:
 *         description: Không được phép xem thông tin của người khác
 *       404:
 *         description: Không tìm thấy người dùng trong leaderboard
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/leaderboard/:user_id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  try {
    if (req.user.role === "customer" && req.user.id !== parseInt(req.params.user_id)) {
      return res.status(403).json({ message: "You can only view your own leaderboard info" });
    }

    const pool = await poolPromise;
    const q = await pool.request()
      .input("user_id", sql.Int, req.params.user_id)
      .query(`
        SELECT L.user_id, U.full_name, L.total_points, L.streak_days, L.last_updated
        FROM Leaderboard L
        JOIN Users U ON L.user_id = U.user_id
        WHERE L.user_id = @user_id
      `);

    if (q.recordset.length === 0)
      return res.status(404).json({ message: "User not found in leaderboard" });

    res.json(q.recordset[0]);
  } catch (err) {
    console.error("Error in GET /leaderboard/:user_id:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
