const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

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
