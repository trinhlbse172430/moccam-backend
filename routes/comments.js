const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// ✅ Test route
router.get("/ping", (req, res) => {
  res.send("Comments API is working!");
});

/**
 * 📌 GET /api/comments
 * Lấy danh sách tất cả bình luận
 */
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT c.*, cu.full_name AS customer_name, l.lesson_name
      FROM Comments c
      JOIN Customers cu ON c.customer_id = cu.customer_id
      JOIN Lessons l ON c.lesson_id = l.lesson_id
      ORDER BY c.created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /comments:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 GET /api/comments/:id
 * Lấy bình luận theo ID
 */
router.get("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("comment_id", sql.Int, req.params.id)
      .query(`
        SELECT c.*, cu.full_name AS customer_name, l.lesson_name
        FROM Comments c
        JOIN Customers cu ON c.customer_id = cu.customer_id
        JOIN Lessons l ON c.lesson_id = l.lesson_id
        WHERE c.comment_id = @comment_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Comment not found" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in GET /comments/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 GET /api/comments/lesson/:lesson_id
 * Lấy tất cả bình luận của một bài học
 */
router.get("/lesson/:lesson_id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("lesson_id", sql.Int, req.params.lesson_id)
      .query(`
        SELECT c.*, cu.full_name AS customer_name
        FROM Comments c
        JOIN Customers cu ON c.customer_id = cu.customer_id
        WHERE c.lesson_id = @lesson_id
        ORDER BY c.created_at DESC
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "No comments found for this lesson" });
    }

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /comments/lesson/:lesson_id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 POST /api/comments
 * Thêm bình luận mới
 * Required: customer_id, lesson_id, comment, rate
 */
router.post("/create", verifyToken, authorizeRoles("customer"), async (req, res) => {
  const { customer_id, lesson_id, comment, rate } = req.body;

  if (!customer_id || !lesson_id || !comment || rate === undefined) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  if (rate < 1 || rate > 5) {
    return res.status(400).json({ message: "Rate must be between 1 and 5" });
  }

  try {
    const pool = await poolPromise;

    // 🔍 Kiểm tra customer_id
    const checkCustomer = await pool.request()
      .input("customer_id", sql.Int, customer_id)
      .query("SELECT COUNT(*) AS count FROM Customers WHERE customer_id = @customer_id");

    if (checkCustomer.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid customer_id: customer not found" });
    }

    // 🔍 Kiểm tra lesson_id
    const checkLesson = await pool.request()
      .input("lesson_id", sql.Int, lesson_id)
      .query("SELECT COUNT(*) AS count FROM Lessons WHERE lesson_id = @lesson_id");

    if (checkLesson.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid lesson_id: lesson not found" });
    }

    // ✅ Thêm bình luận
    await pool.request()
      .input("customer_id", sql.Int, customer_id)
      .input("lesson_id", sql.Int, lesson_id)
      .input("comment", sql.NVarChar(500), comment)
      .input("rate", sql.Int, rate)
      .query(`
        INSERT INTO Comments (customer_id, lesson_id, comment, rate, created_at)
        VALUES (@customer_id, @lesson_id, @comment, @rate, GETDATE())
      `);

    res.status(201).json({ message: "✅ Comment added successfully" });
  } catch (err) {
    console.error("❌ Error in POST /comments:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * 📌 PUT /api/comments/:id
 * Cập nhật bình luận
 */
router.put("/:id", verifyToken, authorizeRoles("customer"), async (req, res) => {
  const { comment, rate } = req.body;

  if (!comment || rate === undefined) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  if (rate < 1 || rate > 5) {
    return res.status(400).json({ message: "Rate must be between 1 and 5" });
  }

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("comment_id", sql.Int, req.params.id)
      .input("comment", sql.NVarChar(500), comment)
      .input("rate", sql.Int, rate)
      .query(`
        UPDATE Comments
        SET comment = @comment,
            rate = @rate
        WHERE comment_id = @comment_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Comment not found" });
    }

    res.json({ message: "✅ Comment updated successfully" });
  } catch (err) {
    console.error("❌ Error in PUT /comments/:id:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * 📌 DELETE /api/comments/:id
 * Xóa bình luận
 */
router.delete("/:id", verifyToken, authorizeRoles("admin", "customer"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("comment_id", sql.Int, req.params.id)
      .query("DELETE FROM Comments WHERE comment_id = @comment_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Comment not found" });
    }

    res.json({ message: "✅ Comment deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /comments/:id:", err.message);
    res.status(500).send(err.message);
  }
});

module.exports = router;
